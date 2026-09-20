/**
 * Rows on a board, so a screen built for fifty of them can be looked at.
 *
 *   node scripts/board-fill.mjs https://…vercel.app --yes
 *   node scripts/board-fill.mjs https://…vercel.app --yes --rows=40 --mode=both
 *
 * An empty ladder tells you nothing about a ladder. This plays a spread of
 * innings under throwaway players so the sheet has something to scroll, the
 * lit row has rows above and below it, and the cut-off line has a fiftieth
 * score to name.
 *
 * It writes, and two of the things it writes are permanent: a name claimed on
 * a board is never released, and a career counted is counted. So it will not
 * run without `--yes`, it prints the host it is about to write to first, and
 * it should be pointed at a preview rather than at the board people are
 * playing for. Preview deployments keep their keys under their own prefix —
 * `VERCEL_ENV` decides it in `src/server/upstash.ts` — so seeding one cannot
 * reach production's rows.
 *
 * One address may offer 120 innings an hour, and each row costs two: one to
 * the board and one to the career. Forty rows a mode is the most that fits,
 * and the script stops the moment it is turned away rather than hammering.
 */

const args = process.argv.slice(2);
const base = (args.find(one => one.startsWith('http')) ?? '').replace(/\/$/, '');
const flag = (name, fallback) => {
  const found = args.find(one => one.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const rows = Math.max(1, Math.min(50, Number(flag('rows', 40))));
const mode = flag('mode', 'classic');
const modes = mode === 'both' ? ['classic', 'survive'] : [mode];

if (!base) {
  console.error('\nGive it the deployment to fill:\n  node scripts/board-fill.mjs https://…vercel.app --yes\n');
  process.exit(1);
}
if (!args.includes('--yes')) {
  console.error(`\nThis writes ${rows} rows to ${new URL(base).host}, and a name it claims is never released.`);
  console.error('Point it at a preview, then run it again with --yes.\n');
  process.exit(1);
}

/** Enough names for fifty rows, and none of them anybody's. */
const NAMES = [
  'Arjun', 'Bhuvi', 'Chirag', 'Dhruv', 'Eshan', 'Farhan', 'Gautam', 'Harsh', 'Imran', 'Jatin',
  'Kabir', 'Lakshya', 'Manav', 'Nikhil', 'Omkar', 'Pranav', 'Qasim', 'Rehan', 'Sagar', 'Tanmay',
  'Uday', 'Varun', 'Wasim', 'Yash', 'Zain', 'Aditya', 'Bipin', 'Chetan', 'Deepak', 'Girish',
  'Hemant', 'Ishaan', 'Jaideep', 'Karan', 'Lalit', 'Mohit', 'Naveen', 'Parth', 'Rakesh', 'Sanjay',
  'Tarun', 'Vikram', 'Yogesh', 'Amit', 'Bharat', 'Danish', 'Gaurav', 'Jayant', 'Kunal', 'Nitin',
];

/** A player id of the shape the game mints, and never one a person holds. */
const idFor = i => `${(Date.now() + i).toString(36)}-${Math.random().toString(36).slice(2, 14).padEnd(12, 'x')}`;

/** A Blast innings that adds up, somewhere on the ladder. */
function blast(runs) {
  const sixes = Math.min(30, Math.floor(runs / 8));
  const fours = Math.min(30 - sixes, Math.floor((runs - sixes * 6) / 4));
  const singles = runs - sixes * 6 - fours * 4;
  const wickets = runs > 110 ? 0 : runs > 60 ? 1 : 2;
  const balls = 30;
  const dots = Math.max(0, balls - sixes - fours - singles - wickets);
  // What one batsman made: everything after the last wicket, which is the
  // whole innings when none fell.
  const individual = wickets === 0 ? runs : Math.round(runs * 0.72);
  return {
    runs, sixes, fours, wickets, dots, balls,
    individual, hundreds: individual >= 100 ? 1 : 0,
  };
}

/**
 * A Test innings: a chase, a draw or a wicket, spread across the ladder.
 *
 * The meter is derived from the blows rather than picked, because the board
 * refuses an innings whose health moved with nothing hitting him — damage comes
 * from blows and from nothing else, and a seeded row has to be one somebody
 * could have played.
 */
function test(i) {
  const blows = 1 + (i % 6);
  const health = Math.max(0, 100 - blows * 9);
  if (i % 3 === 0) return { runs: 100, balls: 34 + (i % 20), wickets: 0, blows, health, sixes: 6, fours: 5 };
  if (i % 3 === 1) return { runs: 40 + i, balls: 60, wickets: 0, blows, health, sixes: 2, fours: 4 };
  // Ten overs is the whole innings, so the balls are capped at it.
  return { runs: 20 + i, balls: Math.min(60, 18 + i), wickets: 1, blows, health, sixes: 1, fours: 2 };
}

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* not JSON, which is itself a finding */ }
  return { status: response.status, body: payload, text };
}

console.log(`\nFilling ${new URL(base).host} — ${rows} rows on ${modes.join(' and ')}\n`);

let made = 0;
let stopped = '';
for (const one of modes) {
  for (let i = 0; i < rows && !stopped; i++) {
    const playerId = idFor(i);
    const name = `${NAMES[i % NAMES.length]}${one === 'survive' ? 'T' : ''}`;
    const avatar = i % 6;
    // Top of the ladder down to the bottom, so the fifty rows are a ladder and
    // not fifty of the same score.
    const innings = one === 'survive' ? test(i) : blast(Math.max(6, 148 - i * 3));

    const row = await post('/api/score', { playerId, mode: one, name, avatar, innings });
    if (row.status === 429) { stopped = 'the hourly limit for this address'; break; }
    if (row.status !== 200) {
      console.log(`  skip  ${name}: ${row.status} ${row.body?.error ?? row.text.slice(0, 80)}`);
      continue;
    }
    // The board has the innings; this is what puts them on the career ladders.
    const career = await post('/api/innings', {
      playerId, mode: one, name, avatar, innings, nonce: Math.random().toString(36).slice(2, 14),
    });
    if (career.status === 429) { stopped = 'the hourly limit for this address'; break; }
    made++;
    if (made % 10 === 0) console.log(`  ${made} rows in`);
  }
}

console.log(`\n${made} rows written${stopped ? `, then stopped: ${stopped}` : ''}.`);
console.log(`Open ${base} and the board has something to scroll.\n`);
if (stopped) process.exitCode = 1;
