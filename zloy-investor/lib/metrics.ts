import type { Facts, Metric } from "./schemas";

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;
const pos = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

/**
 * Производные метрики считаются в коде, а не моделью: модель видит готовый результат с формулой
 * и не может «насчитать» лишнего.
 */
export function computeMetrics(facts: Facts): Metric[] {
  const n = facts.numbers;
  const out: Metric[] = [];

  // Выручка платформы с одной сделки
  let revenuePerDeal: number | null = null;
  if (pos(n.price) && pos(n.commission_pct)) {
    revenuePerDeal = (n.price * n.commission_pct) / 100;
    out.push({
      id: "revenue_per_deal",
      label: "Выручка с одной сделки",
      value: revenuePerDeal,
      formula: `${rub(n.price)} × ${n.commission_pct}% = ${rub(revenuePerDeal)}`,
    });
  } else if (pos(n.price)) {
    revenuePerDeal = n.price;
  }

  // CAC
  const buyers = pos(n.paying_customers) ? n.paying_customers : pos(n.paid_transactions) ? n.paid_transactions : null;
  if (pos(n.marketing_spend) && buyers !== null) {
    const cac = n.marketing_spend / buyers;
    const unit = pos(n.paying_customers) ? "платящего клиента" : "оплаченную сделку";
    out.push({
      id: "cac",
      label: `Стоимость привлечения (CAC) на ${unit}`,
      value: cac,
      formula: `${rub(n.marketing_spend)} / ${buyers} = ${rub(cac)}`,
    });
    if (revenuePerDeal !== null && revenuePerDeal > 0) {
      const ratio = cac / revenuePerDeal;
      out.push({
        id: "cac_to_revenue",
        label: "Во сколько раз привлечение дороже выручки с одной сделки",
        value: Math.round(ratio * 10) / 10,
        formula: `${rub(cac)} / ${rub(revenuePerDeal)} ≈ ${ratio.toFixed(1)}×`,
      });
    }
  }

  // Маржа на единицу
  if (pos(n.price) && pos(n.unit_cost)) {
    const margin = n.price - n.unit_cost;
    out.push({
      id: "unit_margin",
      label: "Маржа на единицу до комиссий, логистики и возвратов",
      value: margin,
      formula: `${rub(n.price)} − ${rub(n.unit_cost)} = ${rub(margin)}`,
    });
    if (pos(n.batch_size)) {
      const batch = n.batch_size * n.unit_cost;
      out.push({
        id: "batch_cost",
        label: "Стоимость заявленной партии",
        value: batch,
        formula: `${n.batch_size} × ${rub(n.unit_cost)} = ${rub(batch)}`,
      });
    }
  }

  // Выручка «если заявленные цифры правда» — для проверки противоречий
  if (pos(n.audience) && pos(n.conversion_pct) && pos(n.price)) {
    const claimed = (n.audience * n.conversion_pct * n.price) / 100;
    out.push({
      id: "claimed_revenue",
      label: "Выручка, если заявленные цифры правда",
      value: claimed,
      formula: `${n.audience.toLocaleString("ru-RU")} × ${n.conversion_pct}% × ${rub(n.price)} = ${rub(claimed)}`,
    });
  }

  return out;
}
