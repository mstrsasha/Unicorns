import { handle } from "@/lib/guard";
import { completeJson } from "@/lib/llm";
import { SYSTEM_PROMPT } from "@/lib/persona";
import { explainPrompt } from "@/lib/prompts";
import { ExplainLlmSchema, ExplainRequest } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, ExplainRequest, async ({ pitch, question }) => {
    const r = await completeJson(ExplainLlmSchema, {
      system: SYSTEM_PROMPT,
      user: explainPrompt(pitch, question),
      maxTokens: 400,
      mock: { task: "explain" },
    });
    return { explanation: r.explanation.slice(0, 600) };
  });
}
