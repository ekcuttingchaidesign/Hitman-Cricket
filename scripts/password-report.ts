import { Redis } from '@upstash/redis';

/**
 * How many players have a career password, and what they have done with it.
 * Read-only — it never writes, and it asks for the read-only token first.
 *
 *   npx vite-node scripts/password-report.ts
 *   VERCEL_ENV=production npx vite-node scripts/password-report.ts
 *   VERCEL_ENV=production npx vite-node scripts/password-report.ts 30   (days to list, 14 by default)
 *
 * It needs `KV_REST_API_URL` and either `KV_REST_API_READ_ONLY_TOKEN` (better)
 * or `KV_REST_API_TOKEN`, pasted into your own terminal and nowhere else. Which
 * keys it reads is `VERCEL_ENV`'s choice, as for every script here: unset reads
 * the development keys, which are harmless and usually empty.
 *
 * The first block is the store's own truth — who holds a password right now,
 * counted off the hashes the passwords live in, history included. The second is
 * the tally (`src/server/tally.ts`), which began counting when it shipped, so
 * its totals start from that day. The taps — Played before?, the cards, the
 * sheets — never reach the store; they are GoatCounter's, listed at the foot.
 */

const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;
const DAYS = Math.max(1, Math.min(90, Number(process.argv[2]) || 14));
/** India's time, as the tally's days are. */
const ZONE_MS = 5.5 * 3600_000;

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_READ_ONLY_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_READ_ONLY_TOKEN (or KV_REST_API_TOKEN) must be set in this terminal.');
  process.exit(1);
}
const redis = new Redis({ url, token });

console.log(`Reading ${SCOPE ? `the ${SCOPE.slice(0, -1)} keys` : 'PRODUCTION'} — read-only.\n`);

const [passwords, questions, findable, names, tally] = await Promise.all([
  redis.hlen(`${SCOPE}passwords`),
  redis.hlen(`${SCOPE}questions`),
  redis.zcard(`${SCOPE}findable`),
  redis.hlen(`${SCOPE}names`),
  redis.hgetall<Record<string, number>>(`${SCOPE}tally`),
]);
const share = (part: number, whole: number) => (whole ? ` (${Math.round(part / whole * 100)}%)` : '');

console.log('Right now');
console.log(`  Players with a password        ${passwords}`);
console.log(`  … with a security question     ${questions}${share(questions, passwords)}`);
console.log(`  Names findable on Played before? ${findable}`);
console.log(`  Names claimed, for scale       ${names}${share(passwords, names) && ` — a password on about${share(passwords, names).slice(1, -1)} of them`}`);

const held = tally ?? {};
const LABELS: Record<string, string> = {
  'password-created': 'Passwords created',
  'password-changed': 'Passwords changed',
  'question-set': 'Security questions set',
  'restore-password': 'Brought back by password',
  'restore-question': 'Brought back by security question',
  'restore-key': 'Brought back by career key',
  'forgot-asked': 'Forgot password? asked',
};
console.log('\nSince the tally began');
// Only the password events: the tally holds the profiles' and Super10's too, which have reports of their own.
const EVENTS = Object.keys(LABELS);
for (const event of EVENTS) console.log(`  ${LABELS[event].padEnd(34)} ${Number(held[event]) || 0}`);

const day = (at: number) => new Date(at + ZONE_MS).toISOString().slice(0, 10);
const short = ['made', 'chgd', 'ques', 'bk-pw', 'bk-q', 'bk-key', 'forgot'];
console.log(`\nThe last ${DAYS} days (India's time)`);
console.log(`  ${'day'.padEnd(10)}  ${short.map(one => one.padStart(6)).join('')}`);
for (let back = DAYS - 1; back >= 0; back--) {
  const d = day(Date.now() - back * 86_400_000);
  console.log(`  ${d}  ${EVENTS.map(event => String(Number(held[`${d}:${event}`]) || 0).padStart(6)).join('')}`);
}

console.log(`
The taps are on GoatCounter, not here:
  restore-open-profile       Played before? on the name screen
  restore-open-taken         the restore link under a name already held
  restore-open-stats / -board / -card   the other ways into the restore sheet
  restore-find-listed / -none, restore-picked, restore-switch-key
  restore-done-password / -question / restore-done   brought back, by each way
  password-card-stats / -end, password-nudge-shown   the asks, seen
  password-open-<from>, password-created, password-set-<from>, password-closed-<from>
  password-welcome-offered, password-forgot, password-answer-wrong`);
