import { handle } from "@/lib/guard";
import { completeJson } from "@/lib/llm";
import { SYSTEM_PROMPT } from "@/lib/persona";
import { evaluatePrompt } from "@/lib/prompts";
import { EvaluateLlmSchema, EvaluateRequest } from "@/lib/schemas";
import { normalizeEvaluation } from "@/lib/scoring";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, EvaluateRequest, async (body) => {
    const raw = await completeJson(EvaluateLlmSchema, {
      system: SYSTEM_PROMPT,
      user: evaluatePrompt(body),
      maxTokens: 3000,
      modelEnv: "LLM_EVAL_MODEL",
      mock: { task: "evaluate" },
    });
    // Ровно 10 критериев, ровно 3 совета и итог из 100 — в коде.
    return normalizeEvaluation(raw);
  });
}
