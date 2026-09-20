import { kitColour, avatarSrc } from '../config/board';
import { survivals, type BlastCareer, type CareerMode, type SurviveCareer } from './career';

/**
 * The career card, painted so it can leave the page as a picture.
 *
 * The innings card in `ShareCard.ts` is the same idea and the same house: a
 * dozen rectangles and a handful of strings on a canvas, rather than a
 * screenshot of live DOM, because nothing in a browser turns one into the other
 * without a library and painting it gives back exact control of what the shared
 * version says.
 *
 * What is different is what it is *for*. An innings card is a result — it
 * exists for an hour and is about one thirty-ball story. This is a record of
 * everything somebody has done, and the whole reason the boards count every
 * innings is so that it accumulates into something worth showing people. So it
 * is drawn to be looked at rather than merely read: the two figures the mode is
 * actually about are given the room, the rest sit under them in a grid, and the
 * mark is on it because the picture is about to travel without the game around
 * it.
 *
 * The overlay shows this very image rather than a DOM copy of it, which is the
 * one thing that guarantees the card somebody shares is the card they were
 * looking at when they decided to.
 */

const titleArt = new URL('../assets/title.webp', import.meta.url).href;
const coverArt = new URL('../assets/cover.webp', import.meta.url).href;

export const STATS_CARD = {
  width: 392,
  radius: 20,
  padX: 26,
  padTop: 26,
  padBottom: 22,
  ink: '#f7f0e5',
  quiet: '#9fb2bd',
  rule: '#ffffff1f',
  face: '#0f2738',
  lift: '#16354a',
  ledge: '#040e15',
  accent: '#f2814f',
  accentInk: '#f7c3a4',
} as const;

/**
 * The three results a Test innings ends in, in the colours the Test board bands
 * its rows with. The card is the one place all three figures sit side by side,
 * and a row of three identical numbers says nothing about which of them a
 * player would rather have more of — the colours are what make it a record
 * rather than a tally. They are the sheet's own, so a card and the board it
 * came from never disagree about what a draw looks like.
 */
const RESULT_INK: Record<string, string> = {
  Won: '#7de3ad', Drawn: '#f0c65c', Lost: '#f09a8c',
};

/** The story frame every phone expects: a full-bleed portrait 9:16. */
export const STORY = { width: 1080, height: 1920 } as const;

const FAMILY = "Satoshi, 'Segoe UI', Arial, sans-serif";
const font = (weight: number, size: number) => `${weight} ${size}px ${FAMILY}`;

/** The weights the card asks for, loaded before a single glyph is measured. */
const WEIGHTS: [number, number][] = [[500, 13], [600, 10], [700, 11], [800, 22], [900, 44]];

let ready: Promise<void> | null = null;
/** Fonts and artwork, fetched once and reused for every share of the session. */
export function prepareStatsAssets() {
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

/** One figure on the card: what it is called, and what it comes to. */
export interface StatsFigure {
  label: string;
  value: number;
}

/**
 * What the card says, kept apart from the drawing so that a test can read it
 * and so the overlay's own text — which is what a screen reader gets, since a
 * canvas has nothing to say to one — is built from the same figures.
 */
export interface StatsFacts {
  mode: CareerMode;
  /** The ladder this career was made in, as the eyebrow prints it. */
  modeName: string;
  name: string;
  avatar: number;
  innings: number;
  /** The two figures the mode is actually about. They get the room. */
  hero: StatsFigure[];
  /** Everything else, in the grid underneath. */
  figures: StatsFigure[];
  /** The best place this career holds on any ladder, where it holds one. */
  standing: string | null;
  /** Whether anything has been counted at all. */
  played: boolean;
}

/** A Blast career, as the card reads it. */
export function blastFacts(career: BlastCareer): Pick<StatsFacts, 'hero' | 'figures'> {
  return {
    hero: [
      { label: 'Runs', value: career.runs },
      { label: 'Highest', value: career.highest },
    ],
    figures: [
      { label: 'Sixes', value: career.sixes },
      { label: 'Fours', value: career.fours },
      // The best score made without losing a wicket, which is not the same as
      // the highest: 140 for one is the bigger score and the lesser innings.
      { label: 'Best n.o.', value: career.notOut },
      { label: 'Balls', value: career.balls },
    ],
  };
}

/** A Test career, with the three results it can end in. */
export function surviveFacts(career: SurviveCareer): Pick<StatsFacts, 'hero' | 'figures'> {
  return {
    hero: [
      { label: 'Balls faced', value: career.balls },
      { label: 'Survived', value: survivals(career) },
    ],
    figures: [
      { label: 'Runs', value: career.runs },
      { label: 'Blows', value: career.blows },
      { label: 'Sixes', value: career.sixes },
      { label: 'Fours', value: career.fours },
      { label: 'Won', value: career.wins },
      { label: 'Drawn', value: career.draws },
      { label: 'Lost', value: career.losses },
    ],
  };
}

export function statsFacts(
  mode: CareerMode,
  career: BlastCareer | SurviveCareer,
  who: { name: string; avatar: number },
  standing: string | null = null,
): StatsFacts {
  const split = mode === 'survive'
    ? surviveFacts(career as SurviveCareer)
    : blastFacts(career as BlastCareer);
  return {
    mode,
    modeName: mode === 'survive' ? 'Test Survival' : 'The Blast',
    // A player who has not registered still has a card; it is their figures,
    // and the only thing a name would add is a name. "You" is what the game
    // calls them everywhere else on the board, so it is what the card calls
    // them too rather than leaving the biggest line on it blank.
    name: who.name || 'You',
    avatar: who.avatar,
    innings: career.innings,
    standing,
    played: career.innings > 0,
    ...split,
  };
}

/**
 * The card as a sentence, for the overlay's screen readers and for the caption
 * that rides along with the picture. A canvas is a rectangle to a screen
 * reader, so without this the card would be nothing at all to one.
 */
export function statsAlt(facts: StatsFacts): string {
  const figures = [...facts.hero, ...facts.figures].map(one => `${one.label} ${one.value}`).join(', ');
  return `${facts.name} on ${facts.modeName}: ${facts.innings} innings. ${figures}.`;
}

/** How many of the small figures sit on one row. */
const PER_ROW = 4;

const EYEBROW_H = 13;
const IDENTITY_TOP = 22;
const IDENTITY_H = 56;
const HERO_TOP = 22;
const HERO_H = 84;
const HERO_GAP = 12;
const GRID_TOP = 20;
const GRID_ROW_H = 46;
const FOOT_TOP = 18;
const FOOT_H = 13;

function gridRows(facts: StatsFacts) {
  return Math.ceil(facts.figures.length / PER_ROW);
}

/** The card's height for a given career, so callers can place it before drawing. */
export function statsCardHeight(facts: StatsFacts) {
  const rows = gridRows(facts);
  return STATS_CARD.padTop + EYEBROW_H
    + IDENTITY_TOP + IDENTITY_H
    + HERO_TOP + HERO_H
    + GRID_TOP + rows * GRID_ROW_H + (rows - 1) * 6
    + FOOT_TOP + FOOT_H
    + STATS_CARD.padBottom;
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

/**
 * Letter-spaced text, drawn a glyph at a time. `ctx.letterSpacing` only landed
 * in Safari 17.4, and the card's tracked lines are the first things read on it.
 */
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + spacing;
  }
  return cursor - x - spacing;
}

/** Cuts text to what will fit, with an ellipsis where it had to be cut. */
function clipped(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * The kit, as a disc with the player's picture in it — and the coloured disc
 * alone where the picture will not load, which is the same fallback the board's
 * rows have and reads as the kit either way rather than as a hole.
 */
async function paintKit(ctx: CanvasRenderingContext2D, facts: StatsFacts, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = kitColour(facts.avatar);
  ctx.fill();
  ctx.clip();
  const kit = await load(avatarSrc(facts.avatar)).catch(() => null);
  if (kit) ctx.drawImage(kit, x, y, size, size);
  ctx.restore();
  // A hairline round it, so a dark kit does not dissolve into a dark card.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff2e';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Paints the card at (x, y) in card units. The caller sets any scale it wants
 * on the context first, which is how the story gets the same card at two and a
 * half times the size with no second copy of the layout.
 */
export async function paintStatsCard(
  ctx: CanvasRenderingContext2D, facts: StatsFacts, x: number, y: number, link = '',
) {
  const { width, padX, padTop, ink, quiet, rule, face, lift, ledge, accent, accentInk } = STATS_CARD;
  const height = statsCardHeight(facts);
  const left = x + padX, contentW = width - padX * 2;

  ctx.save();
  ctx.translate(x, y);
  // The ledge first, then the card on it: the same solid shadow the live cards
  // stand on, and the reason this reads as an object in a photo roll.
  ctx.fillStyle = ledge;
  panel(ctx, 0, 10, width, height, STATS_CARD.radius); ctx.fill();
  // The face is a gradient rather than a flat fill — the innings card is flat
  // because it is one screen of one result, and this one is meant to be looked
  // at on its own in a chat thread, where flat navy at this size reads as a
  // form. Lit at the top, settling into the house colour by the grid.
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, lift);
  wash.addColorStop(0.55, face);
  wash.addColorStop(1, '#0b1f2e');
  ctx.fillStyle = wash;
  panel(ctx, 0, 0, width, height, STATS_CARD.radius); ctx.fill();
  ctx.save();
  panel(ctx, 0, 0, width, height, STATS_CARD.radius); ctx.clip();
  // A soft accent bloom behind the hero row, which is the one thing on the card
  // that is allowed to glow. It is what stops nine numbers reading as a table.
  const bloomY = padTop + EYEBROW_H + IDENTITY_TOP + IDENTITY_H + HERO_TOP + HERO_H / 2;
  const bloom = ctx.createRadialGradient(width / 2, bloomY, 0, width / 2, bloomY, width * 0.72);
  bloom.addColorStop(0, '#f2814f1c');
  bloom.addColorStop(0.62, '#f2814f0d');
  bloom.addColorStop(1, '#f2814f00');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);
  // The lit top edge, clipped to the card so it follows the corners.
  ctx.fillStyle = '#ffffff2b'; ctx.fillRect(0, 0, width, 1);
  ctx.restore();
  // And a hairline all the way round. WhatsApp puts this on a dark thread and
  // Instagram on whatever the story is standing on; without an edge of its own
  // the card dissolves into the first of those and floats on the second.
  ctx.strokeStyle = '#ffffff1a';
  ctx.lineWidth = 1;
  panel(ctx, 0.5, 0.5, width - 1, height - 1, STATS_CARD.radius); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // The stamp, and the mark opposite it. The mark goes on because the card is
  // about to travel without the game around it, and a brag with no name on it
  // is a brag nobody can act on.
  let cursor = y + padTop + 10;
  ctx.fillStyle = accent;
  ctx.font = font(700, 10.5);
  tracked(ctx, `${facts.modeName.toUpperCase()} · CAREER`, left, cursor, 2.1);

  const title = await load(titleArt).catch(() => null);
  if (title) {
    const w = 78, h = w * (title.height / title.width);
    ctx.drawImage(title, x + width - padX - w, y + padTop - 4, w, h);
  }

  // Who it belongs to: the kit, the name, and how many innings are behind it.
  cursor += IDENTITY_TOP;
  await paintKit(ctx, facts, left, cursor, IDENTITY_H);
  const nameX = left + IDENTITY_H + 15;
  ctx.fillStyle = ink;
  ctx.font = font(800, 27);
  ctx.fillText(clipped(ctx, facts.name, contentW - IDENTITY_H - 15), nameX, cursor + 26);
  ctx.fillStyle = quiet;
  ctx.font = font(600, 12.5);
  const behind = `${facts.innings} ${facts.innings === 1 ? 'innings' : 'innings'} played`;
  ctx.fillText(facts.standing ? `${behind} · ${facts.standing}` : behind, nameX, cursor + 46);

  // The two figures the mode is about, each in its own tile. Two tiles rather
  // than one big number because both modes have two things worth bragging
  // about, and picking one of them would be picking wrong half the time.
  cursor += IDENTITY_H + HERO_TOP;
  const tileW = (contentW - HERO_GAP) / 2;
  facts.hero.forEach((figure, i) => {
    const tx = left + i * (tileW + HERO_GAP);
    // Glass rather than tint. Orange at a low alpha over navy is brown — the
    // tiles came out the colour of wet cardboard however the gradient was
    // arranged, because that is simply what those two colours make. So the
    // tile is lit white and falling away, the accent is spent on the hairline
    // and the label, and the warmth behind it all is the bloom's job.
    const glass = ctx.createLinearGradient(0, cursor, 0, cursor + HERO_H);
    glass.addColorStop(0, '#ffffff1c');
    glass.addColorStop(1, '#ffffff08');
    ctx.fillStyle = glass;
    panel(ctx, tx, cursor, tileW, HERO_H, 14); ctx.fill();
    ctx.strokeStyle = '#f2814f70';
    ctx.lineWidth = 1;
    panel(ctx, tx + 0.5, cursor + 0.5, tileW - 1, HERO_H - 1, 14); ctx.stroke();
    ctx.fillStyle = accentInk;
    ctx.font = font(700, 10);
    tracked(ctx, figure.label.toUpperCase(), tx + 16, cursor + 25, 1.4);
    ctx.fillStyle = ink;
    ctx.font = font(900, 44);
    ctx.fillText(clipped(ctx, String(figure.value), tileW - 32), tx + 16, cursor + 69);
  });

  // Everything else, four to a row, each column the same width so the numbers
  // line up down the card rather than wandering with the labels above them.
  cursor += HERO_H + GRID_TOP;
  const colW = contentW / PER_ROW;
  facts.figures.forEach((figure, i) => {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    const fx = left + col * colW;
    const fy = cursor + row * (GRID_ROW_H + 6);
    ctx.fillStyle = quiet;
    ctx.font = font(600, 9.5);
    tracked(ctx, figure.label.toUpperCase(), fx, fy + 10, 1);
    ctx.fillStyle = RESULT_INK[figure.label] ?? ink;
    ctx.font = font(800, 23);
    ctx.fillText(clipped(ctx, String(figure.value), colW - 8), fx, fy + 36);
  });

  // One hairline and the address, because the whole point of the picture is
  // that somebody reading it can go and have a go themselves.
  cursor += gridRows(facts) * GRID_ROW_H + (gridRows(facts) - 1) * 6 + FOOT_TOP;
  ctx.fillStyle = rule;
  ctx.fillRect(left, Math.round(cursor - 12), contentW, 1);
  ctx.fillStyle = quiet;
  ctx.font = font(600, 11.5);
  ctx.fillText(link ? link.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'Hitman Cricket', left, cursor + FOOT_H);
  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.font = font(700, 11.5);
  ctx.fillText('BEAT MY NUMBERS', x + width - padX, cursor + FOOT_H);
  ctx.textAlign = 'left';

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
export async function statsCardImage(facts: StatsFacts, link: string, scale = 3) {
  await prepareStatsAssets();
  const margin = 22;
  const height = statsCardHeight(facts) + margin * 2 + 10;
  const { canvas, ctx } = surface(STATS_CARD.width + margin * 2, height, scale);
  ctx.fillStyle = '#071219';
  ctx.fillRect(0, 0, STATS_CARD.width + margin * 2, height);
  await paintStatsCard(ctx, facts, margin, margin, link);
  return blob(canvas);
}

/**
 * The story: the cover art the game opens on, the card standing on it, and the
 * address underneath in type big enough to read off a phone screen.
 *
 * The address has to be painted on, because a picture handed to Instagram is a
 * picture. Link stickers are added inside those apps, not by whoever sent the
 * image, so the only link that survives the trip is one you can read.
 */
export async function statsStoryImage(facts: StatsFacts, link: string, scale = 1) {
  await prepareStatsAssets();
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
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, '#07121970');
  wash.addColorStop(0.45, '#071219ad');
  wash.addColorStop(1, '#071219e8');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  // Card and address are one block, centred together. Story apps put their own
  // chrome across the top and bottom of the frame, so what matters is that the
  // whole thing sits in the middle where nothing of theirs lands on it.
  const cardScale = (width * 0.84) / STATS_CARD.width;
  const drawnH = statsCardHeight(facts) * cardScale;
  const footer = 150;
  const top = Math.round((height - (drawnH + footer)) / 2);
  ctx.save();
  ctx.translate((width - STATS_CARD.width * cardScale) / 2, top);
  ctx.scale(cardScale, cardScale);
  await paintStatsCard(ctx, facts, 0, 0, link);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7f0e5';
  ctx.font = font(700, 34);
  ctx.globalAlpha = 0.92;
  ctx.fillText(link.replace(/^https?:\/\//, '').replace(/\/$/, ''), width / 2, top + drawnH + 86);
  ctx.globalAlpha = 0.66;
  ctx.font = font(500, 26);
  ctx.fillText(
    facts.mode === 'survive' ? 'Ten overs. One wicket. Last longer than me.' : 'Five overs. Three wickets. Beat my numbers.',
    width / 2, top + drawnH + 128,
  );
  ctx.globalAlpha = 1;
  // A photograph with type on it: JPEG at this quality is a fifth of the PNG
  // and the apps it is going to will re-encode it anyway.
  return blob(canvas, 'image/jpeg', 0.92);
}
