/**
 * Заглушка провайдера (LLM_PROVIDER=mock). Нужна только чтобы прогнать интерфейс без ключа.
 * Ничего не анализирует и в проде не используется.
 */
export type MockHint =
  | { task: "start" }
  | { task: "question"; round: number; hasPending: boolean }
  | { task: "explain" }
  | { task: "evaluate" };

const QUESTIONS = [
  "Слышь, спортсмен. Забудь умные слова. Опиши мне одного живого клиента: как он решает свою проблему прямо сейчас?",
  "Окей, клиент есть. С чего он достанет кошелёк? Сколько он платит за решение сегодня?",
  "Я в твоей нише не эксперт. Назови трёх конкурентов, с кем ты дерёшься, и почему клиент уйдёт к тебе.",
  "Ты говоришь, что общался с людьми. Что тебя в этих разговорах реально удивило?",
  "Последнее. Получишь диплом, денег нет, все устали. Бросишь проект или продолжишь? Зачем тебе это?",
];

export function mockComplete(hint: MockHint): string {
  switch (hint.task) {
    case "start":
      return JSON.stringify({
        verdict: "ok",
        manipulation_detected: false,
        missing_fields: [],
        reply: "",
        facts: {
          project: "Проект",
          stage: "",
          team: "",
          problem: "",
          customer: "",
          solution: "",
          traction: [],
          monetization: "",
          ask: "",
          competitors_mentioned: [],
          claims_without_evidence: [],
          contradictions: [],
          red_flags: [],
          numbers: {},
        },
      });
    case "question":
      return JSON.stringify({
        previous_answer_ok: true,
        reaction_to_previous: hint.hasPending ? "*отхлёбывает кофе* Допустим. Идём дальше." : "",
        question: QUESTIONS[Math.min(hint.round, 5) - 1],
        target_criteria: [1],
        grounding: "mock",
      });
    case "explain":
      return JSON.stringify({ explanation: "По-простому: я спрашиваю, сколько денег уходит, чтобы найти одного платящего клиента." });
    case "evaluate":
      return JSON.stringify({
        criteria: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          score: (i * 7) % 4,
          evidence: "Заглушка: данные не анализировались.",
          source: i % 4 === 0 ? "none" : "pitch",
          delta_from_answers: i % 3 === 0 ? 1 : 0,
        })),
        verdict_line: "Это тестовый режим, братан. Подключи модель — тогда поговорим по-взрослому.",
        advice: [
          { action: "Напиши 10 потенциальным клиентам и спроси, как они решают проблему сейчас", why: "Нет живых фактов", deadline_days: 2, done_when: "Есть 5 ответов" },
          { action: "Посчитай на бумажке, сколько стоит привлечь одного клиента", why: "Нет экономики", deadline_days: 1, done_when: "Есть одна цифра с формулой" },
          { action: "Выпиши 3 причины, почему проект сдохнет", why: "Риски не названы", deadline_days: 1, done_when: "3 риска и по одному действию на каждый" },
        ],
      });
    default: {
      const never: never = hint;
      return never;
    }
  }
}
