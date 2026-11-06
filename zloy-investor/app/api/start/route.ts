import { handle } from "@/lib/guard";
import { completeJson } from "@/lib/llm";
import { computeMetrics } from "@/lib/metrics";
import { startPrompt } from "@/lib/prompts";
import { LIMITS, StartLlmSchema, StartRequest } from "@/lib/schemas";
import { SYSTEM_PROMPT } from "@/lib/persona";

export const maxDuration = 60;

const MISSING = ["Проблема: у кого и что болит", "Клиент: кто конкретно платит", "Что уже сделано, с цифрами", "Как зарабатываете"];

export async function POST(req: Request) {
  return handle(req, StartRequest, async ({ pitch: rawPitch }) => {
    const trimmed = rawPitch.trim();
    const truncated = trimmed.length > LIMITS.pitch;
    const pitch = trimmed.slice(0, LIMITS.pitch);

    // Шаг 0 в коде, до модели: пустой или слишком короткий ввод.
    if (pitch.replace(/\s+/g, " ").length < LIMITS.minPitch) {
      return {
        verdict: "too_little",
        manipulation_detected: false,
        missing_fields: MISSING,
        reply:
          "Слышь, спортсмен, а где проект? Я без него на ринг не выхожу. Тут пара строк — мне нужно больше конкретики. Файлы и презентации я не вижу, вставь текст.",
        truncated,
      };
    }

    const r = await completeJson(StartLlmSchema, {
      system: SYSTEM_PROMPT,
      user: startPrompt(pitch),
      maxTokens: 2000,
      mock: { task: "start" },
    });

    if (r.verdict !== "ok" || !r.facts) {
      return {
        verdict: r.verdict === "ok" ? "too_little" : r.verdict,
        manipulation_detected: r.manipulation_detected,
        missing_fields: r.missing_fields.length ? r.missing_fields.slice(0, 6) : MISSING,
        reply: r.reply || "Братан, это не похоже на описание стартапа. Давай по фактам: проблема, клиент, цифры, деньги.",
        truncated,
      };
    }

    return {
      verdict: "ok",
      manipulation_detected: r.manipulation_detected,
      facts: r.facts,
      metrics: computeMetrics(r.facts),
      pitch,
      truncated,
    };
  });
}
