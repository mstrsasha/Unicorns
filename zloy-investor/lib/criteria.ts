export type Criterion = {
  id: number;
  name: string;
  short: string;
  /** Вес для архетипа «Бизнес-ангел». Сумма весов = 100. */
  weight: number;
};

export const CRITERIA: readonly Criterion[] = [
  { id: 1, name: "Реалистичность решения проблемы", short: "Решение", weight: 10 },
  { id: 2, name: "Бизнес-модель", short: "Модель", weight: 10 },
  { id: 3, name: "Анализ рынка и конкурентов", short: "Рынок", weight: 8 },
  { id: 4, name: "Финансовая модель", short: "Финансы", weight: 8 },
  { id: 5, name: "Интеллектуальная собственность или регистрация", short: "ИС", weight: 4 },
  { id: 6, name: "Первые продажи", short: "Продажи", weight: 14 },
  { id: 7, name: "Риски", short: "Риски", weight: 8 },
  { id: 8, name: "Горизонт расчёта", short: "Горизонт", weight: 6 },
  { id: 9, name: "Уникальность продукта", short: "Уникальность", weight: 14 },
  { id: 10, name: "Инвестиционная привлекательность и мотивация команды", short: "Инвест", weight: 18 },
];

export const MAX_SCORE = 3;
