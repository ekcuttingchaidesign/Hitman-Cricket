/**
 * Super10's career card, rung by rung (Figma section 22, 613:5379): the
 * shapes behind the words, in the card's own 362 by 214, shared by the page
 * (`cardMarkup`, drawn as an SVG) and the painted share card
 * (`paintTierCard`, drawn as paths), so the two cannot drift apart. The
 * colours of each rung's material are the page's CSS (`.st-card.is-super10`)
 * and the painter's `SUPER10_MATERIALS`.
 *
 * Debutant: three violet slashes at the brand's 12° lean. Emerging Player:
 * brushed violet, its grain drawn by each (no shapes). Star: two lightning
 * shards in outline, where the Blast's Star has its star. Hitman: nested gold
 * plates at the 12° lean out of the top right corner, where the Blast's has
 * its gold rings, the second of them in Volt.
 */

export interface CardShape {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  opacity: number;
}

/** A plate leaning `lean` degrees, centred on (cx, cy). */
function plate(cx: number, cy: number, w: number, h: number, lean: number): string {
  const dx = Math.tan((lean * Math.PI) / 180) * h / 2;
  const p = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  return `M${p(cx - w / 2 + dx, cy - h / 2)} L${p(cx + w / 2 + dx, cy - h / 2)} L${p(cx + w / 2 - dx, cy + h / 2)} L${p(cx - w / 2 - dx, cy + h / 2)}Z`;
}

export const SUPER10_CARD_ART: Record<string, readonly CardShape[]> = {
  debutant: [
    { d: 'M232 214 L277 0 L301 0 L256 214Z', fill: '#8B5CF6', opacity: 0.14 },
    { d: 'M270 214 L315 0 L327 0 L282 214Z', fill: '#8B5CF6', opacity: 0.1 },
    { d: 'M296 214 L341 0 L347 0 L302 214Z', fill: '#8B5CF6', opacity: 0.08 },
  ],
  emerging: [],
  star: [
    { d: 'M262 -30 L352 -30 L316 64 L372 64 L214 262 L262 112 L208 112Z', stroke: '#FFFFFF', width: 1.5, opacity: 0.16 },
    { d: 'M286 10 L338 10 L318 64 L350 64 L258 180 L286 92 L254 92Z', stroke: '#B9A6FF', width: 1.2, opacity: 0.22 },
  ],
  hitman: Array.from({ length: 8 }, (_, i) => ({
    d: plate(318, 24, 70 + i * 52, 40 + i * 30, 12),
    stroke: i === 1 ? '#D9F25A' : '#F5C451',
    width: i < 2 ? 1.2 : 1,
    opacity: 0.42 - i * 0.045,
  })),
};

/** The shapes as an SVG over the card, for the page. */
export function super10ArtSvg(tier: string): string {
  const shapes = SUPER10_CARD_ART[tier] ?? [];
  if (!shapes.length) return '';
  return `<svg class="st-card-s10" viewBox="0 0 362 214" preserveAspectRatio="none" aria-hidden="true">${shapes.map(s =>
    `<path d="${s.d}" fill="${s.fill ?? 'none'}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 1}" stroke-linejoin="round"` : ''} opacity="${s.opacity.toFixed(3)}"/>`).join('')}</svg>`;
}
