/* eslint-disable @next/next/no-img-element */

type Props = { pose: number; size?: "lg" | "md" | "sm"; busy?: boolean };

export default function Pasha({ pose, size = "md", busy }: Props) {
  const p = Math.min(6, Math.max(1, Math.round(pose)));
  return (
    <div className={`pasha pasha-${size}${busy ? " pasha-busy" : ""}`}>
      <img key={p} src={`/pasha/pose-${p}.png`} alt="Паша Соколов, бизнес-ангел, в боксёрских перчатках" />
    </div>
  );
}
