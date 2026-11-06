import type { z } from "zod";

/** Простой in-memory rate limit по IP (на инстанс). */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, { count: number; reset: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function rateLimited(req: Request): boolean {
  const ip = clientIp(req);
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }
  const rec = hits.get(ip);
  if (!rec || rec.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  rec.count++;
  return rec.count > MAX_PER_WINDOW;
}

export function fail(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Общая обёртка API-маршрута: rate limit, разбор JSON, проверка схемой, понятные ошибки без утечки деталей. */
export async function handle<S extends z.ZodType>(
  req: Request,
  schema: S,
  fn: (body: z.infer<S>) => Promise<unknown>,
): Promise<Response> {
  if (rateLimited(req)) return fail(429, "Слишком много запросов. Отдышись минуту и попробуй снова.");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Некорректный запрос.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(400, "Некорректный запрос.");
  try {
    return Response.json(await fn(parsed.data));
  } catch (e) {
    // Тексты питчей не логируем: только тип ошибки.
    console.error("[api]", e instanceof Error ? `${e.name}: ${e.message.slice(0, 120)}` : "unknown");
    return fail(502, "Паша отошёл за кофе: модель не ответила. Попробуй ещё раз.");
  }
}
