/**
 * The innings-end card's parts, as UI v1 draws them (the handover's section 05).
 *
 * The card itself is one skeleton for every mode — the black header with the
 * mode's name, a band in the mode's colour carrying the total, the figures,
 * then the player card, the career key and the keys along the foot — and it
 * lives in HUD.ts beside the logic that fills it. What is here is the drawing
 * that is new and worth holding to a test: the Blast's over-by-over chart.
 */

import { icon } from './Kit';

/** A ball as the chart needs it: the runs off it, and whether it got him out. */
export interface ChartBall {
  runs: number;
  isWicket: boolean;
}

/**
 * How tall a ball's bar stands, out of 42: a six fills it, a four is two
 * thirds, and the ones, twos and threes climb in between; a dot is the empty
 * track. A wicket fills it in red, whatever the runs.
 */
export function barHeight(ball: ChartBall): number {
  if (ball.isWicket) return 42;
  return ({ 0: 0, 1: 10, 2: 16, 3: 22, 4: 28, 5: 28 } as Record<number, number>)[ball.runs] ?? 42;
}

/** Which colour a bar is: a six, a four, a wicket, or the rest. */
export function barKind(ball: ChartBall): 'six' | 'four' | 'out' | 'run' | 'dot' {
  if (ball.isWicket) return 'out';
  if (ball.runs >= 6) return 'six';
  if (ball.runs >= 4) return 'four';
  return ball.runs > 0 ? 'run' : 'dot';
}

/**
 * Over by over: six bars an over, the over's number and its runs under them,
 * and a legend for the three colours that mean something. The whole innings
 * is always drawn, so the overs he never reached stay on it as empty tracks —
 * three wickets inside two overs looks like it.
 */
export function overChartMarkup(history: readonly ChartBall[], totalBalls: number, perOver = 6): string {
  const overs = Math.ceil(totalBalls / perOver);
  const columns = Array.from({ length: overs }, (_, over) => {
    const balls = Array.from({ length: perOver }, (_, i) => history[over * perOver + i]);
    const runs = balls.reduce((sum, ball) => sum + (ball && !ball.isWicket ? ball.runs : 0), 0);
    const faced = balls.some(Boolean);
    const bars = balls.map(ball => ball
      ? `<i class="ec-bar is-${barKind(ball)}" style="--h:${barHeight(ball)}"></i>`
      : '<i class="ec-bar is-unfaced"></i>').join('');
    return `<div class="ec-over${faced ? '' : ' is-unbowled'}"><div class="ec-bars">${bars}</div>`
      + `<div class="ec-over-label"><span>OV ${over + 1}</span><b>${faced ? runs : ''}</b></div></div>`;
  }).join('');
  return `<div class="ec-chart-head">${icon('chart')}<span class="ec-chart-title">Over by over</span>`
    + '<span class="ec-key"><i class="is-six"></i>6</span><span class="ec-key"><i class="is-four"></i>4</span><span class="ec-key"><i class="is-out"></i>Wicket</span></div>'
    + `<div class="ec-columns" role="img" aria-label="Runs over by over">${columns}</div>`;
}

/** A wicket on the worm: the ball it fell on. */
export interface WormFall {
  ball: number;
  kind: 'out' | 'retired';
}

/**
 * The Test Marathon's run progression, as section 05 draws it: the running
 * total as a gold line over a gold wash, a red ball on it for every man gone,
 * a halo on the last point, the overs along the foot — and, for a player who
 * has batted one before, their best as a dashed green line to measure against,
 * with the scale stretched to whichever is higher. No axis of runs: the band
 * above already says the total.
 */
export function wormChartMarkup(perBall: readonly number[], falls: readonly WormFall[], best: number | null = null, ballsPerOver = 6): string {
  const W = 322, PLOT = 314, BASE = 62, TALL = 54.3;
  const running: number[] = [0];
  for (const runs of perBall) running.push(running[running.length - 1] + runs);
  const balls = perBall.length, total = running[balls];
  const top = Math.max(1, total, best ?? 0);
  const x = (ball: number) => (balls ? (ball / balls) * PLOT : 0);
  const y = (runs: number) => BASE - (runs / top) * TALL;
  const line = running.map((runs, ball) => `${x(ball).toFixed(1)},${y(runs).toFixed(1)}`).join(' ');
  const area = `0,${BASE} ${line} ${x(balls).toFixed(1)},${BASE}`;
  const overs = Math.max(1, Math.ceil(balls / ballsPerOver));
  const ticks: string[] = ['<text class="worm-x" x="0" y="74">0</text>'];
  for (let over = 5; over < overs; over += 5) {
    const at = x(over * ballsPerOver);
    if (at < PLOT - 34) ticks.push(`<text class="worm-x" x="${at.toFixed(1)}" y="74" text-anchor="middle">${over}</text>`);
  }
  ticks.push(`<text class="worm-x" x="${W}" y="74" text-anchor="end">${overs} ov</text>`);
  const ended = falls.find(fall => fall.ball === balls);
  const marks = falls.filter(fall => fall.ball <= balls && fall !== ended).map(fall =>
    `<circle class="worm-fall is-${fall.kind}" cx="${x(fall.ball).toFixed(1)}" cy="${y(running[fall.ball]).toFixed(1)}" r="4.5"/>`).join('');
  const endX = x(balls).toFixed(1), endY = y(total).toFixed(1);
  const end = `<circle class="worm-halo${ended ? '' : ' is-on'}" cx="${endX}" cy="${endY}" r="11"/>`
    + `<circle class="${ended ? `worm-fall is-${ended.kind} ` : ''}worm-end${ended ? '' : ' is-on'}" cx="${endX}" cy="${endY}" r="5"/>`;
  const grid = best ? `<line class="worm-best" x1="0" x2="${W}" y1="${y(best).toFixed(1)}" y2="${y(best).toFixed(1)}"/>`
    : '<line class="worm-grid" x1="0" x2="322" y1="6" y2="6"/>';
  const label = `Runs ball by ball: ${total} off ${balls}${falls.length ? `, ${falls.length} down` : ''}${best ? `, against a best of ${best}` : ''}`;
  return `<div class="ec-chart-head">${icon('chart')}<span class="ec-chart-title">Run progression</span>`
    + `${best ? `<span class="ec-key is-best"><i></i>Best ${best}</span>` : ''}<span class="ec-key"><i class="is-out"></i>Wicket</span></div>`
    + `<svg class="worm" viewBox="0 0 ${W} 78" role="img" aria-label="${label}">`
    + `<defs><linearGradient id="worm-wash" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f5b83d" stop-opacity=".42"/><stop offset="1" stop-color="#f5b83d" stop-opacity="0"/></linearGradient></defs>`
    + `${grid}<line class="worm-grid" x1="0" x2="322" y1="34" y2="34"/><line class="worm-base" x1="0" x2="322" y1="${BASE}" y2="${BASE}"/>`
    + `<polygon class="worm-area" points="${area}"/><polyline class="worm-line" points="${line}"/>${marks}${end}${ticks.join('')}</svg>`;
}

/** A batter as the batting card draws them. */
export interface BattingRow {
  title: string;
  left: boolean;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
}

/** The milestone a score reached, for the chip beside the name: 50, 100, 200 and on. */
export function milestoneChip(runs: number): string | null {
  if (runs >= 400) return '400';
  if (runs >= 300) return '300';
  if (runs >= 200) return '200';
  if (runs >= 150) return '150';
  if (runs >= 100) return '100';
  if (runs >= 50) return '50';
  return null;
}

/**
 * The Marathon's batting card: a card of its own under the band, a row a
 * batter — their number, their name, LH for the left-hander and a chip for the
 * milestone they passed — with runs, balls, fours and sixes.
 */
export function battingCardMarkup(batters: readonly BattingRow[]): string {
  const rows = batters.map((b, i) => {
    const chip = milestoneChip(b.runs);
    return `<tr><th scope="row"><span class="ec-bat-n">${i + 1}</span><span class="ec-bat-name">${b.title}</span>`
      + `${b.left ? '<i class="ec-chip">LH</i>' : ''}${chip ? `<i class="ec-chip is-milestone${b.runs >= 100 ? ' is-ton' : ''}">${chip}</i>` : ''}</th>`
      + `<td class="is-runs">${b.runs}</td><td>${b.balls}</td><td>${b.fours}</td><td>${b.sixes}</td></tr>`;
  }).join('');
  return `<table class="ec-batting"><thead><tr><th scope="col">BATTING</th><th scope="col" class="is-runs">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** How bad the injury is, in the word Survival's card uses: Light, High, or Severe once he is about done. */
export function injuryWord(percent: number): string {
  return percent >= 90 ? 'Severe' : percent >= 40 ? 'High' : 'Light';
}

/**
 * The injury ring: an arc from twelve o'clock, clockwise, as far round as the
 * injury is, a white dot where it ends, and the medical cross in the middle.
 */
export function injuryRingMarkup(percent: number): string {
  const share = Math.max(0, Math.min(100, percent)) / 100;
  const r = 19.8, c = 22;
  const angle = share * 2 * Math.PI;
  const dot = { x: c + r * Math.sin(angle), y: c - r * Math.cos(angle) };
  const length = 2 * Math.PI * r;
  return `<svg class="ec-ring" viewBox="0 0 44 44" aria-hidden="true">`
    + `<circle class="ec-ring-track" cx="22" cy="22" r="${r}"/>`
    + `<circle class="ec-ring-arc" cx="22" cy="22" r="${r}" stroke-dasharray="${(share * length).toFixed(2)} ${length.toFixed(2)}" transform="rotate(-90 22 22)"/>`
    + `<circle class="ec-ring-dot" cx="${dot.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="3"/>`
    + '<path class="ec-ring-cross" d="M19.6 15.3h4.8v4.3h4.3v4.8h-4.3v4.3h-4.8v-4.3h-4.3v-4.8h4.3z"/></svg>';
}
