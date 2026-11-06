import { CRITERIA } from "@/lib/criteria";
import { labelAnchor, pointAt, polygon, toPointsAttr } from "@/lib/radar-geometry";
import type { CriterionResult } from "@/lib/schemas";

type Props = {
  criteria: CriterionResult[];
  previous?: Pick<CriterionResult, "id" | "score" | "max">[];
  total: number;
};

const SIZE = 400;
const C = SIZE / 2;
const R = 118;
const N = 10;

function values(list: Pick<CriterionResult, "id" | "score" | "max">[]): number[] {
  return CRITERIA.map((c) => {
    const r = list.find((x) => x.id === c.id);
    if (!r || !Number.isFinite(r.score) || !r.max) return 0;
    return Math.min(1, Math.max(0, r.score / r.max));
  });
}

export default function Radar({ criteria, previous, total }: Props) {
  if (criteria.length !== N) {
    console.warn("Radar: ожидалось 10 критериев, получено", criteria.length);
    return null;
  }
  const cur = polygon(values(criteria), R, C, C);
  const prev = previous && previous.length ? polygon(values(previous), R, C, C) : null;

  return (
    <figure className="radar">
      <svg viewBox={`-70 10 ${SIZE + 140} ${SIZE - 20}`} role="img" aria-label={`Радар оценки, общий балл ${total} из 100`}>
        {[1, 2, 3].map((lvl) => (
          <polygon
            key={lvl}
            className="radar-ring"
            points={toPointsAttr(polygon(Array(N).fill(lvl / 3), R, C, C))}
          />
        ))}
        {CRITERIA.map((c, i) => {
          const p = pointAt(i, N, R, C, C);
          return <line key={c.id} className="radar-spoke" x1={C} y1={C} x2={p.x} y2={p.y} />;
        })}
        {prev && <polygon className="radar-prev" points={toPointsAttr(prev)} />}
        <g className="radar-grow" style={{ transformOrigin: `${C}px ${C}px` }}>
          <polygon className="radar-shape" points={toPointsAttr(cur)} />
          {cur.map((p, i) => (
            <circle key={i} className="radar-dot" cx={p.x} cy={p.y} r={4} />
          ))}
        </g>
        {CRITERIA.map((c, i) => {
          const p = pointAt(i, N, R + 20, C, C);
          const dy = p.y < C - R ? -2 : p.y > C + R ? 12 : 4;
          return (
            <text key={c.id} className="radar-label" x={p.x} y={p.y + dy} textAnchor={labelAnchor(i, N)}>
              {c.short}
            </text>
          );
        })}
      </svg>
      <ul className="sr-only">
        {criteria.map((c) => (
          <li key={c.id}>
            {c.name}: {c.score} из {c.max}
          </li>
        ))}
      </ul>
    </figure>
  );
}
