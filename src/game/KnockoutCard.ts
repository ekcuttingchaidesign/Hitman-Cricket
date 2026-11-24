import { avatarSrc } from '../config/board';
import { ordinal } from './knockout-points';

/**
 * A Super Knockout finish as a picture to send (Figma Battle Royale page, X7,
 * `893:4879`): the mark, the player's face in a ring (crowned when they won
 * the room), their name on a tag, how it ended, the big word, the innings in
 * three figures, and at the foot the dare with the address and a QR code.
 *
 * What it says is `knockoutCard`, a function of the finish, held in
 * `tests/knockout-card.test.ts`; `knockoutCardImage` paints it in the
 * design's own units, 402 by 714, scaled up to a story's width. The address
 * is painted on, as it is on the career card's story: a picture handed to
 * another app carries no link but the one that can be read off it.
 */

export interface KnockoutFinish {
  won: boolean;
  /** Where they finished, and out of how many seats. */
  place: number;
  of: number;
  name: string;
  face: number;
  runs: number;
  balls: number;
  sixes: number;
}

export interface KnockoutCardView {
  /** The big word: WINNER, or the finish. */
  title: string;
  /** Over it, how it ended. */
  line: string;
  /** The name on its tag. */
  tag: string;
  figures: [{ value: string; label: string }, { value: string; label: string }, { value: string; label: string }];
  ask: string;
  crowned: boolean;
}

export function knockoutCard(finish: KnockoutFinish): KnockoutCardView {
  const beaten = Math.max(0, finish.of - finish.place);
  const line = finish.won ? `OUTLASTED ${finish.of - 1} · LAST ONE STANDING`
    : finish.place === 2 ? `OUTLASTED ${beaten} · BEATEN IN THE FINAL`
    : beaten ? `OUTLASTED ${beaten} OF ${finish.of - 1}`
    : 'FIRST ONE OUT';
  return {
    title: finish.won ? 'WINNER' : `${ordinal(finish.place).toUpperCase()} OF ${finish.of}`,
    line,
    tag: finish.name.toUpperCase(),
    figures: [
      { value: String(finish.runs), label: finish.runs === 1 ? 'run' : 'runs' },
      { value: String(finish.balls), label: finish.balls === 1 ? 'ball' : 'balls' },
      { value: String(finish.sixes), label: finish.sixes === 1 ? 'six' : 'sixes' },
    ],
    ask: finish.won ? 'Can you outlast me?' : 'Can you do better?',
    crowned: finish.won,
  };
}

/** The address as it is printed: no scheme, no trailing slash. */
const hostOf = (link: string) => link.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '') || 'hitmancricket.in';

/** The words that go with the picture, and alone where no picture can leave the browser. */
export function knockoutShareText(finish: KnockoutFinish, link: string): string {
  const innings = `${finish.runs} off ${finish.balls}`;
  return finish.won
    ? `Last one standing of ${finish.of} in Super Knockout, with ${innings}. Can you outlast me? ${link}`
    : `${ordinal(finish.place)} of ${finish.of} in Super Knockout, with ${innings}. Can you do better? ${link}`;
}

export const knockoutCardFile = () => 'hitman-cricket-super-knockout.jpg';

/** The design's frame, and the picture's width in pixels. */
export const KNOCKOUT_CARD = { width: 402, height: 714, pixels: 1080 } as const;

const markArt = new URL('../assets/knockout/mark.webp', import.meta.url).href;
const crownArt = new URL('../assets/knockout/crown.svg', import.meta.url).href;
const grainArt = new URL('../assets/entry/grain.webp', import.meta.url).href;

const UI = "Satoshi, 'Segoe UI', Arial, sans-serif";
const ui = (weight: number, size: number) => `${weight} ${size}px ${UI}`;
const display = (size: number) => `400 ${size}px Jaro, Impact, sans-serif`;

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function load(src: string) {
  let found = cache.get(src);
  if (!found) {
    found = new Promise<HTMLImageElement | null>(resolve => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
    cache.set(src, found);
  }
  return found;
}

type Ctx = CanvasRenderingContext2D;

/** Tracked capitals, where the canvas can space letters; drawn untracked where it cannot. */
function tracked(c: Ctx, em: number, size: number) {
  (c as Ctx & { letterSpacing?: string }).letterSpacing = `${(em * size).toFixed(2)}px`;
}

function pill(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** The picture, as a JPEG a story takes whole. */
export async function knockoutCardImage(finish: KnockoutFinish, link: string): Promise<Blob> {
  const view = knockoutCard(finish);
  const { width: W, height: H, pixels } = KNOCKOUT_CARD;
  const scale = pixels / W;
  const canvas = document.createElement('canvas');
  canvas.width = pixels; canvas.height = Math.round(H * scale);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No 2D canvas context');
  c.scale(scale, scale);

  await Promise.all([
    document.fonts.load(display(76), 'WINNER'), document.fonts.load(ui(900, 13), 'A'), document.fonts.load(ui(600, 13), 'a'),
  ]).catch(() => {});
  const [mark, crown, grain, face, qr] = await Promise.all([load(markArt), load(crownArt), load(grainArt), load(avatarSrc(finish.face)), load('play-qr.svg')]);

  const gold = view.crowned;
  const metal = gold ? '#ffb020' : '#ee2a2a';
  const CX = W / 2, FY = 230, R = 84;

  // The ground: the knockout's dark, red rising from the top, and the WINNER screen's light round the face.
  c.fillStyle = '#0c0809'; c.fillRect(0, 0, W, H);
  const wash = c.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, '#3a0a10'); wash.addColorStop(0.5, '#170709'); wash.addColorStop(1, '#0c0809');
  c.fillStyle = wash; c.fillRect(0, 0, W, H);
  c.save();
  c.beginPath(); c.arc(CX, FY, 460, 0, Math.PI * 2); c.clip();
  const ray = gold ? '255,176,32' : '238,42,42';
  if (typeof c.createConicGradient === 'function') {
    const g = c.createConicGradient(-Math.PI / 2 + 0.1, CX, FY);
    for (let i = 0; i <= 32; i++) g.addColorStop(i / 32, i % 2 ? `rgba(${ray},0)` : `rgba(${ray},.2)`);
    c.fillStyle = g; c.fillRect(CX - 460, FY - 460, 920, 920);
  }
  c.restore();
  const dark = c.createRadialGradient(CX, FY, 0, CX, FY, 460);
  dark.addColorStop(0, 'rgba(12,8,9,0)'); dark.addColorStop(0.3, 'rgba(12,8,9,.3)'); dark.addColorStop(0.62, 'rgba(12,8,9,.92)'); dark.addColorStop(1, 'rgba(12,8,9,1)');
  c.fillStyle = dark; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(CX, FY, 0, CX, FY, 240);
  glow.addColorStop(0, `rgba(${ray},.3)`); glow.addColorStop(0.5, 'rgba(238,42,42,.12)'); glow.addColorStop(1, 'rgba(238,42,42,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  if (grain) {
    const pattern = c.createPattern(grain, 'repeat');
    if (pattern) { c.save(); c.globalAlpha = 0.08; c.fillStyle = pattern; c.fillRect(0, 0, W, H); c.restore(); }
  }

  // The mark, in its box at the head.
  if (mark) {
    const fit = Math.min(130 / mark.width, 75 / mark.height), w = mark.width * fit, h = mark.height * fit;
    c.drawImage(mark, CX - w / 2, 14 + (75 - h) / 2, w, h);
  }

  // The face in its ring.
  c.save();
  c.beginPath(); c.arc(CX, FY, R, 0, Math.PI * 2); c.closePath();
  c.fillStyle = '#1a0d10'; c.fill();
  c.clip();
  if (face) {
    const fit = Math.max((R * 2) / face.width, (R * 2) / face.height), w = face.width * fit, h = face.height * fit;
    c.drawImage(face, CX - w / 2, FY - h / 2, w, h);
  }
  c.restore();
  c.lineWidth = 5; c.strokeStyle = metal;
  c.shadowColor = `rgba(${ray},.55)`; c.shadowBlur = 22;
  c.beginPath(); c.arc(CX, FY, R, 0, Math.PI * 2); c.stroke();
  c.shadowBlur = 0; c.shadowColor = 'transparent';
  if (view.crowned && crown) {
    // Sat on the ring along its lean, as on WINNER: the band is an arc made for a circle.
    const turn = -8 * Math.PI / 180, w = 88, h = w * (crown.height / crown.width), sit = R + h * 0.34;
    c.save();
    c.translate(CX + Math.sin(turn) * sit, FY - Math.cos(turn) * sit); c.rotate(turn);
    c.drawImage(crown, -w / 2, -h / 2, w, h);
    c.restore();
  }

  // The name, on its tag under the face.
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = ui(900, 12); tracked(c, 0.1, 12);
  const tagW = Math.min(W - 80, Math.max(140, c.measureText(view.tag).width + 40));
  pill(c, CX - tagW / 2, 304, tagW, 26, 13);
  c.fillStyle = metal; c.fill();
  c.fillStyle = gold ? '#1a0508' : '#ffffff';
  c.fillText(view.tag, CX + 0.6, 321.5, tagW - 20);

  // How it ended, and the big word under it.
  c.font = ui(900, 13); tracked(c, 0.16, 13);
  c.fillStyle = '#ffd0d0';
  c.fillText(view.line, CX + 1, 362, W - 40);
  tracked(c, 0, 76);
  let size = 76;
  c.font = display(size);
  while (size > 40 && c.measureText(view.title).width > W - 48) { size -= 2; c.font = display(size); }
  const base = 440;
  c.fillStyle = gold ? '#8a5200' : '#7a0c12';
  c.fillText(view.title, CX, base + 4);
  const face2 = c.createLinearGradient(0, base - size * 0.72, 0, base);
  if (gold) { face2.addColorStop(0, '#ffe2a3'); face2.addColorStop(0.45, '#ffb020'); face2.addColorStop(1, '#f08a00'); }
  else { face2.addColorStop(0, '#ffffff'); face2.addColorStop(1, '#f5d9d9'); }
  c.fillStyle = face2;
  c.fillText(view.title, CX, base);

  // The innings, in three.
  pill(c, 20, 482, 362, 74, 18);
  c.fillStyle = 'rgba(255,255,255,.06)'; c.fill();
  c.fillStyle = 'rgba(255,255,255,.12)';
  c.fillRect(141, 499, 1, 40); c.fillRect(261, 499, 1, 40);
  view.figures.forEach((one, i) => {
    const x = [80.5, 201, 321.5][i];
    c.font = display(28); c.fillStyle = '#f5efe6';
    c.fillText(one.value, x, 518);
    c.font = ui(500, 11); c.fillStyle = '#bfaeb1';
    c.fillText(one.label, x, 539);
  });

  // The dare, the address, and the code that opens it.
  c.textAlign = 'left';
  c.font = display(22); c.fillStyle = '#f5efe6';
  c.fillText(view.ask, 20, 637);
  c.font = ui(600, 13); c.fillStyle = '#bfaeb1';
  c.fillText(`Super Knockout on ${hostOf(link)}`, 20, 662);
  if (qr) {
    pill(c, 318, 612, 64, 64, 10);
    c.fillStyle = '#ffffff'; c.fill();
    c.drawImage(qr, 323, 617, 54, 54);
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Canvas gave back no image')), 'image/jpeg', 0.92));
}
