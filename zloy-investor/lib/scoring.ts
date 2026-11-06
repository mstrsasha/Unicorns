import { CRITERIA, MAX_SCORE } from "./criteria";
import type { Advice, CriterionResult, Evaluation } from "./schemas";
import { EvaluateLlmSchema } from "./schemas";
import type { z } from "zod";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/** Σ(score/3 × вес). Считается в коде, модель итог не видит и не выбирает. */
export function computeTotal(criteria: Pick<CriterionResult, "id" | "score">[]): number {
  let total = 0;
  for (const c of CRITERIA) {
    const r = criteria.find((x) => x.id === c.id);
    total += (clamp(r?.score ?? 0, 0, MAX_SCORE) / MAX_SCORE) * c.weight;
  }
  return Math.round(total);
}

/**
 * Приводит ответ модели к гарантированному виду: ровно 10 критериев, ровно 3 совета,
 * баллы 0–3, «нет данных» = 0, срок 1–7 дней.
 */
export function normalizeEvaluation(raw: z.infer<typeof EvaluateLlmSchema>): Evaluation {
  const criteria: CriterionResult[] = CRITERIA.map((c) => {
    const r = raw.criteria.find((x) => x.id === c.id);
    const source = r?.source?.trim() || "none";
    const noData = !r || source === "none";
    return {
      id: c.id,
      name: c.name,
      score: noData ? 0 : Math.round(clamp(r.score, 0, MAX_SCORE)),
      max: MAX_SCORE,
      evidence: noData ? "Нет данных ни в питче, ни в ответах." : r.evidence.slice(0, 400),
      source: noData ? "none" : source.slice(0, 20),
      delta_from_answers: noData ? 0 : Math.round(clamp(r.delta_from_answers, -1, 1)),
    };
  });

  const advice: Advice[] = raw.advice.slice(0, 3).map((a) => ({
    action: a.action.slice(0, 300),
    why: a.why.slice(0, 300),
    deadline_days: Math.round(clamp(a.deadline_days, 1, 7)),
    done_when: a.done_when.slice(0, 300),
  }));

  return {
    criteria,
    total_100: computeTotal(criteria),
    verdict_line: raw.verdict_line.slice(0, 300),
    advice,
  };
}
