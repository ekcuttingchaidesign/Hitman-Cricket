import { Redis } from '@upstash/redis';

/**
 * How many players pressed I'M EXCITED on Super10's coming-soon page.
 * Read-only: it never writes, and it asks for the read-only token first.
 *
 *   VERCEL_ENV=production npx vite-node scripts/super10-report.ts
 *   VERCEL_ENV=production npx vite-node scripts/super10-report.ts 30   (days to list, 14 by default)
 *
 * It needs `KV_REST_API_URL` and either `KV_REST_API_READ_ONLY_TOKEN` (better)
 * or `KV_REST_API_TOKEN`, pasted into your own terminal and nowhere else.
 * Unset `VERCEL_ENV` reads the development keys.
 *
 * The total is the set of players (`countExcited`), so each is counted once
 * however often they pressed; the days are when each first pressed. A private
 * window and a blocked request never reach the store: GoatCounter's
 * `super10-excited`, with `super10-open-card` and `super10-got-it` beside it,
 * is the rest of the picture.
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

const [players, names, tally] = await Promise.all([
  redis.scard(`${SCOPE}excited:super10`),
  redis.hlen(`${SCOPE}names`),
  redis.hgetall<Record<string, number>>(`${SCOPE}tally`),
]);
const held = tally ?? {};

console.log(`Players excited about Super10   ${players}`);
console.log(`Names claimed, for scale        ${names}${names ? ` (about ${Math.round(players / names * 100)}% of them)` : ''}`);

const day = (at: number) => new Date(at + ZONE_MS).toISOString().slice(0, 10);
console.log(`\nThe last ${DAYS} days (India's time)`);
for (let back = DAYS - 1; back >= 0; back--) {
  const d = day(Date.now() - back * 86_400_000);
  console.log(`  ${d}  ${String(Number(held[`${d}:super10-excited`]) || 0).padStart(6)}`);
}
