export type Pt = { x: number; y: number };

/** Ось 0 сверху, далее по часовой стрелке. */
export function axisAngle(i: number, n: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / n;
}

export function pointAt(i: number, n: number, r: number, cx: number, cy: number): Pt {
  const a = axisAngle(i, n);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** values — доли 0..1 */
export function polygon(values: number[], radius: number, cx: number, cy: number): Pt[] {
  return values.map((v, i) => pointAt(i, values.length, radius * Math.min(1, Math.max(0, v || 0)), cx, cy));
}

export function toPointsAttr(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function labelAnchor(i: number, n: number): "start" | "middle" | "end" {
  const x = Math.cos(axisAngle(i, n));
  if (Math.abs(x) < 0.2) return "middle";
  return x > 0 ? "start" : "end";
}
