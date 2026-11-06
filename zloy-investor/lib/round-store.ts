import { z } from "zod";

const KEY = "zi:last-round:v1";

const StoredRoundSchema = z.object({
  version: z.literal(1),
  round: z.number().int().min(1),
  savedAt: z.string(),
  pitch: z.string().max(8000),
  total: z.number(),
  criteria: z.array(z.object({ id: z.number(), score: z.number(), max: z.number() })),
  advice: z.array(z.object({ action: z.string(), deadline_days: z.number(), done_when: z.string() })),
});
export type StoredRound = z.infer<typeof StoredRoundSchema>;

/** Только числа, советы и питч для предзаполнения. Ни ответов, ни evidence. Всё — в браузере студента. */
export function loadRound(): StoredRound | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = StoredRoundSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveRound(data: Omit<StoredRound, "version" | "savedAt">): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...data, version: 1, savedAt: new Date().toISOString() }));
  } catch {
    /* storage недоступен — реванш просто не сработает */
  }
}

export function clearRound(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
