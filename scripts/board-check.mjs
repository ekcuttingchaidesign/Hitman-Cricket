/**
 * The board's and the challenges' endpoints, checked end to end against a
 * running deployment.
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

/** A Test innings: four figures, and the hundred reached inside the ten overs. */
function chase(runs, balls) {
  return { runs, balls, wickets: 0, blows: 2 };
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

// ── The other ladder ───────────────────────────────────────────────────────
// Two boards over one database. Whether they are really on separate keys is the
// thing unit tests cannot see: they run two stores because the test made two,
// and here one wrong prefix puts a Test match on the five-over ladder.
const survive = await call('/api/board?mode=survive');
check(survive.status === 200, `GET /api/board?mode=survive answers 200 (${survive.status}, ${survive.ms}ms)`, survive.text.slice(0, 200));
check(Array.isArray(survive.body?.rows), 'the Test board carries rows', survive.body);
check(
  !survive.body?.rows?.some(r => 'sixes' in r),
  'and carries the Test figures rather than the five-over ones',
  survive.body?.rows?.[0],
);

const test = `${me.slice(0, 6)}-tttttttttttt`;
const testName = `zztest${run.slice(-5)}`;
const chased = await post({ playerId: test, name: testName, avatar: 3, mode: 'survive', innings: chase(104, 41) });
check(chased.status === 200, `POST /api/score takes a Test innings (${chased.status}, ${chased.ms}ms)`, chased.body ?? chased.text.slice(0, 200));
check(
  chased.body?.board?.rows?.some(r => r.playerId === test && r.runs === 104 && r.balls === 41),
  'and hands back the Test board with it on',
  chased.body?.board?.rows?.slice(0, 3),
);

const slower = await post({ playerId: test, name: testName, avatar: 3, mode: 'survive', innings: chase(104, 55) });
check(
  slower.status === 200 && slower.body?.improved === false,
  'a slower chase is taken but does not improve: a chase is a race',
  slower.body,
);

const bothBoards = await Promise.all([call('/api/board'), call('/api/board?mode=survive')]);
check(
  !bothBoards[0].body?.rows?.some(r => r.playerId === test),
  'the Test innings is nowhere near the five-over board',
  bothBoards[0].body?.rows?.find(r => r.playerId === test),
);
check(
  !bothBoards[1].body?.rows?.some(r => r.playerId === me),
  'and the five-over innings is nowhere near the Test one',
  bothBoards[1].body?.rows?.find(r => r.playerId === me),
);

const impossibleTest = await post({
  playerId: other, name: `${testName}b`, avatar: 0, mode: 'survive', innings: chase(400, 10),
});
check(impossibleTest.status === 400, `a Test innings that could not have happened is refused (${impossibleTest.status})`, impossibleTest.body);

// The name registry is the one key the two boards share, and the only way to
// see that from out here is to take a name on one and reach for it on the other.
const crossName = await post({ playerId: other, name, avatar: 0, mode: 'survive', innings: chase(104, 44) });
check(crossName.status === 409, `a name held on the five-over board is refused on the Test one (${crossName.status})`, crossName.body);

// ── A challenge, set and answered ──────────────────────────────────────────
// Safer to run against production than everything above it: a challenge expires
// on its own and claims no permanent name, so a check leaves nothing behind that
// anybody has to live with.
const challengePost = (body) => call('/api/challenge', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
/** An innings of `runs`, over the full thirty balls. The server derives the score. */
const card = (runs) => {
  const sixes = Math.floor(runs / 6);
  return ('6'.repeat(sixes) + '1'.repeat(runs % 6)).padEnd(30, '0');
};
const setter = { playerId: me, name: 'Setter', avatar: 0 };
const chaser = { playerId: other, name: 'Chaser', avatar: 1 };

const made = await challengePost({ action: 'create', ...setter, card: card(102) });
check(made.status === 200, `POST /api/challenge sets one (${made.status}, ${made.ms}ms)`, made.text.slice(0, 200));
const code = made.body?.code;
check(typeof code === 'string' && code.length === 6, 'it answers with a six-character code', made.body);
check(
  made.body?.challenge?.players?.[0]?.runs === 102,
  'and works the score out from the balls, not from a number we sent',
  made.body?.challenge?.players?.[0],
);

if (code) {
  const read = await call(`/api/challenge?code=${code}`);
  check(read.status === 200, `GET /api/challenge reads it back (${read.status}, ${read.ms}ms)`, read.text.slice(0, 200));
  check(read.body?.challenge?.state === 'open', 'unanswered reads as open', read.body?.challenge);
  check(
    read.body?.challenge?.players?.[0]?.card === card(102),
    'the challenger\'s innings comes back whole — that string is the ghost',
    read.body?.challenge?.players?.[0]?.card,
  );
  check(
    /s-maxage/.test(read.headers.get('cache-control') ?? ''),
    'a challenge read is cacheable at the edge',
    read.headers.get('cache-control'),
  );

  const self = await challengePost({ action: 'answer', code, ...setter, card: card(150) });
  check(self.status === 409, `the challenger cannot chase themselves (${self.status})`, self.body);

  const unfinished = await challengePost({ action: 'answer', code, ...chaser, card: '664466446644' });
  check(unfinished.status === 400, `an innings that never ended is refused (${unfinished.status})`, unfinished.body);

  const answered = await challengePost({ action: 'answer', code, ...chaser, card: card(114) });
  check(answered.status === 200, `the friend answers it (${answered.status})`, answered.text.slice(0, 200));
  check(answered.body?.challenge?.state === 'answered', 'which closes it', answered.body?.challenge);
  check(
    answered.body?.challenge?.players?.[0]?.name === 'Chaser',
    'and the higher score takes the top of the scoreline',
    answered.body?.challenge?.players?.map(one => [one.name, one.runs]),
  );
  check(
    (answered.headers.get('cache-control') ?? '').includes('no-store'),
    'an answer is never cached',
    answered.headers.get('cache-control'),
  );

  // The retry path: a browser that has just batted thirty balls and lost its
  // response must never be told no.
  const retry = await challengePost({ action: 'answer', code, ...chaser, card: card(180) });
  check(retry.status === 200, `a retried answer is idempotent, not refused (${retry.status})`, retry.body);
  check(
    retry.body?.challenge?.players?.find(one => one.playerId === other)?.runs === 114,
    'and it does not overwrite the innings already in',
    retry.body?.challenge?.players?.map(one => [one.name, one.runs]),
  );

  const late = await challengePost({
    action: 'answer', code, playerId: `${Date.now().toString(36)}-zzzzzzzzzzzz`, name: 'Late', avatar: 2, card: card(120),
  });
  check(late.status === 409, `a second friend is too late (${late.status})`, late.body);
}

const noChallenge = await call('/api/challenge?code=ZZZZZZ');
check(noChallenge.status === 404, `a code that is not a challenge answers 404 (${noChallenge.status})`, noChallenge.body);
const badChallenge = await call('/api/challenge?code=K7Q0');
check(badChallenge.status === 400, `a code that is not a code answers 400 (${badChallenge.status})`, badChallenge.body);

// ── Cross-origin, which matters if the game is not served from here ────────
const preflight = await call('/api/score', { method: 'OPTIONS', headers: { Origin: 'https://ekcuttingchaidesign.github.io' } });
check(preflight.status === 204 || preflight.status === 200, `a preflight is answered (${preflight.status})`);
const challengePreflight = await call('/api/challenge', { method: 'OPTIONS', headers: { Origin: 'https://ekcuttingchaidesign.github.io' } });
check(challengePreflight.status === 204 || challengePreflight.status === 200, `a challenge preflight is answered (${challengePreflight.status})`);

console.log(
  failures
    ? `\n${failures} check${failures === 1 ? '' : 's'} failed.\n`
    : `\nAll checks passed. Both boards and challenges are live.\n  Rows left behind: ${me}/"${name}" on the five-over board, ${test}/"${testName}" on the Test one.\n`,
);
process.exit(failures ? 1 : 0);
