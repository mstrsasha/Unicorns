import type { z } from "zod";
import { mockComplete, type MockHint } from "./mock";

/**
 * Адаптер LLM-провайдера. Переключается переменной окружения LLM_PROVIDER:
 *  - anthropic (по умолчанию) — Claude Messages API
 *  - openai — любой OpenAI-совместимый /chat/completions (LLM_BASE_URL)
 *  - mock — заглушка без сети, только для проверки интерфейса
 * Ключ берётся только из env на сервере и никогда не уходит на клиент.
 */

export type CompleteArgs = {
  system: string;
  user: string;
  maxTokens?: number;
  /** Имя переменной окружения с моделью для этого шага (по умолчанию LLM_MODEL). */
  modelEnv?: string;
  mock: MockHint;
};

export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 55_000;

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function model(args: CompleteArgs, fallback: string): string {
  return (args.modelEnv && env(args.modelEnv)) || env("LLM_MODEL") || fallback;
}

async function callAnthropic(args: CompleteArgs): Promise<string> {
  // Сначала через tool use (валидный JSON гарантирует API). Некоторые прокси отказывают
  // в tool use с 5xx — тогда тот же запрос обычным текстом.
  try {
    return await callAnthropicOnce(args, true);
  } catch (e) {
    if (e instanceof LlmError && e.status !== undefined && e.status >= 500) return callAnthropicOnce(args, false);
    throw e;
  }
}

async function callAnthropicOnce(args: CompleteArgs, useTool: boolean): Promise<string> {
  const { system, user, maxTokens } = args;
  const key = env("LLM_API_KEY") || env("ANTHROPIC_API_KEY");
  if (!key) throw new LlmError("LLM_API_KEY не задан");
  const base = env("LLM_BASE_URL").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
  // Прокси (например, ai.starimg.ru) принимают ключ как Bearer-токен.
  if (base) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${base || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model(args, "claude-sonnet-5-5"),
      max_tokens: maxTokens ?? 1500,
      system,
      messages: [{ role: "user", content: user }],
      ...(useTool
        ? {
            tools: [
              {
                name: "respond",
                description: "Верни ответ строго по схеме, описанной в задаче.",
                input_schema: { type: "object", additionalProperties: true },
              },
            ],
            tool_choice: { type: "tool", name: "respond" },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new LlmError(`Провайдер ответил ${res.status}`, res.status);
  const data = (await res.json()) as { content?: { type: string; text?: string; input?: unknown }[] };
  const tool = (data.content ?? []).find((c) => c.type === "tool_use");
  if (tool && tool.input && typeof tool.input === "object") return JSON.stringify(tool.input);
  return (data.content ?? []).map((c) => (c.type === "text" ? c.text ?? "" : "")).join("");
}

async function callOpenAi(args: CompleteArgs): Promise<string> {
  const { system, user, maxTokens } = args;
  const key = env("LLM_API_KEY") || env("OPENAI_API_KEY");
  if (!key) throw new LlmError("LLM_API_KEY не задан");
  const res = await fetch(`${env("LLM_BASE_URL") || "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model(args, "gpt-4o-mini"),
      max_tokens: maxTokens ?? 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new LlmError(`Провайдер ответил ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function complete(args: CompleteArgs): Promise<string> {
  const provider = env("LLM_PROVIDER") || "anthropic";
  switch (provider) {
    case "anthropic":
      return callAnthropic(args);
    case "openai":
      return callOpenAi(args);
    case "mock":
      return mockComplete(args.mock);
    default:
      throw new LlmError(`Неизвестный LLM_PROVIDER: ${provider}`);
  }
}

/** Достаёт первый JSON-объект из ответа модели (на случай обрамления ```json). */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmError("В ответе модели нет JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/** Структурированный ответ с проверкой схемой: при невалидном JSON — один повтор. */
export async function completeJson<S extends z.ZodType>(schema: S, args: CompleteArgs): Promise<z.infer<S>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await complete(
        attempt === 0
          ? args
          : { ...args, user: `${args.user}\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ. Верни строго один JSON-объект по описанной схеме.` },
      );
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
    } catch (e) {
      lastError = e;
      if (e instanceof Error && (e.name === "TimeoutError" || e.message.includes("LLM_API_KEY"))) break;
    }
  }
  throw lastError instanceof Error ? lastError : new LlmError("Не удалось получить ответ модели");
}
