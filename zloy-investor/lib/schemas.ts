import { z } from "zod";

// Лояльные примитивы: если модель вернула мусор в необязательном поле, подставляем безопасное значение.
const str = z.string().catch("");
const strs = z.array(z.string()).catch([]);
const num = z.number().finite().nullable().catch(null);

export const LIMITS = { pitch: 8000, answer: 2000, minPitch: 200 } as const;

// ---------- Факты из питча ----------
export const NumbersSchema = z
  .object({
    marketing_spend: num,
    paying_customers: num,
    paid_transactions: num,
    price: num,
    commission_pct: num,
    unit_cost: num,
    audience: num,
    conversion_pct: num,
    batch_size: num,
  })
  .catch({
    marketing_spend: null,
    paying_customers: null,
    paid_transactions: null,
    price: null,
    commission_pct: null,
    unit_cost: null,
    audience: null,
    conversion_pct: null,
    batch_size: null,
  });

export const FactsSchema = z.object({
  project: str,
  stage: str,
  team: str,
  problem: str,
  customer: str,
  solution: str,
  traction: strs,
  monetization: str,
  ask: str,
  competitors_mentioned: strs,
  claims_without_evidence: strs,
  contradictions: strs,
  red_flags: strs,
  numbers: NumbersSchema,
});
export type Facts = z.infer<typeof FactsSchema>;
export type Numbers = z.infer<typeof NumbersSchema>;

export const VERDICTS = ["ok", "too_little", "not_a_pitch", "manipulation_only"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const StartLlmSchema = z.object({
  verdict: z.enum(VERDICTS),
  manipulation_detected: z.boolean().catch(false),
  missing_fields: strs,
  reply: str,
  facts: FactsSchema.nullable().catch(null),
});

export type Metric = { id: string; label: string; value: number; formula: string };

// ---------- Вопрос ----------
export const QuestionLlmSchema = z.object({
  previous_answer_ok: z.boolean().catch(true),
  reaction_to_previous: str,
  question: z.string().min(5),
  target_criteria: z.array(z.number()).catch([]),
  grounding: str,
});

// ---------- Объяснение ----------
export const ExplainLlmSchema = z.object({ explanation: z.string().min(3) });

// ---------- Оценка ----------
export const EvaluateLlmSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.number(),
      score: z.number().catch(0),
      evidence: str,
      source: str,
      delta_from_answers: z.number().catch(0),
    }),
  ),
  verdict_line: str,
  advice: z
    .array(
      z.object({
        action: z.string().min(3),
        why: str,
        deadline_days: z.number().catch(2),
        done_when: str,
      }),
    )
    .min(3),
});

export type CriterionResult = {
  id: number;
  name: string;
  score: number;
  max: number;
  evidence: string;
  source: string;
  delta_from_answers: number;
};
export type Advice = { action: string; why: string; deadline_days: number; done_when: string };
export type Evaluation = {
  criteria: CriterionResult[];
  total_100: number;
  verdict_line: string;
  advice: Advice[];
};

// ---------- Входящие запросы ----------
const clip = (max: number) => z.string().transform((s) => s.slice(0, max));

export const QaSchema = z.object({ question: clip(1000), answer: clip(LIMITS.answer) });
export type QA = z.infer<typeof QaSchema>;

export const StartRequest = z.object({ pitch: z.string().max(100_000) });

const SessionCore = {
  pitch: clip(LIMITS.pitch),
  facts: FactsSchema,
  metrics: z
    .array(z.object({ id: clip(40), label: clip(200), value: z.number().finite(), formula: clip(300) }))
    .max(10),
  history: z.array(QaSchema).max(5),
};

// Ровно 5 вопросов гарантирует код: после 5 принятых ответов новый вопрос не выдаётся.
export const QuestionRequest = z
  .object({
    ...SessionCore,
    pending: z.object({ question: clip(1000), answer: clip(LIMITS.answer), repeated: z.boolean() }).nullable(),
  })
  .refine((b) => b.history.length + (b.pending ? 1 : 0) < 5);

export const ExplainRequest = z.object({ pitch: clip(LIMITS.pitch), question: clip(1000) });

export const EvaluateRequest = z.object({ ...SessionCore, history: z.array(QaSchema).length(5) });
