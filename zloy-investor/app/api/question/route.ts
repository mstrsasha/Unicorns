import { handle } from "@/lib/guard";
import { completeJson } from "@/lib/llm";
import { SYSTEM_PROMPT } from "@/lib/persona";
import { questionPrompt } from "@/lib/prompts";
import { QuestionLlmSchema, QuestionRequest } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, QuestionRequest, async (body) => {
    const accepted = body.history.length + (body.pending ? 1 : 0);

    const r = await completeJson(QuestionLlmSchema, {
      system: SYSTEM_PROMPT,
      user: questionPrompt(body),
      maxTokens: 700,
      mock: { task: "question", round: accepted + 1, hasPending: !!body.pending },
    });

    // Повтор допускается один раз на вопрос; второй раз ответ засчитывается как есть.
    const repeat = !!body.pending && !body.pending.repeated && !r.previous_answer_ok;

    return {
      repeat,
      reaction: r.reaction_to_previous.slice(0, 400),
      question: r.question.slice(0, 600),
    };
  });
}
