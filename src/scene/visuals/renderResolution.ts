/** Native phone detail without unbounded buffers on tablets or large monitors. */
export function renderPixelRatio(width: number, height: number, nativeRatio: number, touch: boolean, maxDimension: number) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const budget = touch ? 3_500_000 : 6_000_000;
  return Math.min(Math.max(1, nativeRatio || 1), 3, Math.sqrt(budget / (w * h)), maxDimension / w, maxDimension / h);
}
