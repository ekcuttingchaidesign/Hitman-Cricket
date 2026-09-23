/**
 * The career key, as a picture somebody can keep.
 *
 * The three ways out of the save sheet are not equal, and this is the one the
 * sheet leads with made pressable. A screenshot is the surest save there is —
 * no clipboard to refuse it, no app to be missing, nothing to overwrite it a
 * minute later — but it is an action the phone owns rather than the game, and
 * some people have never taken one on purpose. So the same result is offered
 * as a key: a picture, straight into the camera roll.
 *
 * It carries the name as well as the key, because neither half opens anything
 * on its own, and a picture of a key found in a camera roll a year later with
 * no name beside it is a riddle rather than a record.
 *
 * Painted rather than screenshotted. A screenshot of the sheet would carry
 * whatever the browser had drawn around it — an address bar naming a preview
 * deployment, a notification, half a leaderboard — and this has one job.
 */

const FAMILY = "Satoshi, 'Segoe UI', Arial, sans-serif";
/**
 * The key is set in a monospace, and not in the display face it wears on the
 * card.
 *
 * On screen the key is a thing to recognise, and the heavy condensed face is
 * part of what makes the card look like an object worth keeping. In a picture
 * its only job is to be read back a character at a time, months later, by
 * somebody typing it into a field — and there the same face works against it:
 * the hyphens close up against the letters beside them, and the crowded
 * shapes make a poor job of telling one glyph from another.
 *
 * A monospace answers all of that. Even spacing, hyphens that stay hyphens,
 * and the families below are the ones that draw a zero apart from an O. It is
 * on the system, so there is no font to fetch and nothing to fall back from.
 */
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/** The weights this asks for, loaded before a glyph is measured. */
let ready: Promise<void> | null = null;
export function prepareKeyAssets() {
  ready ??= (async () => {
    await Promise.all([
      document.fonts.load(`800 20px ${FAMILY}`, 'ABC'),
      document.fonts.load(`500 17px ${FAMILY}`, 'abc'),
    ]);
  })().catch(() => { /* It still draws, in whatever face the canvas falls back to. */ });
  return ready;
}

const W = 1080;
const H = 1080;

/** A rounded rectangle, since not every browser we serve has `roundRect`. */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The picture, at a size a phone will keep and a messaging app will not crush.
 *
 * Square, because it is going into a camera roll beside photographs and a
 * portrait strip of mostly-empty card looks like a mistake among them.
 */
export async function keyImage(name: string, code: string): Promise<Blob> {
  await prepareKeyAssets();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');

  ctx.fillStyle = '#101e2c';
  ctx.fillRect(0, 0, W, H);

  // The plate, in the card's own gradient rather than a flat grey, so the
  // picture and the screen it came from are recognisably the same object.
  const sheet = ctx.createLinearGradient(90, 250, 990, 830);
  sheet.addColorStop(0, '#141414');
  sheet.addColorStop(0.55, '#464646');
  sheet.addColorStop(1, '#000000');
  plate(ctx, 90, 250, 900, 580, 44);
  ctx.fillStyle = sheet;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#6a6a6a';
  ctx.stroke();

  ctx.textAlign = 'center';

  ctx.fillStyle = '#ffffffcc';
  ctx.font = `800 26px ${FAMILY}`;
  ctx.letterSpacing = '3px';
  ctx.fillText('HITMAN CRICKET — CAREER KEY', W / 2, 190);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = '#ffffffa8';
  ctx.font = `600 24px ${FAMILY}`;
  ctx.fillText('THE NAME I BAT UNDER', W / 2, 345);

  ctx.fillStyle = '#fff';
  ctx.font = `800 54px ${FAMILY}`;
  ctx.fillText(name, W / 2, 415);

  ctx.fillStyle = '#ffffffa8';
  ctx.font = `600 24px ${FAMILY}`;
  ctx.fillText('MY KEY', W / 2, 520);

  // The key itself, on the foil the card wears, and fitted rather than
  // trusted: three long words and two digits can outrun any fixed size, and a
  // key clipped by its own plate is a key that cannot be read back.
  const foil = ctx.createLinearGradient(140, 560, 940, 660);
  foil.addColorStop(0, '#c9d6ff');
  foil.addColorStop(0.3, '#fffde6');
  foil.addColorStop(0.6, '#ffdeff');
  foil.addColorStop(1, '#9df0d0');
  plate(ctx, 140, 550, 800, 120, 22);
  ctx.fillStyle = foil;
  ctx.fill();

  let size = 52;
  ctx.fillStyle = '#101010';
  // Tracked a little wider than the face sets it, because this is being read
  // one character at a time rather than as a word.
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  do {
    ctx.font = `700 ${size}px ${MONO}`;
    size -= 2;
  } while (size > 18 && ctx.measureText(code).width > 700);
  ctx.fillText(code, W / 2, 628);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  ctx.fillStyle = '#ffffffcc';
  ctx.font = `500 27px ${FAMILY}`;
  ctx.fillText('Both together bring my record back', W / 2, 740);
  ctx.fillText('on any phone. Keep this picture.', W / 2, 780);

  ctx.fillStyle = '#ffffff7a';
  ctx.font = `600 24px ${FAMILY}`;
  ctx.fillText('hitman-cricket.vercel.app', W / 2, 930);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(made => (made ? resolve(made) : reject(new Error('no picture'))), 'image/png');
  });
}

export const keyImageName = (name: string) =>
  `hitman-cricket-career-key-${name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.png`;
