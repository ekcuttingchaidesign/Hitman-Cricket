/**
 * The Test Marathon's end card, below the total: the worm and the scorecard.
 *
 * The Blast's card says an innings in a strip of thirty ball marks and three
 * figures, which is the whole of a five-over innings. A Marathon is a day of
 * it — three men, hundreds of balls — and the strip came out as a picket fence
 * with the batters run together in a line of text under it. So it borrows from
 * a broadcast instead: the worm, the runs climbing ball by ball with a red ball
 * where each man was out, and the batting card, a row a batter, the way a
 * scoreboard writes it.
 *
 * Strings of markup from figures, like the sheets, so both can be held in a
 * test with no browser in the room.
 */

export interface CardBatter {
  title: string;
  left: boolean;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  retired: boolean;
}

export interface CardTotal {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  overs: string;
}

/** Where a batter's innings ended, by the ball it ended on, and how. */
export interface Fall {
  ball: number;
  kind: 'out' | 'retired';
}

const strikeRate = (runs: number, balls: number) => (balls ? (runs / balls * 100).toFixed(1) : '–');

/** The balls each batter's innings ended on, from the balls each of them faced. */
export function fallsOf(batters: readonly CardBatter[]): Fall[] {
  let ball = 0;
  const falls: Fall[] = [];
  for (const batter of batters) {
    ball += batter.balls;
    if (batter.out || batter.retired) falls.push({ ball, kind: batter.out ? 'out' : 'retired' });
  }
  return falls;
}

/** A round step for an axis that gives no more than `most` divisions up to `max`. */
function stepFor(max: number, most: number, steps: readonly number[]): number {
  return steps.find(step => max / step <= most) ?? steps[steps.length - 1];
}

const W = 320, H = 116, LEFT = 28, RIGHT = 8, TOP = 10, BOTTOM = 20;

/**
 * The worm: runs against balls, one point a ball, the line starting at nought.
 * A red ball sits on the line where a batter was out, an amber one where he
 * was carried off. The axes are round numbers — runs in tens, fifties or
 * hundreds, balls labelled in overs — and only as many as fit.
 */
export function wormMarkup(perBall: readonly number[], falls: readonly Fall[], ballsPerOver = 6): string {
  const balls = perBall.length;
  const running: number[] = [0];
  for (const runs of perBall) running.push(running[running.length - 1] + runs);
  const total = running[running.length - 1];
  const yStep = stepFor(Math.max(total, 20), 4, [10, 20, 25, 50, 100, 200]);
  const yMax = Math.max(yStep, Math.ceil(Math.max(total, 1) / yStep) * yStep);
  const overs = Math.max(1, Math.ceil(balls / ballsPerOver));
  const overStep = stepFor(overs, 6, [1, 2, 5, 10, 20, 25, 50]);
  const xMax = Math.max(ballsPerOver, Math.ceil(overs / overStep) * overStep * ballsPerOver);
  const x = (ball: number) => LEFT + (ball / xMax) * (W - LEFT - RIGHT);
  const y = (runs: number) => TOP + (1 - runs / yMax) * (H - TOP - BOTTOM);
  const line = running.map((runs, ball) => `${x(ball).toFixed(1)},${y(runs).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${y(0).toFixed(1)} ${line} ${x(balls).toFixed(1)},${y(0).toFixed(1)}`;
  const grid: string[] = [];
  for (let runs = 0; runs <= yMax; runs += yStep) {
    grid.push(`<line class="worm-grid" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(runs).toFixed(1)}" y2="${y(runs).toFixed(1)}"/>`);
    grid.push(`<text class="worm-y" x="${LEFT - 6}" y="${(y(runs) + 3.5).toFixed(1)}">${runs}</text>`);
  }
  for (let over = 0; over * ballsPerOver <= xMax; over += overStep) {
    const last = (over + overStep) * ballsPerOver > xMax;
    grid.push(`<text class="worm-x${last ? ' is-last' : ''}" x="${x(over * ballsPerOver).toFixed(1)}" y="${H - 5}">${over}${last ? ' ov' : ''}</text>`);
  }
  const marks = falls.filter(fall => fall.ball <= balls).map(fall => {
    const cx = x(fall.ball).toFixed(1), cy = y(running[fall.ball]).toFixed(1);
    return `<g class="worm-fall is-${fall.kind}" transform="translate(${cx} ${cy})"><circle r="5"/><path d="M-3.2 -2.2Q0 0 -3.2 2.2M3.2 -2.2Q0 0 3.2 2.2"/></g>`;
  }).join('');
  const label = `Runs ball by ball: ${total} off ${balls}${falls.length ? `, ${falls.length} down` : ''}`;
  return `<svg class="worm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
      <defs><linearGradient id="worm-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f2a64f" stop-opacity=".42"/><stop offset="1" stop-color="#f2a64f" stop-opacity="0"/></linearGradient></defs>
      ${grid.join('')}
      <polygon class="worm-area" points="${area}"/>
      <polyline class="worm-line" points="${line}"/>
      ${marks}
    </svg>`;
}

/** How a batter's innings stands, in the scorecard's words. */
const statusOf = (batter: CardBatter) => (batter.out ? 'out' : batter.retired ? 'retired hurt' : 'not out');

/**
 * The batting card: a row a batter — runs, balls, fours, sixes, strike rate —
 * and the total under them, with whoever never got in named below it.
 */
export function scorecardMarkup(batters: readonly CardBatter[], total: CardTotal, didNotBat: readonly string[] = []): string {
  const row = (batter: CardBatter) => `
          <tr class="is-${statusOf(batter).replace(' ', '-')}">
            <th scope="row"><b>${batter.title}${batter.left ? ' <i>LH</i>' : ''}</b><small>${statusOf(batter)}</small></th>
            <td class="is-runs">${batter.runs}${batter.out || batter.retired ? '' : '*'}</td>
            <td>${batter.balls}</td><td>${batter.fours}</td><td>${batter.sixes}</td><td>${strikeRate(batter.runs, batter.balls)}</td>
          </tr>`;
  return `
      <table class="mcard-table">
        <thead><tr><th scope="col">BATTER</th><th scope="col" class="is-runs">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col">SR</th></tr></thead>
        <tbody>${batters.map(row).join('')}
        </tbody>
        <tfoot><tr>
          <th scope="row"><b>Total</b><small>${total.overs} overs</small></th>
          <td class="is-runs">${total.runs}/${total.wickets}</td>
          <td>${total.balls}</td><td>${total.fours}</td><td>${total.sixes}</td><td>${strikeRate(total.runs, total.balls)}</td>
        </tr></tfoot>
      </table>${didNotBat.length ? `
      <p class="mcard-dnb">Did not bat: ${didNotBat.join(', ')}</p>` : ''}`;
}

/** What the share key sends: the total, each batter's score, and the link. */
export function marathonShareText(total: CardTotal, batters: readonly CardBatter[], url: string): string {
  const scores = batters.map(b => `${b.title.toLowerCase()} ${b.runs}${b.out || b.retired ? '' : '*'} (${b.balls})`).join(', ');
  return `${total.runs}/${total.wickets} in a Test Marathon on Hitman Cricket — ${scores}. Can you bat longer? ${url}`;
}
