/**
 * The board's endpoints, checked end to end against a running deployment.
 *
 *   node scripts/board-check.mjs                       # the dev server
 *   node scripts/board-check.mjs https://…vercel.app   # a real deployment
 *
 * Unit tests run the rules against an in-memory store, which catches logic and
 * cannot catch a missing credential, a function in the wrong region, or an
 * `api/` directory Vercel never turned into functions. This is the check that
 * does, and it is the one to run first against any new deployment.
 *
 * It writes. Every run puts a row on whatever board it is pointed at, under a
 * throwaway player id and a name nobody would want, so point it at a preview
 * rather than at the board people are playing for — and note that a name it
 * claims is never released, which is the whole point of that rule.
 */

const base = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
/** A throwaway player, so a check never disturbs a real one's row. */
const me = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14).padEnd(12, 'x')}`;
const other = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14).padEnd(12, 'y')}`;
const name = `zzcheck${run.slice(-5)}`;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};

async function call(path, init) {
  const started = Date.now();
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON, which is itself a finding */ }
  return { status: response.status, headers: response.headers, body, text, ms: Date.now() - started };
}

/** An innings that adds up: sixes and singles over thirty balls, one wicket. */
function innings(runs) {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  return { runs, sixes, fours: 0, wickets: 1, dots: 30 - sixes - singles - 1, balls: 30 };
}

console.log(`\nBoard check against ${base}\n`);

// ── The board reads ────────────────────────────────────────────────────────
const board = await call('/api/board');
check(board.status === 200, `GET /api/board answers 200 (${board.status}, ${board.ms}ms)`, board.text.slice(0, 200));
check(board.body !== null, 'GET /api/board answers JSON, not the game\'s HTML', board.text.slice(0, 120));
check(Array.isArray(board.body?.rows), 'the answer carries rows', board.body);
check('cutoff' in (board.body ?? {}), 'the answer names the cutoff', board.body);
check(
  /s-maxage/.test(board.headers.get('cache-control') ?? ''),
  'the board is cacheable at the edge',
  board.headers.get('cache-control'),
);
if (board.status !== 200 || board.body === null) {
  console.log('\nThe board does not read. Nothing below would mean anything.\n');
  process.exit(1);
}

// ── A real innings is taken ────────────────────────────────────────────────
const post = body => call('/api/score', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const good = await post({ playerId: me, name, avatar: 2, innings: innings(72) });
check(good.status === 200, `POST /api/score takes a real innings (${good.status}, ${good.ms}ms)`, good.body ?? good.text.slice(0, 200));
check(good.body?.improved === true, 'and says it improved on nothing', good.body);
check(typeof good.body?.at === 'number', 'and stamps it from the server', good.body);
check(
  good.body?.board?.rows?.some(r => r.playerId === me && r.runs === 72),
  'and hands back a board with the innings on it',
  good.body?.board?.rows?.slice(0, 3),
);

// ── It is really there ─────────────────────────────────────────────────────
const after = await call('/api/board');
check(
  after.body?.rows?.some(r => r.playerId === me && r.name === name && r.avatar === 2),
  'the row survives a fresh read, with its name and kit',
  after.body?.rows?.find(r => r.playerId === me),
);

// ── One row per player ─────────────────────────────────────────────────────
const worse = await post({ playerId: me, name, avatar: 2, innings: innings(30) });
check(worse.status === 200 && worse.body?.improved === false, 'a worse innings is taken but does not improve', worse.body);
check(
  worse.body?.board?.rows?.filter(r => r.playerId === me).length === 1,
  'and the player still has exactly one row',
);
check(
  worse.body?.board?.rows?.find(r => r.playerId === me)?.runs === 72,
  'holding the better innings, not the latest one',
  worse.body?.board?.rows?.find(r => r.playerId === me),
);

// ── The refusals ───────────────────────────────────────────────────────────
const taken = await post({ playerId: other, name, avatar: 0, innings: innings(60) });
check(taken.status === 409, `a name somebody holds is refused (${taken.status})`, taken.body);

const folded = await post({ playerId: other, name: name.toUpperCase(), avatar: 0, innings: innings(60) });
check(folded.status === 409, 'and so is the same name in different case', folded.body);

const impossible = await post({ playerId: other, name: `${name}b`, avatar: 0, innings: { ...innings(60), runs: 200 } });
check(impossible.status === 400, `an innings that could not have happened is refused (${impossible.status})`, impossible.body);

const nobody = await post({ playerId: 'nope', name: `${name}c`, avatar: 0, innings: innings(60) });
check(nobody.status === 400, `something that is not a player is refused (${nobody.status})`, nobody.body);

const nokit = await post({ playerId: other, name: `${name}d`, avatar: 99, innings: innings(60) });
check(nokit.status === 400, `a kit that does not exist is refused (${nokit.status})`, nokit.body);

// ── Cross-origin, which matters if the game is not served from here ────────
const preflight = await call('/api/score', { method: 'OPTIONS', headers: { Origin: 'https://ekcuttingchaidesign.github.io' } });
check(preflight.status === 204 || preflight.status === 200, `a preflight is answered (${preflight.status})`);

console.log(
  failures
    ? `\n${failures} check${failures === 1 ? '' : 's'} failed.\n`
    : `\nAll checks passed. The board is live.\n  Test rows left behind: player ${me}, name "${name}".\n`,
);
process.exit(failures ? 1 : 0);
