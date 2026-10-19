import { Redis } from '@upstash/redis';
import { HEADLINE_MS } from '../src/game/answered';
import type { ActivityEvent } from '../src/server/player-store';

/**
 * What the player profiles are used for: looks, chases and passes, counted off
 * the store. Read-only — it never writes, and it asks for the read-only token
 * first. It prints figures and nothing else: no id, no handle, no name.
 *
 *   npx vite-node scripts/profile-report.ts
 *   VERCEL_ENV=production npx vite-node scripts/profile-report.ts
 *   VERCEL_ENV=production npx vite-node scripts/profile-report.ts 30   (days to list, 14 by default)
 *
 * It needs `KV_REST_API_URL` and either `KV_REST_API_READ_ONLY_TOKEN` (better)
 * or `KV_REST_API_TOKEN`, pasted into your own terminal and nowhere else. Which
 * keys it reads is `VERCEL_ENV`'s choice, as for every script here: unset reads
 * the development keys, which are harmless and usually empty.
 *
 * The first two blocks are the store's own truth, as far back as it keeps
 * them: who has a profile and a bio, the looks of the last week (a viewer once
 * a day, `seen:<id>:<day>`, kept eight days), and the events on profiles (the
 * newest ten a player, kept thirty days). The third is the tally
 * (`src/server/tally.ts`), which began counting when it shipped and keeps
 * everything from then. The taps — a profile opened, CHASE, WIN IT BACK — are
 * GoatCounter's, listed at the foot.
 */

const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;
const DAYS = Math.max(1, Math.min(90, Number(process.argv[2]) || 14));
/** India's time, as the store's days are. */
const ZONE_MS = 5.5 * 3600_000;
const DAY_MS = 86_400_000;
const PROFILE_TALLIES = ['profile-view', 'chase-beat', 'chase-short', 'passed'] as const;

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_READ_ONLY_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_READ_ONLY_TOKEN (or KV_REST_API_TOKEN) must be set in this terminal.');
  process.exit(1);
}
const redis = new Redis({ url, token });

console.log(`Reading ${SCOPE ? `the ${SCOPE.slice(0, -1)} keys` : 'PRODUCTION'} — read-only.\n`);

/** Every key under a pattern, a page at a time. */
async function keysLike(match: string): Promise<string[]> {
  const found: string[] = [];
  let cursor: string | number = 0;
  do {
    const [next, keys]: [string | number, string[]] = await redis.scan(cursor, { match, count: 1000 });
    found.push(...keys);
    cursor = next;
  } while (String(cursor) !== '0');
  return found;
}

/** One command a key, sent a few hundred at a time. */
async function each<T>(keys: string[], ask: (pipe: ReturnType<Redis['pipeline']>, key: string) => void): Promise<T[]> {
  const out: T[] = [];
  for (let at = 0; at < keys.length; at += 500) {
    const pipe = redis.pipeline();
    for (const key of keys.slice(at, at + 500)) ask(pipe, key);
    out.push(...await pipe.exec<T[]>());
  }
  return out;
}

const [profiles, bios, names, tally, seenKeys, actKeys] = await Promise.all([
  redis.hlen(`${SCOPE}handles`),
  redis.hlen(`${SCOPE}bios`),
  redis.hlen(`${SCOPE}names`),
  redis.hgetall<Record<string, number>>(`${SCOPE}tally`),
  keysLike(`${SCOPE}seen:*`),
  keysLike(`${SCOPE}act:*`),
]);
const share = (part: number, whole: number) => (whole ? ` (${Math.round(part / whole * 100)}%)` : '');

console.log('Right now');
console.log(`  Players with a profile          ${profiles}`);
console.log(`  … with a bio                    ${bios}${share(bios, profiles)}`);
console.log(`  Names claimed, for scale        ${names}`);

// The looks: a key a player a day, holding the viewers of that day.
const viewers = await each<number>(seenKeys, (pipe, key) => pipe.scard(key));
const looked = new Set(seenKeys.map(key => key.slice(0, key.lastIndexOf(':'))));
const looks = viewers.reduce((sum, n) => sum + (Number(n) || 0), 0);
console.log('\nLooks, the last eight days the store keeps');
console.log(`  Profiles looked at              ${looked.size}${share(looked.size, profiles)}`);
console.log(`  Looks (a viewer once a day)     ${looks}`);

// The events: who chased and passed whom, newest ten a player.
const lists = await each<ActivityEvent[] | null>(actKeys, (pipe, key) => pipe.lrange(key, 0, -1));
const now = Date.now();
const within = (one: ActivityEvent, ms: number) => now - one.at < ms;
const all = lists.flatMap(list => list ?? []);
const kinds = (ms: number) => ({
  beat: all.filter(one => one.kind === 'beat' && within(one, ms)).length,
  short: all.filter(one => one.kind === 'short' && within(one, ms)).length,
  passed: all.filter(one => one.kind === 'passed' && within(one, ms)).length,
});
const week = kinds(7 * DAY_MS), month = kinds(30 * DAY_MS);
// Something taken in the card's two days: the players My profile leads with Rank down for,
// before what each browser has answered with WIN IT BACK, which only it knows.
const headed = lists.filter(list => (list ?? []).some(one => (one.kind === 'beat' || one.kind === 'passed') && within(one, HEADLINE_MS))).length;
console.log('\nOn profiles                       last 7 days   last 30 days');
console.log(`  Chases that beat them           ${String(week.beat).padStart(11)}   ${String(month.beat).padStart(12)}`);
console.log(`  Chases that fell short          ${String(week.short).padStart(11)}   ${String(month.short).padStart(12)}`);
console.log(`  Passed by an innings            ${String(week.passed).padStart(11)}   ${String(month.passed).padStart(12)}`);
console.log(`  Players with a Rank down standing now  ${headed}`);
console.log('  (Ten events a player are kept, so a busy profile can show fewer than happened: the tally below is exact.)');

const held = tally ?? {};
const LABELS: Record<typeof PROFILE_TALLIES[number], string> = {
  'profile-view': 'Looks (a viewer once a day)',
  'chase-beat': 'Chases that beat them',
  'chase-short': 'Chases that fell short',
  passed: 'Passed by an innings',
};
console.log('\nSince the tally began');
for (const event of PROFILE_TALLIES) console.log(`  ${LABELS[event].padEnd(32)} ${Number(held[event]) || 0}`);

const day = (at: number) => new Date(at + ZONE_MS).toISOString().slice(0, 10);
const short = ['looks', 'beat', 'short', 'passed'];
console.log(`\nThe last ${DAYS} days (India's time)`);
console.log(`  ${'day'.padEnd(10)}  ${short.map(one => one.padStart(7)).join('')}`);
for (let back = DAYS - 1; back >= 0; back--) {
  const d = day(now - back * DAY_MS);
  console.log(`  ${d}  ${PROFILE_TALLIES.map(event => String(Number(held[`${d}:${event}`]) || 0).padStart(7)).join('')}`);
}

console.log(`
The taps are on GoatCounter, not here (the chase's and WIN IT BACK's under each mode's prefix, survive- and marathon-):
  profile-open-row / -podium / -chip   a player's profile opened off a board, and from where
  profile-failed                       one the store did not answer for
  chase-start, chase-start-batter, chase-bat, chase-back, chase-passed, chase-beat, chase-short
  stats-open, activity-headline, activity-open, activity-win-back   My profile, Rank down, the sheet, WIN IT BACK
  winback-beat / winback-short         how a WIN IT BACK innings ended
  bio-saved, bio-cleared`);
