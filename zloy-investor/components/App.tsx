"use client";

import { useEffect, useRef, useState } from "react";
import Pasha from "./Pasha";
import Radar from "./Radar";
import RankBadge from "./RankBadge";
import { CRITERIA } from "@/lib/criteria";
import { PERSONA, ROUNDS } from "@/lib/persona";
import { getRank } from "@/lib/rank";
import { clearRound, loadRound, saveRound, type StoredRound } from "@/lib/round-store";
import { LIMITS, type Evaluation, type Facts, type Metric, type QA, type Verdict } from "@/lib/schemas";

type Stage = "intro" | "filtered" | "dialog" | "result";

type Session = {
  pitch: string;
  facts: Facts;
  metrics: Metric[];
  history: QA[];
  current: { reaction: string; question: string } | null;
  repeated: boolean;
  explainsLeft: number;
  manipulation: boolean;
};

type Filtered = { verdict: Exclude<Verdict, "ok">; reply: string; missing: string[]; manipulation: boolean };

type StartResponse =
  | { verdict: "ok"; manipulation_detected: boolean; facts: Facts; metrics: Metric[]; pitch: string; truncated: boolean }
  | { verdict: Exclude<Verdict, "ok">; manipulation_detected: boolean; missing_fields: string[]; reply: string; truncated: boolean };

type QuestionResponse = { repeat: boolean; reaction: string; question: string };

type Saved = { stage: Stage; session: Session | null; evaluation: Evaluation | null; round: number; prev: StoredRound | null };

const SESSION_KEY = "zi:session:v1";

const THINKING = [
  "*отхлёбывает кофе* Читаю…",
  "*щурится, глядя в текст*",
  "*разминает шею*",
  "*откидывается назад и думает*",
];

async function api<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error("Связь пропала или Паша думает слишком долго. Попробуй ещё раз.");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? "Что-то пошло не так. Попробуй ещё раз.");
  return data;
}

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeech(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function App() {
  const [stage, setStage] = useState<Stage>("intro");
  const [pitch, setPitch] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [filtered, setFiltered] = useState<Filtered | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(THINKING[0]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [prev, setPrev] = useState<StoredRound | null>(null);
  const [listening, setListening] = useState(false);
  const [hasSpeech, setHasSpeech] = useState(false);
  const [restored, setRestored] = useState(false);

  const retryRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const recRef = useRef<InstanceType<SpeechCtor> | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Восстановление после перезагрузки страницы (sessionStorage доступен только в браузере, поэтому в эффекте)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasSpeech(!!getSpeech());
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        if (s && typeof s === "object" && typeof s.round === "number") {
          if (s.stage === "dialog" && s.session?.current) {
            setSession(s.session);
            setStage("dialog");
          } else if (s.stage === "result" && s.evaluation && s.session) {
            setSession(s.session);
            setEvaluation(s.evaluation);
            setStage("result");
          }
          setRound(s.round);
          setPrev(s.prev ?? null);
          if (s.session?.pitch) setPitch(s.session.pitch);
        }
      }
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      const s: Saved = { stage, session, evaluation, round, prev };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, [restored, stage, session, evaluation, round, prev]);

  useEffect(() => {
    if (!busy) return;
    let i = 0;
    const t = setInterval(() => setThinking(THINKING[++i % THINKING.length]), 1800);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage]);

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return; // защита от двойного клика
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setThinking(THINKING[0]);
    retryRef.current = () => void run(action);
    try {
      await action();
      retryRef.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Что-то пошло не так.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function askQuestion(s: Session, pending: { question: string; answer: string; repeated: boolean } | null) {
    const r = await api<QuestionResponse>("/api/question", {
      pitch: s.pitch,
      facts: s.facts,
      metrics: s.metrics,
      history: s.history,
      pending,
    });
    const history = pending && !r.repeat ? [...s.history, { question: pending.question, answer: pending.answer }] : s.history;
    setSession({ ...s, history, current: { reaction: r.reaction, question: r.question }, repeated: r.repeat });
    setAnswer("");
    setExplanation(null);
  }

  function startRound() {
    void run(async () => {
      const r = await api<StartResponse>("/api/start", { pitch });
      setNotice(r.truncated ? `Питч длиннее ${LIMITS.pitch} символов — Паша прочитал только начало.` : null);
      if (r.verdict !== "ok") {
        setFiltered({ verdict: r.verdict, reply: r.reply, missing: r.missing_fields, manipulation: r.manipulation_detected });
        setStage("filtered");
        return;
      }
      const s: Session = {
        pitch: r.pitch,
        facts: r.facts,
        metrics: r.metrics,
        history: [],
        current: null,
        repeated: false,
        explainsLeft: 2,
        manipulation: r.manipulation_detected,
      };
      await askQuestion(s, null);
      setStage("dialog");
    });
  }

  function submitAnswer() {
    if (!session?.current) return;
    const text = answer.trim().slice(0, LIMITS.answer);
    if (!text) return;
    stopListening();
    const pending = { question: session.current.question, answer: text, repeated: session.repeated };
    const s = session;
    void run(async () => {
      if (s.history.length >= 4) {
        const history = [...s.history, { question: pending.question, answer: pending.answer }];
        const ev = await api<Evaluation>("/api/evaluate", {
          pitch: s.pitch,
          facts: s.facts,
          metrics: s.metrics,
          history,
        });
        setSession({ ...s, history, current: null });
        setEvaluation(ev);
        setStage("result");
        saveRound({
          round,
          pitch: s.pitch,
          total: ev.total_100,
          criteria: ev.criteria.map((c) => ({ id: c.id, score: c.score, max: c.max })),
          advice: ev.advice.map((a) => ({ action: a.action, deadline_days: a.deadline_days, done_when: a.done_when })),
        });
        return;
      }
      await askQuestion(s, pending);
    });
  }

  function explain() {
    if (!session?.current || session.explainsLeft <= 0) return;
    const s = session;
    void run(async () => {
      const r = await api<{ explanation: string }>("/api/explain", { pitch: s.pitch, question: s.current!.question });
      setExplanation(r.explanation);
      setSession({ ...s, explainsLeft: s.explainsLeft - 1 });
    });
  }

  function stopListening() {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }

  function toggleVoice() {
    if (listening) return stopListening();
    const Ctor = getSpeech();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.continuous = true;
    const base = answer.trim();
    let said = "";
    rec.onresult = (e) => {
      said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript + " ";
      setAnswer(((base ? base + " " : "") + said.trim()).slice(0, LIMITS.answer));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function resetAll(keepPitch: boolean) {
    stopListening();
    setSession(null);
    setEvaluation(null);
    setFiltered(null);
    setExplanation(null);
    setAnswer("");
    setError(null);
    setNotice(null);
    if (!keepPitch) setPitch("");
    setStage("intro");
  }

  function rematch() {
    const last = loadRound();
    resetAll(true);
    if (last) {
      setPrev(last);
      setRound(last.round + 1);
      setPitch(last.pitch);
    }
  }

  function startOver() {
    clearRound();
    setPrev(null);
    setRound(1);
    resetAll(false);
  }

  const qNo = session ? Math.min(5, session.history.length + 1) : 1;
  const roundInfo = ROUNDS[qNo - 1];
  const pose = busy ? 2 : stage === "dialog" ? roundInfo.pose : stage === "intro" ? 1 : 6;

  return (
    <main className="app" ref={topRef}>
      <header className="top">
        <div className="brand">
          ЗЛОЙ <span>ИНВЕСТОР</span>
        </div>
        {round > 1 && <div className="round-chip">Раунд {round}</div>}
      </header>

      {stage === "intro" && (
        <section className="screen intro">
          <div className="hero">
            <Pasha pose={pose} size="lg" busy={busy} />
            <div className="hero-text">
              <p className="kicker">Спарринг перед защитой</p>
              <h1>{PERSONA.name}</h1>
              <p className="sub">
                {PERSONA.archetype}. {PERSONA.tagline}
              </p>
              <div className="bubble">
                {busy
                  ? thinking
                  : "Слышь, спортсмен. Кидай свой проект текстом — прочитаю. Потом 5 вопросов, оценка и 3 совета. Хвалить не буду."}
              </div>
            </div>
          </div>

          {prev && (
            <div className="card prev-advice">
              <h3>Раунд {round}: что ты обещал сделать</h3>
              <ul>
                {prev.advice.map((a, i) => (
                  <li key={i}>
                    {a.action} <small>· до {a.deadline_days} дн.</small>
                  </li>
                ))}
              </ul>
              <p className="muted">Прошлый результат: {prev.total}/100 ({getRank(prev.total).title}). Обнови питч и выходи снова.</p>
            </div>
          )}

          <label className="field">
            <span>Описание стартапа</span>
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value.slice(0, 20_000))}
              placeholder={"Проект, команда, стадия.\nПроблема: у кого и что болит.\nКлиент: кто платит.\nЧто уже сделано — с цифрами.\nКак зарабатываете.\nЧто хотите получить."}
              rows={10}
              disabled={busy}
            />
            <small className={pitch.length > LIMITS.pitch ? "warn" : "muted"}>
              {pitch.length} / {LIMITS.pitch}
            </small>
          </label>
          <div className="actions">
            <button className="btn primary" onClick={startRound} disabled={busy || !pitch.trim()}>
              {busy ? "Паша читает…" : "На ринг"}
            </button>
            {(prev || round > 1) && (
              <button className="btn ghost" onClick={startOver} disabled={busy}>
                Начать с нуля
              </button>
            )}
          </div>
          <p className="privacy">Без регистрации. Питч никуда не сохраняется, кроме твоего браузера.</p>
        </section>
      )}

      {stage === "filtered" && filtered && (
        <section className="screen">
          <div className="duo">
            <Pasha pose={6} size="md" />
            <div className="bubble big">{filtered.reply}</div>
          </div>
          <div className="card">
            <h3>Чего не хватает</h3>
            <ul className="missing">
              {filtered.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <p className="muted">Оценку не ставлю: оценивать пока нечего.</p>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => setStage("intro")}>
              Исправить питч
            </button>
          </div>
        </section>
      )}

      {stage === "dialog" && session?.current && (
        <section className="screen dialog">
          <div className="progress" aria-label={`Вопрос ${qNo} из 5`}>
            {ROUNDS.map((r, i) => (
              <span key={r.name} className={i < session.history.length ? "done" : i === qNo - 1 ? "now" : ""}>
                {r.name}
              </span>
            ))}
          </div>
          <div className="duo">
            <Pasha pose={pose} size="md" busy={busy} />
            <div className="bubble big">
              <div className="q-label">
                Вопрос {qNo}/5 · {roundInfo.name}
              </div>
              {busy ? (
                <p className="thinking">{thinking}</p>
              ) : (
                <>
                  {session.manipulation && session.history.length === 0 && (
                    <p className="reaction">Просьбу поставить высокий балл я видел. Не работает. Давай по фактам.</p>
                  )}
                  {session.current.reaction && <p className="reaction">{session.current.reaction}</p>}
                  <p className="question">{session.current.question}</p>
                  {explanation && <p className="explain">{explanation}</p>}
                </>
              )}
            </div>
          </div>

          <label className="field">
            <span className="sr-only">Твой ответ</span>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, LIMITS.answer))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitAnswer();
              }}
              placeholder="Отвечай коротко и с цифрами. 30–60 секунд."
              rows={5}
              disabled={busy}
            />
            <small className="muted">
              {answer.length} / {LIMITS.answer}
            </small>
          </label>
          <div className="actions">
            <button className="btn primary" onClick={submitAnswer} disabled={busy || !answer.trim()}>
              {qNo === 5 ? "Ответить и получить оценку" : "Ответить"}
            </button>
            {hasSpeech && (
              <button className={`btn ghost${listening ? " rec" : ""}`} onClick={toggleVoice} disabled={busy}>
                {listening ? "■ Стоп" : "🎤 Голосом"}
              </button>
            )}
            <button className="btn ghost" onClick={explain} disabled={busy || session.explainsLeft <= 0}>
              Не понял вопрос ({session.explainsLeft})
            </button>
          </div>
        </section>
      )}

      {stage === "result" && evaluation && (
        <Result
          evaluation={evaluation}
          prev={prev}
          onRematch={rematch}
          onStartOver={startOver}
        />
      )}

      {notice && stage !== "result" && <p className="notice">{notice}</p>}
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          {retryRef.current && (
            <button className="btn small" onClick={() => retryRef.current?.()} disabled={busy}>
              Повторить
            </button>
          )}
        </div>
      )}
    </main>
  );
}

function Result({
  evaluation,
  prev,
  onRematch,
  onStartOver,
}: {
  evaluation: Evaluation;
  prev: StoredRound | null;
  onRematch: () => void;
  onStartOver: () => void;
}) {
  const delta = prev ? evaluation.total_100 - prev.total : null;
  const rankBefore = prev ? getRank(prev.total) : null;
  const rankAfter = getRank(evaluation.total_100);

  return (
    <section className="screen result">
      <div className="duo">
        <Pasha pose={6} size="md" />
        <div className="bubble big">{evaluation.verdict_line || rankAfter.tagline}</div>
      </div>

      <RankBadge total={evaluation.total_100} />

      {prev && delta !== null && rankBefore && (
        <div className={`card compare ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
          <div className="compare-delta">
            {delta > 0 ? `+${delta}` : delta}
            <small> к прошлому раунду</small>
          </div>
          <p>
            {rankBefore.title} → {rankAfter.title}
            {rankAfter.min > rankBefore.min ? " · Ранг вырос!" : ""}
          </p>
          {delta <= 0 && <p className="muted">Цифры не сдвинулись. Проверь, что закрыл хотя бы один из трёх советов.</p>}
        </div>
      )}

      <Radar criteria={evaluation.criteria} previous={prev?.criteria} total={evaluation.total_100} />
      {prev && <p className="legend">Пунктир — прошлый раунд</p>}

      <div className="card">
        <h3>3 совета до сцены</h3>
        <ol className="advice">
          {evaluation.advice.map((a, i) => (
            <li key={i}>
              <div className="advice-head">
                <b>{a.action}</b>
                <span className="deadline">до {a.deadline_days} дн.</span>
              </div>
              {a.why && <p>Зачем: {a.why}</p>}
              {a.done_when && <p className="muted">Готово, когда: {a.done_when}</p>}
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h3>Оценка по критериям</h3>
        <ul className="criteria">
          {evaluation.criteria.map((c) => {
            const p = prev?.criteria.find((x) => x.id === c.id);
            const d = p ? c.score - p.score : null;
            return (
              <li key={c.id}>
                <div className="crit-head">
                  <span>{CRITERIA.find((x) => x.id === c.id)?.name ?? c.name}</span>
                  <span className="score">
                    {[0, 1, 2].map((k) => (
                      <i key={k} className={k < c.score ? "on" : ""} />
                    ))}
                    <b>
                      {c.score}/{c.max}
                    </b>
                  </span>
                </div>
                <p className="evidence">{c.evidence}</p>
                <div className="tags">
                  <span className="tag">{sourceLabel(c.source)}</span>
                  {c.delta_from_answers !== 0 && (
                    <span className={`tag ${c.delta_from_answers > 0 ? "pos" : "neg"}`}>
                      после ответов: {c.delta_from_answers > 0 ? "+" : ""}
                      {c.delta_from_answers}
                    </span>
                  )}
                  {d !== null && d !== 0 && (
                    <span className={`tag ${d > 0 ? "pos" : "neg"}`}>
                      к прошлому раунду: {d > 0 ? "+" : ""}
                      {d}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={onRematch}>
          Реванш
        </button>
        <button className="btn ghost" onClick={onStartOver}>
          Новый проект
        </button>
      </div>
    </section>
  );
}

function sourceLabel(source: string): string {
  if (source === "pitch") return "из питча";
  if (source === "none") return "нет данных";
  const m = /^answer_(\d)$/.exec(source);
  return m ? `ответ на вопрос ${m[1]}` : source;
}
