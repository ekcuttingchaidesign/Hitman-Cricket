import { avatarSrc, kitColour } from '../config/board';
import { measureName } from './tier';
import type { StatsFacts } from './StatsCard';

/**
 * The career card as My Stats draws it (UI v1), painted on a canvas for the
 * share picture: the tier's material, the logo and the tier's pill, the
 * player's face and name, the career figure, and on the top two rungs the line
 * to the next one — the star behind a Star card, the gold batsman behind a
 * Hitman's. The page draws the same card in HTML (`StatsSheet.ts`); this is
 * the one that leaves the phone, so it is drawn to match it rather than the
 * older card it replaces.
 */

export const TIER_CARD = { width: 362, height: 214, radius: 24 } as const;

const titleArt = new URL('../assets/title.webp', import.meta.url).href;
const starArt = new URL('../assets/kit/card-star.svg', import.meta.url).href;
const batsmanArt = new URL('../assets/kit/card-batsman.svg', import.meta.url).href;

const UI = "Satoshi, 'Segoe UI', Arial, sans-serif";
const ui = (weight: number, size: number) => `${weight} ${size}px ${UI}`;
const display = (size: number) => `400 ${size}px Jaro, Impact, sans-serif`;

const cache = new Map<string, Promise<HTMLImageElement>>();
function load(src: string) {
  let found = cache.get(src);
  if (!found) {
    found = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = src;
    });
    cache.set(src, found);
  }
  return found;
}

/** The faces and the art, fetched before anything is measured. */
export async function prepareTierCard() {
  await Promise.all([
    document.fonts.load(display(13), 'A'), document.fonts.load(ui(700, 18), 'A'), document.fonts.load(ui(900, 40), '0'),
    document.fonts.load(ui(500, 12), 'a'),
  ]).catch(() => {});
  await Promise.all([titleArt, starArt, batsmanArt].map(src => load(src).catch(() => null)));
}

/** What each material is made of, in the same colours the page's CSS uses. */
interface Material {
  stops: [number, string][];
  angle: number;
  edge: string;
  ink: string;
  quiet: string;
  pill: string | [string, string, string];
  pillInk: string;
  /** The name and the figure: a flat ink, or a metal running top to bottom. */
  metal?: [string, string, string];
  ring: string;
  sheen: [number, string][];
}

const SHEEN: [number, string][] = [[0.1875, '#ffffff00'], [0.46875, '#ffffff14'], [0.5625, '#ffffff00']];

const MATERIALS: Record<string, Material> = {
  debutant: {
    stops: [[0, '#2b4c78'], [0.55, '#1a3352'], [1, '#0f1f36']], angle: 135.6, edge: '#b9cde680',
    ink: '#f5efe6', quiet: '#a9bfd8', pill: '#5c83b540', pillInk: '#bfd3ec', ring: '#ffffff40', sheen: SHEEN,
  },
  emerging: {
    stops: [[0, '#e8b98c'], [0.28, '#b9784a'], [0.5, '#f0c79e'], [0.72, '#9a5a2f'], [1, '#c98b5a']], angle: 149.4, edge: '#ffe2c4',
    ink: '#2a1608', quiet: '#5a3218', pill: '#2a1608d9', pillInk: '#f0c79e', ring: '#2a160840', sheen: SHEEN,
  },
  star: {
    stops: [[0, '#2a2e35'], [0.45, '#121418'], [1, '#07080a']], angle: 149.4, edge: '#ffffff',
    ink: '#f5efe6', quiet: '#a9b2bc', pill: ['#f6f8fa', '#9aa3ac', '#e3e8ed'], pillInk: '#111316',
    metal: ['#ffffff', '#b8c0c8', '#f2f5f8'], ring: '#ffffff40', sheen: [[0.1875, '#ffffff00'], [0.46875, '#ffffff1f'], [0.5625, '#ffffff00']],
  },
  hitman: {
    stops: [[0, '#1c1608'], [0.5, '#0a0805'], [1, '#050403']], angle: 149.4, edge: '#fff0b8',
    ink: '#f5efe6', quiet: '#bfa15a', pill: ['#fff0b8', '#c99a35', '#f7d774'], pillInk: '#1a1204',
    metal: ['#fff0b8', '#e3b04b', '#ffe08a'], ring: '#f3d27a',
    sheen: [[0.1875, '#ffffff00'], [0.45, '#ffe08a1a'], [0.5, '#ff9cd012'], [0.55, '#8fe3ff12'], [0.6125, '#ffffff00']],
  },
};

/** The Test Marathon's card is its green at every rung, crimson rising from the foot. */
function marathonOf(base: Material, tier: string): Material {
  return {
    ...base,
    stops: [[0, '#0b3a24'], [0.55, '#052015'], [1, '#021009']], angle: 160,
    edge: tier === 'emerging' ? '#d9a877' : tier === 'star' ? '#c9d1d9' : tier === 'hitman' ? '#f3d27a' : '#3f7d5a',
    ink: '#f5efe6', quiet: '#b5c7bc', ring: '#ffffff40',
    pill: tier === 'emerging' ? '#2a1608d9' : tier === 'hitman' || tier === 'star' ? base.pill : '#ffffff1f',
    pillInk: tier === 'emerging' ? '#f0c79e' : tier === 'hitman' || tier === 'star' ? base.pillInk : '#e7f0ea',
    metal: tier === 'hitman' ? base.metal : undefined,
  };
}

/** A CSS-style angled gradient across a box. */
function angled(ctx: CanvasRenderingContext2D, w: number, h: number, angle: number, stops: [number, string][]) {
  const a = (angle - 90) * Math.PI / 180;
  const half = Math.abs(w / 2 * Math.cos(a)) + Math.abs(h / 2 * Math.sin(a));
  const cx = w / 2, cy = h / 2, dx = Math.cos(a) * half, dy = Math.sin(a) * half;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  return g;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let at = x;
  for (const ch of text) { ctx.fillText(ch, at, y); at += ctx.measureText(ch).width + spacing; }
  return at - x - spacing;
}
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  return [...text].reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, -spacing);
}

/** Text in a metal running top to bottom across its own height. */
function metalFill(ctx: CanvasRenderingContext2D, metal: [string, string, string], top: number, h: number) {
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, metal[0]); g.addColorStop(0.5, metal[1]); g.addColorStop(1, metal[2]);
  return g;
}

/** The card, at (x, y), at its own 362 by 214. */
export async function paintTierCard(
  ctx: CanvasRenderingContext2D, facts: StatsFacts, who: { name: string; avatar: number } | null, x: number, y: number,
) {
  const tier = facts.tier.key;
  const base = MATERIALS[tier] ?? MATERIALS.debutant;
  const m = facts.mode === 'marathon' ? marathonOf(base, tier) : base;
  const { width: W, height: H, radius: R } = TIER_CARD;
  ctx.save();
  ctx.translate(x, y);

  // The drop shadow under it, then the material, clipped to the card.
  ctx.save();
  ctx.shadowColor = '#0000008c'; ctx.shadowBlur = 32; ctx.shadowOffsetY = 16;
  rounded(ctx, 0, 0, W, H, R); ctx.fillStyle = '#000'; ctx.fill();
  ctx.restore();
  ctx.save();
  rounded(ctx, 0, 0, W, H, R); ctx.clip();
  ctx.fillStyle = angled(ctx, W, H, m.angle, m.stops); ctx.fillRect(0, 0, W, H);
  if (facts.mode === 'marathon') {
    const red = ctx.createRadialGradient(W * 0.85, H * 1.15, 0, W * 0.85, H * 1.15, W * 0.75);
    red.addColorStop(0, '#c8102e5c'); red.addColorStop(0.62, '#c8102e00');
    ctx.fillStyle = red; ctx.fillRect(0, 0, W, H);
  }
  // Each material's own grain: brushed lines on bronze, a faint weave on navy.
  if (tier === 'emerging' && facts.mode !== 'marathon') {
    for (let row = 0; row < H; row += 4) {
      ctx.fillStyle = (row / 4) % 2 ? '#ffffff0f' : '#3a1e0c0d';
      ctx.fillRect(0, row, W, 1);
    }
  } else if (tier === 'debutant' && facts.mode !== 'marathon') {
    ctx.save(); ctx.strokeStyle = '#ffffff05'; ctx.lineWidth = 2;
    for (let i = -H; i < W; i += 9) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H * 0.47, 0); ctx.stroke(); }
    ctx.restore();
  }
  // The art behind the top two rungs, as the page places it.
  if (tier === 'star') {
    const star = await load(starArt).catch(() => null);
    if (star) {
      ctx.save();
      ctx.translate(134.5 + 142.66, -13 + 135.68);
      ctx.rotate(12 * Math.PI / 180);
      ctx.drawImage(star, -142.66, -135.68, 285.3, 271.35);
      ctx.restore();
    }
  } else if (tier === 'hitman') {
    const man = await load(batsmanArt).catch(() => null);
    if (man) ctx.drawImage(man, W * 0.5746, H * 0.1121, W * (1 - 0.5746 + 0.0207), H * (1 - 0.1121 + 0.4486));
  }
  const sheen = angled(ctx, W, H, 135.4, m.sheen);
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // The edge, and on a Hitman card its inner foil rim.
  rounded(ctx, 0.75, 0.75, W - 1.5, H - 1.5, R); ctx.strokeStyle = m.edge; ctx.lineWidth = 1.5; ctx.stroke();
  if (tier === 'hitman') { rounded(ctx, 7, 7, W - 14, H - 14, 18); ctx.strokeStyle = '#f3d27a47'; ctx.lineWidth = 1; ctx.stroke(); }

  // Top: the logo, and the tier's pill.
  const logo = await load(titleArt).catch(() => null);
  if (logo) {
    const lw = 70, lh = 25, fit = Math.min(lw / logo.width, lh / logo.height);
    ctx.drawImage(logo, 20, 16 + (lh - logo.height * fit) / 2, logo.width * fit, logo.height * fit);
  }
  ctx.font = display(13);
  const word = facts.tier.name;
  const pw = trackedWidth(ctx, word, 1.56) + 20, ph = 21, px = W - 20 - pw, py = 18;
  if (Array.isArray(m.pill)) {
    const g = ctx.createLinearGradient(px, 0, px + pw, 0);
    g.addColorStop(0, m.pill[0]); g.addColorStop(0.5, m.pill[1]); g.addColorStop(1, m.pill[2]);
    ctx.fillStyle = g;
  } else ctx.fillStyle = m.pill;
  rounded(ctx, px, py, pw, ph, 8); ctx.fill();
  ctx.fillStyle = m.pillInk; ctx.textBaseline = 'middle';
  tracked(ctx, word, px + 10, py + ph / 2 + 1, 1.56);

  // Who: the face, the name, the mode.
  // The name sits higher on the two cards that carry a line under the figure.
  const fy = tier === 'star' || tier === 'hitman' ? 66 : 82, fs = 44;
  ctx.save();
  ctx.beginPath(); ctx.arc(20 + fs / 2, fy + fs / 2, fs / 2, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = who ? kitColour(who.avatar) : '#00000033'; ctx.fill();
  if (who) {
    ctx.clip();
    const kit = await load(avatarSrc(who.avatar)).catch(() => null);
    if (kit) ctx.drawImage(kit, 20, fy, fs, fs);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(20 + fs / 2, fy + fs / 2, fs / 2 + 1, 0, Math.PI * 2);
  ctx.strokeStyle = m.ring; ctx.lineWidth = 2; ctx.stroke();
  const name = who?.name ?? 'Guest';
  ctx.font = ui(700, 18); ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = m.metal ? metalFill(ctx, m.metal, fy + 6, 20) : m.ink;
  ctx.fillText(name, 76, fy + 22);
  ctx.font = ui(700, 9); ctx.fillStyle = m.quiet;
  tracked(ctx, `${facts.modeName.toUpperCase()} · CAREER`, 76, fy + 36, 0.9);

  // The figure, and on the top two rungs the line to the next one.
  const measure = facts.ladder.measure.toLocaleString('en-US');
  const unit = facts.mode === 'survive' ? 'balls faced' : `career ${measureName(facts.mode)}`;
  const progress = tier === 'star' || tier === 'hitman';
  const figY = progress ? 166 : 194;
  ctx.font = ui(900, 40);
  ctx.fillStyle = m.metal ? metalFill(ctx, m.metal, figY - 32, 34) : m.ink;
  const figW = tracked(ctx, measure, 20, figY, -1.33);
  ctx.font = ui(500, 12); ctx.fillStyle = m.quiet;
  ctx.fillText(unit, 20 + figW + 8, figY);
  if (progress) {
    const { progress: done, toNext, next } = facts.ladder;
    const ty = 184;
    ctx.fillStyle = tier === 'hitman' ? '#f3d27a26' : '#ffffff1f';
    rounded(ctx, 20, ty, 150, 4, 2); ctx.fill();
    ctx.fillStyle = tier === 'hitman' ? '#f3d27a' : '#dde3e8';
    rounded(ctx, 20, ty, Math.max(4, 150 * (next ? done : 1)), 4, 2); ctx.fill();
    ctx.font = ui(500, 12); ctx.fillStyle = m.quiet; ctx.textAlign = 'right';
    ctx.fillText(next && toNext !== null ? `${toNext.toLocaleString('en-US')} ${measureName(facts.mode)} to ${next.short}` : 'Top of the game', W - 20, ty + 6);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
