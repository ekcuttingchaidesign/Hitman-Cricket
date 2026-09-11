import { GAME } from '../config/gameplay';
import type { ScoreManager } from './ScoreManager';

/**
 * The innings-end card, drawn again onto a canvas so it can leave the page as a
 * picture. It is painted rather than screenshotted: nothing in the browser can
 * turn live DOM into an image without a library, and the card is a dozen
 * rectangles and eight strings, so drawing it costs less than importing one and
 * gives back exact control of what the shared version says. The buttons do not
 * come with it. Nobody can press them in a chat thread.
 *
 * Every number here is the one in the .scorecard block of styles.css. If a value
 * moves there it has to move here, and tests/share.test.ts is what notices.
 */

const titleArt = new URL('../assets/title.webp', import.meta.url).href;
const coverArt = new URL('../assets/cover.webp', import.meta.url).href;

export const CARD = {
  width: 392, radius: 18, padX: 26, padTop: 24, padBottom: 22,
  ink: '#f7f0e5', quiet: '#9fb2bd', rule: '#ffffff21',
  face: '#0f2738', ledge: '#040e15', ball: '#e5473a', record: '#f2814f',
} as const;

/** The story frame every phone expects: a full-bleed portrait 9:16. */
export const STORY = { width: 1080, height: 1920 } as const;

const FAMILY = "Satoshi, 'Segoe UI', Arial, sans-serif";
const font = (weight: number, size: number) => `${weight} ${size}px ${FAMILY}`;

/** The weights the card asks for, loaded before a single glyph is measured. */
const WEIGHTS: [number, number][] = [[500, 14], [600, 11], [700, 11], [800, 26], [900, 78]];

let ready: Promise<void> | null = null;
/** Fonts and artwork, fetched once and reused for every share of the session. */
export function prepareShareAssets() {
  ready ??= (async () => {
    await Promise.all(WEIGHTS.map(([weight, size]) => document.fonts.load(font(weight, size), '0123456789')));
    await Promise.all([titleArt, coverArt].map(load));
  })().catch(() => { /* A share still draws, in whatever face the canvas falls back to. */ });
  return ready;
}

const cache = new Map<string, Promise<HTMLImageElement>>();
function load(src: string) {
  const found = cache.get(src);
  if (found) return found;
  const image = new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Could not load ${src}`));
    element.src = src;
  });
  cache.set(src, image);
  return image;
}

/**
 * Letter-spaced text, drawn a glyph at a time. ctx.letterSpacing only landed in
 * Safari 17.4, and the card's one tracked line is the first thing read on it.
 */
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + spacing;
  }
  return cursor - x - spacing;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

export interface CardFacts {
  runs: number; wickets: number; balls: number; overs: string;
  fours: number; sixes: number; strikeRate: number;
  history: { runs: number; isWicket: boolean }[];
  title: string; line: string; isRecord: boolean;
}

/** What the drawn card says, kept apart from the drawing so a test can read it. */
export function cardFacts(score: ScoreManager, best: number, isRecord: boolean): CardFacts {
  const faced = `${score.balls} balls faced`;
  return {
    runs: score.runs, wickets: score.wickets, balls: score.balls, overs: score.overs,
    fours: score.fours, sixes: score.sixes, strikeRate: score.strikeRate,
    history: score.history.map(ball => ({ runs: ball.runs, isWicket: ball.isWicket })),
    title: isRecord ? 'New personal best' : score.wickets >= 3 ? 'All out' : 'Innings complete',
    line: isRecord
      ? best > 0 ? `${faced}, past your old best of ${best}.` : `${faced}. First score on the board.`
      : best > 0 ? `${faced}. Your best stands at ${best}.` : `${faced}.`,
    isRecord,
  };
}

/** The card's height for a given innings, so callers can place it before drawing. */
export function cardHeight() {
  return CARD.padTop + 13 + 2 + 78 + 13 + 30 + 7 + 20 + 16 + 1 + 14 + 13 + 2 + 26 + CARD.padBottom;
}

/**
 * Paints the card at (x, y) in card units. The caller sets any scale it wants on
 * the context first, which is how the story gets the same card at 2.3 times the
 * size without a second copy of the layout.
 */
export async function paintCard(ctx: CanvasRenderingContext2D, facts: CardFacts, x: number, y: number) {
  const { width, padX, padTop, ink, quiet, rule, face, ledge, ball, record } = CARD;
  const height = cardHeight();
  const left = x + padX, contentW = width - padX * 2;

  ctx.save();
  ctx.translate(x, y);
  // The ledge first, then the card on top of it: the same solid shadow the live
  // card stands on, and the reason it reads as an object in a photo roll.
  ctx.fillStyle = ledge;
  panel(ctx, 0, 9, width, height, CARD.radius); ctx.fill();
  ctx.fillStyle = face;
  panel(ctx, 0, 0, width, height, CARD.radius); ctx.fill();
  // The lit top edge, clipped to the card so it follows the corners.
  ctx.save();
  panel(ctx, 0, 0, width, height, CARD.radius); ctx.clip();
  ctx.fillStyle = '#ffffff1f'; ctx.fillRect(0, 0, width, 1);
  ctx.restore();
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // The stamp, and the lockup opposite it. The mark goes in the corner because
  // the card is about to travel without the game around it.
  ctx.fillStyle = quiet;
  ctx.font = font(700, 10.5);
  tracked(ctx, facts.title.toUpperCase(), left, y + padTop + 9, 2);

  const title = await load(titleArt).catch(() => null);
  if (title) {
    const w = 84, h = w * (title.height / title.width);
    ctx.drawImage(title, x + width - padX - w, y + padTop - 3, w, h);
  }

  // The score. Runs carry it; the wickets ride the same baseline a third down.
  const scoreBase = y + padTop + 13 + 2 + 66;
  ctx.fillStyle = facts.isRecord ? record : ink;
  ctx.font = font(900, 78);
  const runs = String(facts.runs);
  ctx.fillText(runs, left, scoreBase);
  const runsW = ctx.measureText(runs).width;
  ctx.fillStyle = quiet;
  ctx.font = font(600, 26.5);
  ctx.fillText(`/${facts.wickets}`, left + runsW + 1, scoreBase);

  // Overs, right-aligned against the same baseline, with its word beneath.
  ctx.textAlign = 'right';
  ctx.fillStyle = ink;
  ctx.font = font(800, 26);
  ctx.fillText(facts.overs, x + width - padX, scoreBase);
  ctx.fillStyle = quiet;
  ctx.font = font(600, 10.5);
  ctx.fillText('Overs', x + width - padX, scoreBase + 15);
  ctx.textAlign = 'left';

  // The innings, ball by ball. Bars as tall as the runs off them, the ball that
  // got him out in cricket red, and the balls he never faced left as gaps.
  const trackTop = scoreBase + 13 + 12, trackH = 30;
  const gap = 2, barW = (contentW - gap * (GAME.totalBalls - 1)) / GAME.totalBalls;
  for (let i = 0; i < GAME.totalBalls; i++) {
    const hit = facts.history[i];
    const bx = left + i * (barW + gap);
    const r = hit ? Math.min(6, hit.runs) : 0;
    const bh = hit ? 4 + r * 4.3 : 3;
    ctx.globalAlpha = hit ? (hit.isWicket ? 1 : 0.24 + r * 0.126) : 0.13;
    ctx.fillStyle = hit?.isWicket ? ball : ink;
    panel(ctx, bx, trackTop + trackH - bh, barW, bh, 1.5); ctx.fill();
    if (hit?.isWicket) {
      ctx.beginPath();
      ctx.arc(bx + barW / 2, trackTop + trackH - 13, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // The line that says what the figures cannot.
  ctx.fillStyle = quiet;
  ctx.font = font(500, 13.5);
  const lineBase = trackTop + trackH + 7 + 14;
  ctx.fillText(facts.line, left, lineBase);

  // One hairline, then the three numbers, each column sized by its own label.
  const ruleY = Math.round(lineBase + 16);
  ctx.fillStyle = rule;
  ctx.fillRect(left, ruleY, contentW, 1);

  const stats: [string, string][] = [
    ['Fours', String(facts.fours)], ['Sixes', String(facts.sixes)], ['Strike rate', String(facts.strikeRate)],
  ];
  let cursor = left;
  for (const [label, value] of stats) {
    ctx.fillStyle = quiet; ctx.font = font(600, 10.5);
    ctx.fillText(label, cursor, ruleY + 14 + 10);
    const labelW = ctx.measureText(label).width;
    ctx.fillStyle = ink; ctx.font = font(800, 21);
    ctx.fillText(value, cursor, ruleY + 14 + 10 + 2 + 19);
    cursor += Math.max(labelW, ctx.measureText(value).width) + 26;
  }
  ctx.restore();
  return height;
}

const blob = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Canvas gave back no image')), type, quality));

function surface(width: number, height: number, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

/** The card on its own, on the ground it was won on, ready to go in a chat. */
export async function scorecardImage(facts: CardFacts, scale = 3) {
  await prepareShareAssets();
  const margin = 22, height = cardHeight() + margin * 2 + 9;
  const { canvas, ctx } = surface(CARD.width + margin * 2, height, scale);
  ctx.fillStyle = '#071219';
  ctx.fillRect(0, 0, CARD.width + margin * 2, height);
  await paintCard(ctx, facts, margin, margin);
  return blob(canvas);
}

/**
 * The story: the cover art the game opens on, the card standing on it, and the
 * address underneath in type big enough to read off a phone screen. The address
 * has to be painted on, because a picture handed to Instagram or WhatsApp is a
 * picture. Link stickers are added inside those apps, not by whoever sent the
 * image, so the only link that survives the trip is one you can read.
 */
export async function storyImage(facts: CardFacts, link: string, scale = 1) {
  await prepareShareAssets();
  const { width, height } = STORY;
  const { canvas, ctx } = surface(width, height, scale);

  ctx.fillStyle = '#071219';
  ctx.fillRect(0, 0, width, height);
  const cover = await load(coverArt).catch(() => null);
  if (cover) {
    const fit = Math.max(width / cover.width, height / cover.height);
    const w = cover.width * fit, h = cover.height * fit;
    ctx.drawImage(cover, (width - w) / 2, (height - h) / 2, w, h);
  }
  // Enough shade for a navy card to sit on a bright afternoon without either of
  // them fighting, weighted to the bottom where the address goes.
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, '#07121966');
  wash.addColorStop(0.45, '#071219a6');
  wash.addColorStop(1, '#071219e6');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  // Card and address are one block, centred together. Story apps put their own
  // chrome across the top and bottom of the frame, so what matters is that the
  // whole thing sits in the middle where nothing of theirs lands on it.
  const cardScale = (width * 0.84) / CARD.width;
  const drawnH = cardHeight() * cardScale;
  const footer = 140;
  const top = Math.round((height - (drawnH + footer)) / 2);
  ctx.save();
  ctx.translate((width - CARD.width * cardScale) / 2, top);
  ctx.scale(cardScale, cardScale);
  await paintCard(ctx, facts, 0, 0);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7f0e5';
  ctx.font = font(700, 34);
  ctx.globalAlpha = 0.92;
  ctx.fillText(link.replace(/^https?:\/\//, '').replace(/\/$/, ''), width / 2, top + drawnH + 84);
  ctx.globalAlpha = 0.66;
  ctx.font = font(500, 26);
  ctx.fillText('Five overs. Three wickets. Beat my score.', width / 2, top + drawnH + 126);
  ctx.globalAlpha = 1;
  // A photograph with type on it: JPEG at this quality is a fifth of the PNG and
  // the apps it is going to will re-encode it anyway.
  return blob(canvas, 'image/jpeg', 0.92);
}

/** Whether this browser will actually carry a picture out to another app. */
export function canShareImage() {
  return typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [new File([new Blob()], 'p.png', { type: 'image/png' })] });
}
