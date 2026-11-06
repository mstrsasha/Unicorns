"use client";

import { useEffect, useState } from "react";
import { getRank, RANKS } from "@/lib/rank";

function useCountUp(target: number, ms: number): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 1 : ms;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export default function RankBadge({ total }: { total: number }) {
  const rank = getRank(total);
  const shown = useCountUp(rank ? Math.min(100, Math.max(0, Math.round(total))) : 0, 800);

  return (
    <section className="rank" style={{ ["--rank" as string]: rank.color }}>
      <div className="rank-top">
        <div className={`rank-icon rank-${rank.id}`} aria-hidden>
          {rank.emoji}
        </div>
        <div>
          <div className="rank-score">
            <b>{shown}</b>
            <span>/100</span>
          </div>
          <div className="rank-title">{rank.title}</div>
        </div>
      </div>
      <p className="rank-tagline">«{rank.tagline}»</p>
      <ol className="doneness" aria-label={`Прожарка: ${rank.doneness}`}>
        {RANKS.map((r) => (
          <li key={r.id} className={r.id === rank.id ? "on" : ""}>
            {r.doneness}
          </li>
        ))}
      </ol>
    </section>
  );
}
