// Half-extents per ruleset; origin is court center. Values from spec court table.
export interface HalfExtent { x: number; y: number; }
const FULL: Record<string, { l: number; w: number }> = {
  fiba: { l: 28.0, w: 15.0 },
  nba:  { l: 94.0, w: 50.0 },
  ncaa: { l: 94.0, w: 50.0 },
  nfhs: { l: 84.0, w: 50.0 },
};
export function halfExtent(ruleset: string): HalfExtent | null {
  const f = FULL[ruleset];
  if (!f) return null;
  return { x: f.w / 2, y: f.l / 2 };
}
