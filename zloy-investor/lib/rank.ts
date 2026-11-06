export type RankId = "donkey" | "pony" | "horse" | "steed" | "unicorn";

export type RankInfo = {
  id: RankId;
  title: string;
  doneness: string;
  min: number;
  max: number;
  tagline: string;
  color: string;
  emoji: string;
};

export const RANKS: readonly RankInfo[] = [
  { id: "donkey", title: "Ослик", doneness: "Rare", min: 0, max: 24, tagline: "Идея есть. Пока это всё, что у вас есть.", color: "#8a8f98", emoji: "🐴" },
  { id: "pony", title: "Пони", doneness: "Medium Rare", min: 25, max: 44, tagline: "Бежите, но пока не туда, куда нужно инвестору.", color: "#d9824b", emoji: "🐴" },
  { id: "horse", title: "Конь", doneness: "Medium", min: 45, max: 64, tagline: "Рабочая лошадка. До единорога не хватает цифр.", color: "#c9a227", emoji: "🐎" },
  { id: "steed", title: "Скакун", doneness: "Medium Well", min: 65, max: 79, tagline: "Уже интересно. Закройте две дыры, и я выпишу чек.", color: "#4caf7a", emoji: "🏇" },
  { id: "unicorn", title: "Единорог", doneness: "Well done", min: 80, max: 100, tagline: "Редкий случай. Идите защищаться, пока я не передумал.", color: "#b07cff", emoji: "🦄" },
];

export function getRank(total: number): RankInfo {
  const t = Number.isFinite(total) ? Math.min(100, Math.max(0, Math.round(total))) : 0;
  return RANKS.find((r) => t >= r.min && t <= r.max) ?? RANKS[0];
}
