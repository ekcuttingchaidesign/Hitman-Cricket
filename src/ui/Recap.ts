import '../recap.css';
import {
  INK, groundOf, type BatPoster, type CoverPoster, type Fact, type HeroAsk, type HitsPoster, type KitPoster, type Poster, type RankPoster,
  type RunsPoster, type SeasonPoster, type StreakPoster, type TypeId, type TypePoster, type WhenPoster,
} from '../game/recap-view';
import type { StillRenderer } from '../game/recap-render';

/**
 * The year recap on screen: the posters `recapPosters` says, drawn as the
 * Figma file's "Season '26: The Drop" draws them, as a story — bars along the
 * top, a tap on the right two thirds on, the left third back, a hold to
 * pause, each poster 6.5 seconds (the cover 4) and the last one waiting.
 *
 * Every poster is laid out at the design's own size, 402 by 874, and the frame
 * is scaled to the screen, so every number below is the design's pixel. The
 * batters are the game's own renders (`recap-render.ts`), made as the recap
 * opens, the poster in front first, and cut out with the cream edge here.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const lines = (s: string) => esc(s).replace(/\n/g, '<br>');

/** The order things are printed in, ms after the poster arrives (the motion section's beats). */
const AT = { figure: 120, label: 360, shape: 520, hero: 760, line: 1000, foot: 1300, roast: 1900, share: 2200 };

type Style = Record<string, string | number>;
/** Unitless where CSS wants a plain number, pixels everywhere else. */
const UNITLESS = new Set(['line-height', 'opacity', 'z-index']);
const css = (s: Style) => Object.entries(s).map(([k, v]) => `${k}:${typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : v}`).join(';');

/** A line of type at a design position. */
function t(x: number, y: number, cls: string, text: string, style: Style = {}, extra = ''): string {
  return `<p class="rc-t ${cls}" style="${css({ left: x, top: y, ...style })}" ${extra}>${lines(text)}</p>`;
}
/** A figure printed twice on two plates: the back one offset down and right, slammed in 60 ms behind. */
function plate(x: number, y: number, off: number, size: number, back: string, front: string, text: string, at = AT.figure, id = '', extra: Style = {}): string {
  const s = { 'font-size': size, ...extra };
  return t(x + off, y + off, 'rc-j rc-slam', text, { ...s, color: back, '--d': `${at + 60}ms` }, id ? `data-back="${id}"` : '')
    + t(x, y, 'rc-j rc-slam', text, { ...s, color: front, '--d': `${at}ms` }, id ? `data-front="${id}"` : '');
}
/** The four-pointed sparkle. */
const sparkle = (x: number, y: number, size: number, colour: string, at = AT.shape) =>
  `<svg class="rc-spark rc-pop" style="${css({ left: x, top: y, width: size, height: size, '--d': `${at}ms` })}" viewBox="0 0 32 32"><path fill="${colour}" d="M16 0C18.1 8.5 23.5 13.9 32 16 23.5 18.1 18.1 23.5 16 32 13.9 23.5 8.5 18.1 0 16 8.5 13.9 13.9 8.5 16 0Z"/></svg>`;
/** The roast's pill at its place; a negative x stands it that far in from the right edge instead. */
const roast = (x: number, y: number, bg: string, fg: string, text: string) =>
  `<div class="rc-roast rc-pop" style="${css({ ...(x < 0 ? { right: -x } : { left: x }), top: y, background: bg, color: fg, '--d': `${AT.roast}ms` })}">${esc(text)}</div>`;
const hero = (x: number, y: number, w: number, h: number, key: string) =>
  `<div class="rc-hero rc-pop" data-hero="${key}" style="${css({ left: x, top: y, width: w, height: h, '--d': `${AT.hero}ms` })}"></div>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, style: Style = {}, cls = '') =>
  `<div class="rc-t ${cls}" style="${css({ left: x, top: y, width: w, height: h, background: fill, ...style })}"></div>`;
const disc = (x: number, y: number, d: number, fill: string, style: Style = {}, cls = 'rc-pop') =>
  rect(x, y, d, d, fill, { 'border-radius': '50%', '--d': `${AT.shape}ms`, ...style }, cls);
/** A word or phrase in Devanagari. */
const hindi = (x: number, y: number, size: number, colour: string, text: string, style: Style = {}, extra = '') =>
  t(x, y, 'rc-h rc-in', text, { 'font-size': size, color: colour, '--d': `${AT.label}ms`, ...style }, extra);
const sentence = (x: number, y: number, w: number, colour: string, text: string, style: Style = {}, extra = '') =>
  t(x, y, 'rc-m rc-in', text, { width: w, color: colour, '--d': `${AT.line}ms`, ...style }, extra);

const SHARE_ICON = (stroke: string) => `<svg viewBox="0 0 16 16" fill="none"><path d="M8 10V2M8 2 4.5 5.5M8 2l3.5 3.5M2.5 9v4.5h11V9" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The chrome's ink: cream on a dark ground, ink on a light one. */
function inkOf(ground: string): string {
  return [INK.cream, INK.marigold, INK.pink, INK.tomato].includes(ground as never) ? INK.ink : INK.cream;
}

function masthead(p: Poster, ink: string): string {
  return `<div class="rc-mast" data-zone="head" style="color:${ink}"><p class="rc-t rc-j">HITMAN CRICKET</p><p class="rc-t rc-s rc-season">SEASON '26</p>`
    + `<p class="rc-t rc-j">${String(p.n).padStart(2, '0')}</p><p class="rc-t rc-j rc-of">/${p.of}</p></div>`;
}

function footer(p: Poster, ink: string, ground: string, keyInk = ink, keyText = ground): string {
  const facts = p.facts.map((f: Fact) => `<div class="rc-fact"><b>${esc(f.label)}</b><span>${esc(f.value)}</span></div>`).join('');
  return `<div class="rc-rule rc-in" style="color:${ink};--d:${AT.foot}ms"></div>`
    + `<div class="rc-facts rc-in" style="color:${ink};--d:${AT.foot}ms">${facts}</div>`
    + (p.id === 'season' ? '' : `<button class="rc-share rc-pop" data-share style="background:${keyInk};color:${keyText};--d:${AT.share}ms">${SHARE_ICON(keyText)}<span>SHARE</span></button>`);
}

// --- The posters, one by one, from the Figma frames' own numbers. ---

function cover(p: CoverPoster): string {
  const disc_ = { pink: INK.pink, cobalt: INK.cobalt, marigold: INK.marigold }[p.disc];
  const arch = p.arch === 'cream' ? INK.cream : INK.lime;
  return plate(18, 62, 6, 122, disc_, INK.lime, 'SEASON') + plate(18, 158, 6, 122, disc_, INK.cream, "'26", AT.figure + 120)
    + sparkle(344, 200, 32, INK.pink) + sparkle(329, 241, 14, INK.cyan)
    + `<div class="rc-t rc-rise" style="${css({ left: 24, top: 326, width: 354, height: 462, background: arch, 'border-radius': '177px 177px 16px 16px', overflow: 'hidden', '--d': `${AT.shape}ms` })}">`
    + disc(27, 100, 300, disc_)
    + rect(0, 392, 354, 14, INK.night) + rect(0, 416, 354, 9, INK.night) + rect(0, 434, 354, 6, INK.night) + rect(0, 448, 354, 3, INK.night)
    + hero(36, 34, 308.6, 486, 'cover') + '</div>'
    + roast(247, 738, INK.night, INK.lime, p.roast)
    + footer(p, INK.cream, INK.night, INK.cream, INK.night);
}

function runs(p: RunsPoster): string {
  const COLOURS = [INK.ink, INK.cobalt, INK.cream, INK.tomato];
  const LABELS = [INK.cream, INK.cream, INK.ink, INK.ink];
  const most = Math.max(1, ...p.stumps.map(s => s.runs ?? 0));
  const heightOf = (r: number | null, tallest: number) => r === null ? 34 : Math.max(34, Math.round(r / most * tallest));
  // The roast stands over the right two stumps, or the left two, wherever they are short enough; else the stumps are cut down to make room.
  const fits = (tallest: number, pair: number[]) => pair.every(i => 770 - heightOf(p.stumps[i].runs, tallest) - (p.stumps[i].bail ? 64 : 36) > 466);
  let tallest = 308, roastAt: [number, number] = [238, 408];
  if (!fits(308, [2, 3])) { if (fits(308, [0, 1])) roastAt = [24, 408]; else tallest = 230; }
  let out = plate(16, 38, 7, 164, INK.tomato, INK.ink, p.runs.toLocaleString('en-IN'))
    + `<div class="rc-row" style="left:22px;top:204px"><p class="rc-t rc-j rc-in" style="font-size:80px;color:${INK.cobalt};--d:${AT.label}ms">RUNS</p>`
    + `<p class="rc-t rc-h rc-in" style="font-size:42px;color:${INK.ink};margin-top:18px;--d:${AT.label}ms">रन मशीन</p></div>`
    + t(24, 290, 'rc-j rc-in', p.average, { 'font-size': 38, color: INK.ink, '--d': `${AT.line}ms` })
    + sentence(24, 338, 230, INK.ink, `an innings, every innings counted. Your best was ${p.best.toLocaleString('en-IN')}.`);
  p.stumps.forEach((s, i) => {
    const x = 36 + i * 88, h = heightOf(s.runs, tallest), top = 770 - h, d = `${AT.shape + i * 80}ms`;
    out += rect(x, top, 66, h, COLOURS[i], { opacity: s.runs === null ? .35 : 1, '--d': d }, 'rc-rise');
    if (s.runs !== null && h > 40) out += rect(x, top + 16, 66, 3, INK.marigold, { '--d': d }, 'rc-in');
    out += t(x, top - 36, 'rc-j rc-in', s.runs === null ? '–' : s.runs.toLocaleString('en-IN'), { width: 66, 'text-align': 'center', 'font-size': 26, color: INK.ink, '--d': d });
    out += t(x, 746, 'rc-s rc-label rc-in', s.label, { width: 66, 'text-align': 'center', color: LABELS[i], '--d': d });
    if (s.bail) out += rect(x - 4, top - 46, 74, 8, INK.tomato, { 'border-radius': 4, '--d': `${AT.line}ms` }, 'rc-pop')
      + t(x - 2, top - 64, 'rc-s rc-label rc-in', 'MOST RUNS', { color: INK.ink, '--d': `${AT.line}ms` });
  });
  return out + rect(24, 770, 354, 4, INK.ink) + roast(roastAt[0], roastAt[1], INK.ink, INK.marigold, p.roast)
    + footer(p, INK.ink, INK.marigold);
}

function sixes(p: HitsPoster): string {
  const ring = (x: number, y: number, d: number, c: string) => disc(x, y, d, 'none', { border: `62px solid ${c}`, '--d': `${AT.shape}ms` });
  return ring(-370, 465, 1000, INK.tomato) + ring(-298, 537, 856, INK.marigold) + ring(-226, 609, 712, INK.green)
    + hero(184, 404, 209.7, 384, 'sixes') + rect(-600, 790, 1602, 900, INK.cream)
    + plate(16, 4, 8, 236, INK.cobalt, INK.tomato, p.count.toLocaleString('en-IN'), AT.figure, 'fig')
    + sparkle(320, 80, 40, INK.marigold) + sparkle(359, 127, 18, INK.tomato)
    + `<div class="rc-row" style="left:22px;top:234px"><p class="rc-t rc-j rc-in" style="font-size:80px;color:${INK.ink};--d:${AT.label}ms">SIXES</p>`
    + `<p class="rc-t rc-h rc-in" style="font-size:50px;color:${INK.green};margin-top:18px;--d:${AT.label}ms">${p.word}</p></div>`
    + t(24, 320, 'rc-j rc-in', p.distance, { 'font-size': 38, color: INK.cobalt, '--d': `${AT.line}ms` })
    + sentence(24, 368, 250, INK.ink, p.line)
    + roast(24, 684, INK.ink, INK.cream, p.roast) + footer(p, INK.ink, INK.cream);
}

function fours(p: HitsPoster): string {
  const stripes = [[700, 14], [724, 10], [743, 7], [758, 5], [771, 3]].map(([y, h]) => rect(-600, y, 1602, h, INK.cream, { '--d': `${AT.shape}ms` }, 'rc-in')).join('');
  return disc(104, 402, 316, INK.marigold) + stripes + hero(150, 386, 233.3, 404, 'fours')
    + `<svg class="rc-spark rc-pop" style="left:41px;top:690px;width:34px;height:34px;--d:${AT.shape}ms" viewBox="0 0 34 34"><circle cx="17" cy="17" r="17" fill="${INK.tomato}"/><path d="M10.2 1.4c7.3 10.4 7.3 20.9 0 31.3" stroke="${INK.cream}" stroke-width="2" stroke-dasharray="2.7 2.4" fill="none"/></svg>`
    + plate(16, 4, 8, 236, INK.ink, INK.cream, p.count.toLocaleString('en-IN'))
    + sparkle(362, 70, 36, INK.marigold)
    + `<div class="rc-row" style="left:22px;top:234px"><p class="rc-t rc-j rc-in" style="font-size:80px;color:${INK.marigold};--d:${AT.label}ms">FOURS</p>`
    + `<p class="rc-t rc-h rc-in" style="font-size:50px;color:${INK.cream};margin-top:18px;--d:${AT.label}ms">${p.word}</p></div>`
    + t(24, 320, 'rc-j rc-in', p.distance, { 'font-size': 38, color: INK.marigold, '--d': `${AT.line}ms` })
    + sentence(24, 368, 220, INK.cream, p.line)
    + roast(24, 616, INK.cream, INK.ink, p.roast) + footer(p, INK.cream, INK.field);
}

/** The clock at the peak hour: twelve ticks, the minute hand at twelve and the hour hand on the hour. */
function clock(hour: number, face: string, ink: string, pin: string): string {
  const cx = 125, cy = 125;
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, major = i % 3 === 0, r0 = major ? 101 : 111;
    ticks += `<line x1="${cx + Math.sin(a) * r0}" y1="${cy - Math.cos(a) * r0}" x2="${cx + Math.sin(a) * 117}" y2="${cy - Math.cos(a) * 117}" stroke="${ink}" stroke-width="${major ? 5 : 3}"/>`;
  }
  const a = (hour % 12) * Math.PI / 6;
  return `<svg class="rc-spark rc-pop" style="left:11px;top:449px;width:250px;height:250px;--d:${AT.shape}ms" viewBox="0 0 250 250"><circle cx="125" cy="125" r="125" fill="${face}"/>${ticks}`
    + `<line x1="125" y1="125" x2="125" y2="33" stroke="${ink}" stroke-width="7"/>`
    + `<line x1="125" y1="125" x2="${125 + Math.sin(a) * 62}" y2="${125 - Math.cos(a) * 62}" stroke="${ink}" stroke-width="9"/>`
    + `<circle cx="125" cy="125" r="9" fill="${pin}"/></svg>`;
}

function when(p: WhenPoster): string {
  const night = p.look === 'night';
  const ground = night ? INK.night : INK.cream, ink = night ? INK.cream : INK.ink;
  const [back, front] = night ? [INK.pink, INK.lime] : [INK.cobalt, INK.tomato];
  const size = p.clock.length > 4 ? 172 : night ? 204 : 192;
  return disc(-11, 427, 294, 'none', { border: `2px dashed ${night ? INK.pink : INK.ink}` })
    + clock(p.hour, night ? INK.lime : INK.marigold, night ? INK.night : INK.ink, night ? INK.pink : INK.tomato)
    + rect(-600, 784, 1602, 6, night ? INK.cyan : INK.ink)
    + hero(262, 424, 121.7, 366, 'when')
    + sparkle(236, 430, 24, night ? INK.pink : INK.tomato) + sparkle(36, 438, 16, night ? INK.cyan : INK.cobalt) + sparkle(229, 709, 14, night ? INK.lime : INK.green)
    + rect(-600, 790, 1602, 900, ground)
    + `<div class="rc-t" data-fit="366" style="left:16px;top:26px">${plate(0, 0, 8, size, back, front, p.clock)}</div>`
    + t(22, 238, 'rc-j rc-in', p.name, { 'font-size': 70, color: ink, '--d': `${AT.label}ms` })
    + hindi(24, 310, 38, night ? INK.cyan : INK.green, p.word)
    + `<div class="rc-row" style="left:24px;top:362px"><p class="rc-t rc-j rc-in" style="font-size:38px;color:${back};--d:${AT.line}ms">${Math.round(p.share * 100)}%</p>`
    + `<p class="rc-t rc-m rc-in" style="width:250px;color:${ink};margin-top:12px;--d:${AT.line}ms">${esc(p.line)}</p></div>`
    + roast(24, 716, night ? INK.cream : INK.ink, night ? INK.ink : INK.cream, p.roast) + footer(p, ink, ground);
}

function streak(p: StreakPoster): string {
  const size = String(p.figure).length > 2 ? 170 : 236;
  let out = plate(16, 4, 8, size, INK.ink, INK.marigold, String(p.figure), AT.figure, 'fig')
    + hindi(179, 78, p.kind === 'day' ? 50 : 40, INK.cream, p.word, {}, 'data-after="fig" data-gap="18"')
    + t(179, 140, 'rc-j rc-in', p.label, { 'font-size': 50, 'line-height': .88, color: INK.cream, '--d': `${AT.label}ms` }, 'data-after="fig" data-gap="18"')
    + sparkle(346, 262, 28, INK.marigold)
    + t(24, 262, 'rc-j rc-in', p.dates, { 'font-size': 38, color: INK.marigold, '--d': `${AT.line}ms` })
    + sentence(24, 310, 320, INK.cream, p.line);
  const most = Math.max(1, ...p.bars.map(b => b.innings));
  let first = -1, last = -1;
  p.bars.forEach((b, i) => {
    const x = 24 + i * 24, d = `${AT.shape + i * 30}ms`;
    out += t(x, 754, 'rc-s rc-in', b.date, { width: 18, 'text-align': 'center', 'font-size': 10, color: INK.cream, opacity: b.lit || (p.kind === 'day' && b.innings) ? 1 : .6, '--d': d });
    if (p.kind === 'streak') {
      if (b.lit) { if (first < 0) first = i; last = i; }
      const h = b.lit ? 250 : 84;
      out += rect(x, 742 - h, 18, h, b.lit ? (i % 2 === first % 2 ? INK.marigold : INK.cream) : INK.cream, { opacity: b.lit ? 1 : .3, '--d': d }, 'rc-rise');
      if (b.lit) out += rect(x, 742 - h + 12, 18, 2, INK.cobalt, { '--d': d }, 'rc-in');
    } else if (b.innings) {
      // A big day's stumps stand as tall as the innings on each day, the big day itself in gold.
      const h = Math.min(246, 46 + Math.round(200 * b.innings / most));
      out += rect(x, 742 - h, 18, h, b.lit ? INK.marigold : INK.cream, { '--d': d }, 'rc-rise')
        + rect(x, 742 - h + 12, 18, 2, INK.cobalt, { '--d': d }, 'rc-in')
        + t(x, 742 - h - 28, 'rc-j rc-in', String(b.innings), { width: 18, 'text-align': 'center', 'font-size': 20, color: INK.cream, '--d': d });
      if (b.lit) { first = last = i; }
    } else out += rect(x, 708, 18, 34, INK.cream, { opacity: .3, '--d': d }, 'rc-rise');
  });
  if (first >= 0) {
    const top = p.kind === 'streak' ? 480 : 742 - Math.min(246, 46 + 200) - 14;
    out += rect(24 + first * 24 - 5, top, (last - first) * 24 + 28, 8, INK.tomato, { 'border-radius': 4, '--d': `${AT.line}ms` }, 'rc-pop');
  }
  return out + rect(24, 742, 354, 4, INK.cream) + roast(24, 372, INK.cream, INK.ink, p.roast) + footer(p, INK.cream, INK.cobalt);
}

function kit(p: KitPoster): string {
  const back = /^#(C5|B8|8F|F2|E9|E8|D3|D5)/i.test(p.ink) ? INK.cobalt : INK.tomato;
  const chip = (y: number, colour: string, label: string) =>
    disc(25, y, 20, colour, { border: `2px solid ${INK.ink}`, '--d': `${AT.line}ms` }, 'rc-in')
    + t(52, y + 4, 'rc-s', label, { 'font-size': 10, 'letter-spacing': '.08em', color: INK.ink });
  return disc(18, 408, 392, 'none', { border: `10px solid ${INK.tomato}` }) + disc(46, 436, 336, INK.marigold)
    + hero(104, 404, 219.8, 386, 'kit') + rect(-600, 790, 1602, 900, INK.cream)
    + plate(16, 4, 8, 236, back, p.ink, p.innings.toLocaleString('en-IN'), AT.figure, 'fig')
    + `<div class="rc-t" data-after="fig" data-gap="12" style="left:277px;top:92px">${sparkle(0, 0, 36, INK.marigold)}</div>`
    + t(275, 158, 'rc-j rc-in', 'INNINGS\nIN', { 'font-size': 34, 'line-height': .9, color: INK.ink, '--d': `${AT.label}ms` }, 'data-after="fig" data-gap="12"')
    + `<div class="rc-row" style="left:22px;top:234px" data-fit="354"><p class="rc-t rc-j rc-in" data-size="80" style="font-size:80px;color:${INK.ink};--d:${AT.label}ms">${esc(p.name)}</p>`
    + `<p class="rc-t rc-h rc-in" style="font-size:50px;color:${INK.green};margin-top:18px;--d:${AT.label}ms">ड्रिप</p></div>`
    + sentence(24, 330, 330, INK.ink, p.line)
    + `<div class="rc-t rc-in" style="${css({ left: 16, top: 630, width: 92, height: 124, background: INK.cream, border: `2px solid ${INK.ink}`, 'border-radius': 12, '--d': `${AT.line}ms` })}"></div>`
    + t(24, 640, 'rc-s rc-label', 'COLOURWAY', { color: INK.ink })
    + chip(662, p.colours[0], 'SHIRT') + chip(692, p.colours[1], 'TRIM') + chip(722, p.colours[2], 'PADS')
    + roast(-24, 742, INK.ink, INK.cream, p.roast) + footer(p, INK.ink, INK.cream);
}

function bat(p: BatPoster): string {
  let rays = '';
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, long = i % 2 === 0, r1 = 228, r0 = long ? 184 : 204;
    rays += `<line x1="${201 + Math.sin(a) * r0}" y1="${606 - Math.cos(a) * r0}" x2="${201 + Math.sin(a) * r1}" y2="${606 - Math.cos(a) * r1}" stroke="${INK.ink}" stroke-width="5"/>`;
  }
  return `<svg data-zone="mid" class="rc-spark rc-pop" style="left:0;top:0;width:402px;height:874px;--d:${AT.shape}ms" viewBox="0 0 402 874">${rays}</svg>`
    + disc(36, 441, 330, INK.marigold) + hero(52, 414, 295.1, 380, 'bat') + rect(-600, 790, 1602, 900, INK.tomato)
    + plate(16, 4, 8, 236, INK.ink, INK.cream, p.innings.toLocaleString('en-IN'), AT.figure, 'fig')
    + hindi(257, 78, 50, INK.ink, 'बीस्ट', {}, 'data-after="fig" data-gap="14"')
    + t(257, 144, 'rc-j rc-in', 'INNINGS\nWITH', { 'font-size': 44, 'line-height': .88, color: INK.ink, '--d': `${AT.label}ms` }, 'data-after="fig" data-gap="14"')
    + `<div data-fit="354" class="rc-t" style="left:22px;top:220px">${plate(0, 0, 5, 96, INK.ink, INK.cream, p.name, AT.label)}</div>`
    + sentence(24, 334, 330, INK.ink, 'Your most-used bat. It has seen things.')
    + roast(24, 728, INK.ink, INK.cream, p.roast) + footer(p, INK.ink, INK.tomato);
}

const SLICES = {
  world: { points: '201,478 255.2,567.3 146.8,567.3', label: [180, 531.3, 11, 'WORLD\nCLASS'], colour: INK.lime },
  state: { points: '143.2,573.3 258.8,573.3 287.7,621 114.3,621', label: [158.5, 589.2, 12, 'STATE LEVEL'], colour: INK.cyan },
  club: { points: '110.7,627 291.3,627 324.3,681.5 77.7,681.5', label: [157.5, 646.2, 13, 'CLUB LEVEL'], colour: INK.pink },
  gully: { points: '74,687.5 328,687.5 378,770 24,770', label: [141, 719.7, 14, 'GULLY CRICKET'], colour: 'rgba(242,232,213,.2)' },
} as const;
const UP = ['gully', 'club', 'state', 'world'] as const;

function rank(p: RankPoster, avatar: string): string {
  const reached = UP.indexOf(p.slice);
  let shapes = '', labels = '';
  UP.forEach((s, i) => {
    const sl = SLICES[s];
    // Their slice in lime, the ones under it in their own colours, the steps not yet reached in outline.
    const fill = i === reached ? INK.lime : i < reached ? sl.colour : 'none';
    const stroke = i > reached ? 'rgba(242,232,213,.5)' : '#000';
    shapes += `<polygon points="${sl.points}" fill="${fill}" stroke="${stroke}" stroke-width="${i > reached ? 2 : 1}"/>`;
    const [x, y, size, text] = sl.label;
    const dark = fill !== 'none' && s !== 'gully' || (s === 'gully' && i === reached);
    labels += t(x as number, y as number, 'rc-s rc-in', text as string, {
      'font-size': size as number, 'letter-spacing': '.1em', 'line-height': 1.2, 'text-align': 'center',
      color: dark ? INK.ink : INK.cream, opacity: i > reached ? .75 : 1, '--d': `${AT.shape}ms`,
    });
  });
  const face = p.slice === 'world' ? { x: 142, y: 385, d: 118 } : { state: { x: 86, y: 550, d: 78 }, club: { x: 51.2, y: 607.2, d: 78 }, gully: { x: 19, y: 681.7, d: 78 } }[p.slice as 'state' | 'club' | 'gully'];
  const inner = face.d === 118 ? 96 : 60;
  const avatarHtml = disc(face.x, face.y, face.d, 'none', { border: `3px solid ${INK.pink}`, '--d': `${AT.hero}ms` })
    + disc(face.x + (face.d - inner - 10) / 2, face.y + (face.d - inner - 10) / 2, inner + 10, INK.lime, { '--d': `${AT.hero}ms` })
    + `<img class="rc-t rc-pop" alt="" src="${esc(avatar)}" style="${css({ left: face.x + (face.d - inner) / 2, top: face.y + (face.d - inner) / 2, width: inner, height: inner, 'border-radius': '50%', 'object-fit': 'cover', '--d': `${AT.hero}ms` })}">`
    + `<div class="rc-t rc-pop" style="${css({ left: face.x + face.d * .75, top: face.y - 9, height: 22, padding: '4px 10px', background: INK.pink, 'border-radius': 9, '--d': `${AT.hero + 120}ms` })}"><p class="rc-s" style="font-size:11px;letter-spacing:.1em;color:${INK.ink};margin:0">YOU</p></div>`;
  const place = `#${p.place.toLocaleString('en-IN')}`;
  const callout = p.slice === 'world'
    ? t(274, 420, 'rc-j rc-in', place, { 'font-size': 40, color: INK.lime, '--d': `${AT.line}ms` })
      + t(276, 474, 'rc-s rc-in', p.callout.join('\n'), { 'font-size': 10, 'letter-spacing': '.1em', 'line-height': 1.35, color: 'rgba(242,232,213,.8)', '--d': `${AT.line}ms` })
    : t(0, 424, 'rc-j rc-in', place, { right: 24, left: 'auto', 'font-size': 36, color: INK.lime, '--d': `${AT.line}ms` })
      + t(0, 472, 'rc-s rc-in', p.callout.join('\n'), { right: 24, left: 'auto', 'text-align': 'right', 'font-size': 10, 'letter-spacing': '.1em', 'line-height': 1.35, color: 'rgba(242,232,213,.8)', '--d': `${AT.line}ms` });
  const share = `${Math.max(1, Math.ceil(p.share * 100))}%`;
  const headline = p.kind === 'count'
    ? plate(16, 38, 7, 164, INK.pink, INK.lime, p.behind.toLocaleString('en-IN'))
      + t(22, 206, 'rc-j rc-in', 'BEHIND YOU', { 'font-size': 58, color: INK.cream, '--d': `${AT.label}ms` })
      + hindi(24, 262, 44, INK.cyan, p.word) + sentence(24, 336, 354, INK.cream, p.line)
    : (share.length <= 2 ? plate(16, 4, 8, 236, INK.pink, INK.lime, share, AT.figure, 'fig') : plate(16, 80, 7, 160, INK.pink, INK.lime, share, AT.figure, 'fig'))
      + t(269, 64, 'rc-j rc-in', 'TOP', { 'font-size': 64, color: INK.cream, '--d': `${AT.label}ms` }, 'data-after="fig" data-gap="20"')
      + t(271, 136, 'rc-j rc-in', 'OF ALL\nBATTERS', { 'font-size': 28, 'line-height': .92, color: INK.cream, '--d': `${AT.label}ms` }, 'data-after="fig" data-gap="22"')
      + hindi(24, 240, 44, INK.cyan, p.word) + sentence(24, 318, 354, INK.cream, p.line);
  return `<svg data-zone="mid" class="rc-spark rc-rise" style="left:0;top:0;width:402px;height:874px;--d:${AT.shape}ms" viewBox="0 0 402 874">${shapes}</svg>` + labels
    + avatarHtml + callout
    + sparkle(118, 394, 20, INK.lime) + sparkle(62, 582, 16, INK.cyan) + sparkle(335, 603, 14, INK.pink)
    + roast(24, p.slice === 'world' ? 432 : 420, INK.cream, INK.ink, p.roast) + headline + footer(p, INK.cream, INK.night);
}

/** Each type's ground, inks, shape and where its words stand (the section "Cover kits, six personalities, day and night"). */
interface TypeLook {
  ink: string; you: number; top: [number, number, number, string, string]; bottom?: [number, number, number, string, string];
  hindi: [number, number, number, string]; figure: string; roast: [number, number, string, string]; shape: string; hero: [number, number, number, number];
  sentenceX?: number;
}
function typeLook(type: TypeId): TypeLook {
  switch (type) {
    case 'six': return {
      ink: INK.ink, you: 70, top: [18, 42, 180, INK.ink, INK.lime], bottom: [18, 194, 96, INK.ink, INK.cream], hindi: [246, 96, 40, INK.ink],
      figure: INK.ink, roast: [24, 396, INK.ink, INK.cream], hero: [133, 404, 188, 396],
      shape: disc(36, 432, 344, 'none', { border: `30px dashed ${INK.ink}` }) + disc(43, 439, 330, INK.ink) + disc(58, 454, 300, INK.lime),
    };
    case 'artist': return {
      ink: INK.cream, you: 91, top: [18, 86, 144, INK.ink, INK.marigold], hindi: [22, 236, 46, INK.cream], figure: INK.marigold,
      roast: [24, 376, INK.cream, INK.ink], hero: [133, 400, 137, 400],
      shape: `<div class="rc-t rc-pop" style="left:69px;top:440px;width:264px;height:350px;--d:${AT.shape}ms">${rect(0, 0, 264, 350, INK.ink, { 'border-radius': 8 })}${rect(10, 10, 244, 330, INK.marigold, { 'border-radius': 4 })}${rect(30, 30, 204, 290, INK.ink, { 'border-radius': 2 })}${rect(36, 36, 192, 278, '#E5ACFF')}</div>`,
    };
    case 'wall': {
      let bricks = '';
      for (let row = 0; row < 9; row++) for (let i = 0; i < 6; i++) bricks += rect((row % 2 ? -36 : -76) + i * 80, 4 + row * 38, 72, 30, INK.cream, { 'border-radius': 3 });
      return {
        ink: INK.ink, you: 70, top: [18, 49, 180, INK.ink, INK.cream], hindi: [22, 236, 46, INK.ink], figure: INK.ink,
        roast: [24, 376, INK.ink, INK.cream], hero: [92, 400, 218, 400],
        shape: `<div class="rc-t rc-pop" style="left:46px;top:452px;width:310px;height:340px;background:${INK.ink};border-radius:14px;overflow:hidden;--d:${AT.shape}ms">${bricks}</div>`,
      };
    }
    case 'finisher': return {
      ink: INK.cream, you: 122, top: [18, 124, 108, INK.pink, INK.lime], hindi: [22, 236, 46, INK.cyan], figure: INK.pink,
      roast: [24, 376, INK.cream, INK.ink], hero: [88, 440, 226, 360],
      shape: disc(46, 454, 310, INK.cyan) + `<svg class="rc-spark rc-pop" style="left:56px;top:424px;width:240px;height:370px;--d:${AT.shape + 80}ms" viewBox="0 0 240 370"><path fill="${INK.lime}" d="M150 0 0 200h100L55 370 240 140H138L200 0Z"/></svg>`,
    };
    case 'grinder': {
      let tally = '';
      for (let row = 0; row < 5; row++) for (let g = 0; g < 4; g++) {
        const x = (row % 2 ? 38 : 18) + g * 74, y = 22 + row * 58;
        for (let b = 0; b < 4; b++) tally += rect(x + b * 12, y, 5, 38, INK.ink, { 'border-radius': 2 });
        tally += rect(x - 6, y + 30, 58, 5, INK.tomato, { 'border-radius': 2, transform: 'rotate(-28deg)', 'transform-origin': '0 50%' });
      }
      return {
        ink: INK.ink, you: 122, top: [18, 124, 108, INK.ink, INK.cream], hindi: [22, 236, 46, INK.ink], figure: INK.ink,
        roast: [24, 376, INK.ink, INK.cream], hero: [109, 400, 185, 400],
        shape: disc(36, 440, 330, INK.ink) + `<div class="rc-t rc-pop" style="left:46px;top:450px;width:310px;height:310px;border-radius:50%;overflow:hidden;background:${INK.cream};--d:${AT.shape}ms">${tally}</div>`,
      };
    }
    case 'newball': return {
      ink: INK.ink, you: 70, top: [18, 42, 180, INK.ink, INK.lime], bottom: [18, 168, 124, INK.ink, INK.cream], hindi: [248, 214, 46, INK.ink],
      figure: INK.ink, roast: [-24, 736, INK.ink, INK.cream], hero: [96, 398, 224, 400], sentenceX: 76,
      shape: disc(36, 432, 344, INK.ink) + disc(50, 446, 316, INK.cream)
        + `<svg data-zone="mid" class="rc-spark rc-pop" style="left:0;top:0;width:402px;height:874px;--d:${AT.shape}ms" viewBox="0 0 402 874"><path d="M137 518Q60 604 137 690M265 518Q342 604 265 690" stroke="${INK.tomato}" stroke-width="5" stroke-dasharray="10 8" fill="none"/></svg>`,
    };
  }
}

function type(p: TypePoster): string {
  const l = typeLook(p.type);
  const [hx, hy, hw, hh] = l.hero;
  const [tx, ty, ts, tb, tf] = l.top;
  let out = l.shape + hero(hx, hy, hw, hh, 'type') + rect(-600, 790, 1602, 900, p.ground)
    + t(26, l.you, 'rc-s rc-in', 'YOU ARE THE', { 'font-size': 12, 'letter-spacing': '.16em', color: l.ink, '--d': `${AT.figure}ms` })
    + plate(tx, ty, 7, ts, tb, tf, p.top, AT.figure, 'top');
  if (l.bottom && p.bottom) { const [bx, by, bs, bb, bf] = l.bottom; out += plate(bx, by, 6, bs, bb, bf, p.bottom, AT.figure + 120); }
  const [ix, iy, is, ic] = l.hindi;
  out += hindi(ix, iy, is, ic, p.word, { 'line-height': 1.12, 'white-space': p.type === 'six' ? 'pre' : 'nowrap' })
    + `<div class="rc-row" style="left:24px;top:314px"><p class="rc-t rc-j rc-in" style="font-size:38px;color:${l.figure};--d:${AT.line}ms">${esc(p.figure)}</p>`
    + `<p class="rc-t rc-m rc-in" style="line-height:1.35;color:${l.ink};margin-top:14px;white-space:pre;--d:${AT.line}ms">${esc(p.line)}</p></div>`;
  const [rx, ry, rb, rf] = l.roast;
  return out + roast(rx, ry, rb, rf, p.roast) + footer(p, l.ink, p.ground);
}

function season(p: SeasonPoster): string {
  const two = p.lines.length > 1;
  const tiles = p.tiles.map((tile, i) => {
    const x = 24 + (i % 2) * 114, y = 262 + Math.floor(i / 2) * 96, d = `${AT.shape + i * 70}ms`;
    return rect(x, y, 106, 88, tile.ground, { 'border-radius': 14, border: tile.outlined ? `2px solid ${INK.ink}` : 'none', '--d': d }, 'rc-pop')
      + t(x + 11, y + 2, 'rc-j rc-in', tile.value, { 'font-size': 38, color: tile.ink, '--d': d }, 'data-fit-w="88"')
      + t(x + 12, y + 64, 'rc-s rc-in', tile.label, { 'font-size': 10, 'letter-spacing': '.08em', color: tile.ink, '--d': d });
  }).join('');
  const set = p.set.map((s, i) => {
    const x = 24 + (i % 5) * 44, y = 580 + Math.floor(i / 5) * 54, ink = inkOf(s.ground);
    return rect(x, y, 38, 48, s.ground, { 'border-radius': 6, border: s.outlined ? `2px solid ${INK.ink}` : 'none', '--d': `${AT.line + i * 40}ms` }, 'rc-pop')
      + t(x, y + 17, 'rc-s', String(s.n).padStart(2, '0'), { width: 38, 'text-align': 'center', 'font-size': 11, color: ink });
  }).join('');
  return (two ? '' : t(26, 70, 'rc-s rc-in', 'MY SEASON, ALL OF IT', { 'font-size': 12, 'letter-spacing': '.16em', color: INK.ink, '--d': `${AT.figure}ms` }))
    + `<div class="rc-t" data-name="${two ? 2 : 1}" style="left:18px;top:${two ? 60 : 48}px;width:360px;height:${two ? 182 : 194}px">${p.lines.map((line, i) =>
      `<div class="rc-name-line" data-line="${i}">${plate(0, 0, 6, two ? 88 : 150, INK.tomato, INK.cobalt, line)}</div>`).join('')}</div>`
    + `<div class="rc-roast rc-pop" style="${css({ left: 24, top: 206, background: INK.ink, color: INK.marigold, '--d': `${AT.label}ms`, 'letter-spacing': '0' })}">${esc(p.tag)}</div>`
    + hindi(137, 208, 22, INK.green, 'लेजेंड', {}, 'data-after-roast="1"')
    + rect(258, 276, 120, 404, INK.marigold, { '--d': `${AT.shape}ms` }, 'rc-rise') + rect(258, 664, 120, 16, INK.tomato)
    + hero(250, 246, 136, 440, 'season')
    + tiles
    + t(24, 560, 'rc-s', 'THE SET · ' + `${p.of} POSTERS`, { 'font-size': 10, 'letter-spacing': '.12em', color: INK.ink })
    + set
    + `<button class="rc-t rc-pop" data-share style="${css({ left: 24, top: 712, width: 354, height: 64, background: INK.ink, 'border-radius': 18, border: 0, padding: 0, cursor: 'pointer', '--d': `${AT.share}ms` })}">`
    + `<span class="rc-j" style="position:absolute;left:22px;top:10px;font-size:30px;color:${INK.cream}">SHARE MY SEASON</span>`
    + `<span style="position:absolute;left:300px;top:12px;width:40px;height:40px;border-radius:50%;background:${INK.marigold};display:flex;align-items:center;justify-content:center">${SHARE_ICON(INK.ink).replace('<svg ', '<svg style="width:19px;height:19px" ')}</span></button>`
    + footer(p, INK.ink, INK.cream);
}

function posterMarkup(p: Poster, avatar: string): string {
  const ground = groundOf(p as never);
  const ink = p.id === 'type' ? typeLook((p as TypePoster).type).ink : inkOf(ground);
  const body = {
    cover: () => cover(p as CoverPoster), runs: () => runs(p as RunsPoster), sixes: () => sixes(p as HitsPoster), fours: () => fours(p as HitsPoster),
    when: () => when(p as WhenPoster), streak: () => streak(p as StreakPoster), kit: () => kit(p as KitPoster), bat: () => bat(p as BatPoster),
    rank: () => rank(p as RankPoster, avatar), type: () => type(p as TypePoster), season: () => season(p as SeasonPoster),
  }[p.id]();
  return `<section class="rc-poster" data-poster="${p.id}" data-ink="${ink}" data-ground="${ground}">${body}${masthead(p, ink)}</section>`;
}

/** Sizes what was laid out against what it has to fit: names, figures and the words that stand beside them. */
function settle(root: HTMLElement) {
  for (const poster of root.querySelectorAll<HTMLElement>('.rc-poster')) {
    // A row too wide for its place comes down in size until it fits.
    for (const row of poster.querySelectorAll<HTMLElement>('[data-fit]')) {
      const max = Number(row.dataset.fit);
      for (const el of row.querySelectorAll<HTMLElement>('.rc-j')) {
        let size = parseFloat(el.style.fontSize);
        while (row.scrollWidth > max && size > 40) { size -= 4; row.querySelectorAll<HTMLElement>('.rc-j').forEach(j => { j.style.fontSize = `${size}px`; }); }
        break;
      }
    }
    for (const el of poster.querySelectorAll<HTMLElement>('[data-fit-w]')) {
      let size = parseFloat(el.style.fontSize);
      while (el.offsetWidth > Number(el.dataset.fitW) && size > 18) { size -= 2; el.style.fontSize = `${size}px`; }
    }
    // The season card's name: as big as fits, never under Jaro 50, the back plate's offset shrinking with it.
    const name = poster.querySelector<HTMLElement>('[data-name]');
    if (name) {
      const two = name.dataset.name === '2';
      const lines_ = [...name.querySelectorAll<HTMLElement>('.rc-name-line')];
      const widest = () => Math.max(...lines_.map(l => l.querySelector<HTMLElement>('[data-front], .rc-j:last-child')!.offsetWidth));
      let size = two ? 88 : 150;
      const setSize = (s: number) => lines_.forEach((l, i) => l.querySelectorAll<HTMLElement>('.rc-j').forEach((j, k) => {
        const off = s >= 110 ? 6 : s >= 70 ? 5 : 4;
        j.style.fontSize = `${s}px`; j.style.lineHeight = '1.25';
        const lineTop = two ? i * s * .95 : 0;
        j.style.top = `${lineTop + (k === 0 ? off : 0)}px`; j.style.left = `${k === 0 ? off : 0}px`;
      }));
      setSize(size);
      while (widest() > 348 && size > 50) { size -= 2; setSize(size); }
      // The name sits on the line above the tag: its foot at the tag's top.
      const height = (two ? size * .95 : 0) + size * 1.25;
      name.style.top = `${242 - height}px`;
    }
    // Words that stand beside a figure follow its width.
    for (const el of poster.querySelectorAll<HTMLElement>('[data-after]')) {
      const fig = poster.querySelector<HTMLElement>(`[data-front="${el.dataset.after}"]`);
      if (fig) el.style.left = `${fig.offsetLeft + fig.offsetWidth + Number(el.dataset.gap ?? 14)}px`;
    }
    const pill = poster.querySelector<HTMLElement>('.rc-roast');
    for (const el of poster.querySelectorAll<HTMLElement>('[data-after-roast]')) if (pill) el.style.left = `${pill.offsetLeft + pill.offsetWidth + 12}px`;
  }
}

/** The cream edge round a cut-out: the figure's silhouette stamped round a circle under it. */
export function dieCut(src: HTMLCanvasElement, edge: number, colour: string = INK.cream): HTMLCanvasElement {
  const pad = Math.ceil(edge) + 2;
  const out = document.createElement('canvas'); out.width = src.width + pad * 2; out.height = src.height + pad * 2;
  const sil = document.createElement('canvas'); sil.width = src.width; sil.height = src.height;
  const s = sil.getContext('2d')!; s.drawImage(src, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = colour; s.fillRect(0, 0, sil.width, sil.height);
  const ctx = out.getContext('2d')!;
  for (const r of [edge, edge * .66, edge * .33]) for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    ctx.drawImage(sil, pad + Math.cos(a) * r, pad + Math.sin(a) * r);
  }
  ctx.drawImage(src, pad, pad);
  return out;
}

/**
 * Where the middle of each poster begins: what is above stays at the top, the
 * footer (from 790) stands on the screen's foot, and the middle — the batter
 * and the poster's shape — gives up height on a screen shorter than the
 * design's, or stands centred on a taller one.
 */
const MIDDLE: Partial<Record<string, number>> = { cover: 320, season: 246 };
const FOOT = 790;

/** Each piece of each poster into its zone: top, middle or foot, by where it stands (or its own `data-zone`). */
function zone(root: HTMLElement) {
  for (const sec of root.querySelectorAll<HTMLElement>('.rc-poster')) {
    const split = MIDDLE[sec.dataset.poster!] ?? 376;
    const zones = Object.fromEntries(['head', 'top', 'mid', 'foot'].map(z => {
      const div = document.createElement('div'); div.className = 'rc-zone'; div.dataset.z = z; return [z, div];
    }));
    for (const el of [...sec.children] as HTMLElement[]) {
      const top = el.offsetTop;
      const z = el.dataset.zone ?? (top >= FOOT - 1 ? 'foot' : top >= split ? 'mid' : 'top');
      zones[z].append(el);
    }
    sec.dataset.split = String(split);
    sec.append(zones.head, zones.top, zones.mid, zones.foot);
  }
}

/** Under the masthead, the part of a poster that gives up height on a short screen. */
const HEAD = 56;

/**
 * Lays a poster's zones into a frame `tall` design pixels high. The masthead
 * keeps its place and the footer stands on the screen's foot; on a shorter
 * screen the headline and the middle between them come down together by the
 * one scale, about the poster's centre line, so neither shrinks alone; on a
 * taller one the middle stands centred in the room.
 */
function fitZones(sec: HTMLElement, tall: number) {
  const split = Number(sec.dataset.split), extra = tall - 874;
  const top = sec.querySelector<HTMLElement>('[data-z="top"]')!;
  const mid = sec.querySelector<HTMLElement>('[data-z="mid"]')!, foot = sec.querySelector<HTMLElement>('[data-z="foot"]')!;
  foot.style.transform = `translateY(${extra}px)`;
  if (extra >= 0) { top.style.transform = ''; mid.style.transform = `translateY(${extra / 2}px)`; return; }
  const s = Math.max(.5, (FOOT - HEAD + extra) / (FOOT - HEAD));
  top.style.transformOrigin = `201px ${HEAD}px`;
  top.style.transform = `scale(${s})`;
  mid.style.transformOrigin = `201px ${split}px`;
  mid.style.transform = `translateY(${-(split - HEAD) * (1 - s)}px) scale(${s})`;
}

export interface RecapOptions {
  /** The player's face for You vs everyone. */
  avatar: string;
  onClose?: () => void;
  /** Sends a poster as a picture; without it SHARE does nothing yet. */
  onShare?: (poster: Poster) => void;
  /** Renders the batters; a test can hand in its own. */
  renderer?: () => Promise<StillRenderer>;
  /** Where to start: the poster's place in the set. */
  start?: number;
  /** Room kept free under the poster, in screen pixels: the preview's keys. */
  foot?: number;
}

const DWELL = 6500, COVER_DWELL = 4000;

/** Opens the recap over `host` and hands back a way to close it. */
export async function openRecap(host: HTMLElement, posters: Poster[], opts: RecapOptions): Promise<{ close(): void; show(i: number): void; ready: Promise<void> }> {
  await Promise.all(['122px Jaro', '700 12px "Space Grotesk"', '500 13px "Space Grotesk"', '900 40px Poppins'].map(f =>
    document.fonts.load(f, f.includes('Poppins') ? 'रन मशीन' : 'AZ09').catch(() => undefined)));
  const root = document.createElement('div');
  root.className = 'rc';
  root.innerHTML = `<div class="rc-grain"></div><div class="rc-frame">${posters.map(p => posterMarkup(p, opts.avatar)).join('')}`
    + `<div class="rc-bars">${posters.map(() => '<span class="rc-bar"><i></i></span>').join('')}</div>`
    + `<button class="rc-close" aria-label="Close"><svg viewBox="0 0 22 22"><path d="M5 5l12 12M17 5 5 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button></div>`;
  host.append(root);
  const frame = root.querySelector<HTMLElement>('.rc-frame')!;
  settle(root);
  zone(root);
  const fit = () => {
    // The full width always: the poster is scaled to the screen's width and
    // takes whatever height that leaves (`fitZones`), never a card with bands
    // either side of it.
    const w = root.clientWidth, h = root.clientHeight - (opts.foot ?? 0);
    const k = w / 402, tall = h / k;
    frame.style.setProperty('--k', String(k));
    frame.style.height = `${tall}px`;
    for (const sec of root.querySelectorAll<HTMLElement>('.rc-poster')) fitZones(sec, tall);
  };
  fit();
  addEventListener('resize', fit);

  const sections = [...root.querySelectorAll<HTMLElement>('.rc-poster')];
  const bars = [...root.querySelectorAll<HTMLElement>('.rc-bar')];
  const chrome = [root.querySelector<HTMLElement>('.rc-bars')!, root.querySelector<HTMLElement>('.rc-close')!];
  let at = -1;
  const show = (i: number) => {
    i = Math.max(0, Math.min(posters.length - 1, i));
    sections.forEach(sec => sec.classList.remove('is-on'));
    at = i;
    const s = sections[i];
    root.style.setProperty('--rc-ground', s.dataset.ground!);
    chrome.forEach(c => { c.style.color = s.dataset.ink!; });
    bars.forEach((b, k) => {
      b.classList.toggle('is-done', k < i || (k === i && i === posters.length - 1));
      b.classList.toggle('is-now', k === i && i < posters.length - 1);
      b.innerHTML = '<i></i>';
    });
    const dwell = i === 0 ? COVER_DWELL : DWELL;
    root.style.setProperty('--rc-ms', `${dwell}ms`);
    requestAnimationFrame(() => sections.forEach((sec, k) => sec.classList.toggle('is-on', k === i)));
    queue(i);
  };
  root.addEventListener('animationend', e => {
    if ((e.target as HTMLElement).parentElement?.classList.contains('is-now') && e.animationName === 'rc-fill') show(at + 1);
  });

  // A tap on the right two thirds goes on, the left third goes back; a hold pauses.
  let down = 0, holdTimer = 0;
  root.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('button')) return;
    down = performance.now();
    holdTimer = window.setTimeout(() => root.classList.add('is-held'), 220);
  });
  root.addEventListener('pointerup', e => {
    clearTimeout(holdTimer);
    if (!down) return;
    const held = root.classList.contains('is-held');
    root.classList.remove('is-held');
    down = 0;
    if (held) return;
    const box = root.getBoundingClientRect();
    show(e.clientX - box.left < box.width / 3 ? at - 1 : at + 1);
  });
  root.addEventListener('pointercancel', () => { clearTimeout(holdTimer); root.classList.remove('is-held'); down = 0; });
  root.addEventListener('click', e => {
    const share = (e.target as HTMLElement).closest('[data-share]');
    if (share) opts.onShare?.(posters[at]);
  });
  const close = () => {
    removeEventListener('resize', fit); removeEventListener('keydown', key);
    stills?.dispose(); stills = null; closed = true;
    root.remove(); opts.onClose?.();
  };
  root.querySelector('.rc-close')!.addEventListener('click', close);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === ' ') show(at + 1);
    else if (e.key === 'ArrowLeft') show(at - 1);
  };
  addEventListener('keydown', key);

  // The batters, rendered one at a time, the poster in front first.
  let stills: StillRenderer | null = null, closed = false, busy: Promise<void> = Promise.resolve();
  const done = new Set<number>();
  const order = (from: number) => [...posters.keys()].sort((a, b) => ((a - from + posters.length) % posters.length) - ((b - from + posters.length) % posters.length));
  const queue = (_from: number) => {
    busy = busy.then(async () => {
      for (;;) {
        // Always the next undone batter from the poster in front, so a skip ahead is drawn first.
        const next = order(at).find(i => !done.has(i) && posters[i].hero);
        if (closed || next === undefined) return;
        done.add(next);
        stills ??= await (opts.renderer ?? (async () => (await import('../game/recap-render')).createStillRenderer()))();
        await paintHero(sections[next], posters[next].hero!, stills);
        await new Promise(r => setTimeout(r, 0));
      }
    }).catch(error => console.error('A recap batter could not be rendered.', error));
  };
  show(opts.start ?? 0);
  return { close, show, ready: busy.then(() => busy) };
}

/** Renders one poster's batter into its box, cut out with the cream edge. */
async function paintHero(section: HTMLElement, ask: HeroAsk, stills: StillRenderer) {
  const box = section.querySelector<HTMLElement>('[data-hero]');
  if (!box) return;
  const bat = ask.only === 'bat';
  const still = await stills.render({
    kit: ask.kit, bat: ask.bat, guard: ask.guard, shot: ask.shot, age: ask.age, az: ask.az, el: ask.el, fov: ask.fov,
    only: ask.only, finish: 'studio', width: bat ? 760 : 640, height: bat ? 760 : 960, margin: 4, dist: .8,
  });
  const cut = dieCut(still, Math.max(5, Math.round(still.height * .009)));
  box.replaceChildren(cut);
  box.classList.add('is-ready');
}
