import { createInterface } from 'node:readline/promises';
import { Redis } from '@upstash/redis';
import { cleanName, foldName } from '../src/server/board-store';
import { keySealSecret } from '../src/server/career-key';
import { inningsOf, resetKey } from '../src/server/key-admin';
import { upstashRecovery } from '../src/server/upstash';

/**
 * A new career key for one player who has lost theirs.
 *
 *   npx vite-node scripts/key-reset.ts "Dhruv"            # who it would be, and nothing more
 *   npx vite-node scripts/key-reset.ts "Dhruv" --write    # asks for the name again, then does it
 *
 * It changes one thing: the key behind the one name it is given. The old key
 * stops opening it and the new one is printed, once, to send to the player.
 * Everything the key opens — the board rows, the careers, the Dressing Room,
 * the name — is filed under the player id and is not touched. Nobody else's
 * key is touched either.
 *
 * Asked twice, as anything here that touches a real player is: `--write`, and
 * then the name typed again. Without `--write` it says who it found and stops.
 *
 * It needs `KV_REST_API_URL` and `KV_REST_API_TOKEN`, pasted into your own
 * terminal and nowhere else, and it writes to whatever `VERCEL_ENV` says: unset
 * is the development keys, deliberately the harmless default. With
 * `KEY_SEAL_SECRET` set too, the new key is sealed, so `key-show.ts` can read it
 * back if it is lost again.
 *
 * The one thing it cannot check is the thing that matters most: that the
 * person asking is the player. Whoever you hand the key to holds the career.
 */

const WRITE = process.argv.includes('--write');
const name = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (!name) {
  console.error('Which player? npx vite-node scripts/key-reset.ts "Their name" [--write]');
  process.exit(1);
}
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_TOKEN must both be set in this terminal.');
  process.exit(1);
}
const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;
const redis = new Redis({ url, token });
const store = upstashRecovery(redis);
const secret = keySealSecret();
console.log(`${WRITE ? 'Writing to' : 'Looking at'} ${SCOPE ? `the ${SCOPE.slice(0, -1)} keys` : 'PRODUCTION'}.\n`);

const folded = foldName(cleanName(name));
const holder = folded ? await store.holderOf(folded) : null;
if (!holder) {
  console.error(`Nobody holds "${cleanName(name)}". Check the spelling against the board.`);
  process.exit(1);
}
const innings = await inningsOf((field, id) => redis.hget(field, id), SCOPE, holder);
console.log(`Name:    ${cleanName(name)}`);
console.log(`Player:  ${holder.slice(0, 6)}…`);
console.log(`Innings: ${Object.entries(innings).map(([mode, count]) => `${mode} ${count}`).join(', ')}`);
console.log(`Sealed:  ${secret ? 'yes — key-show.ts can read the new key back' : 'no — KEY_SEAL_SECRET is not set, so the new key cannot be read back later'}`);

if (!WRITE) {
  console.log('\nNothing changed. Run again with --write to give this player a new key.');
  process.exit(0);
}

const ask = createInterface({ input: process.stdin, output: process.stdout });
const again = await ask.question(`\nType the name again to give "${cleanName(name)}" a new key: `);
ask.close();
if (foldName(cleanName(again)) !== folded) {
  console.log('That is not the same name. Nothing changed.');
  process.exit(1);
}

const done = await resetKey(store, name, { secret });
if (!done.ok) {
  console.error(done.reason);
  process.exit(1);
}
// Tries already spent against this name would otherwise hold the new key back
// for up to an hour, and the player was very likely the one spending them.
await redis.del(`${SCOPE}nrate:${done.folded}`);
console.log(`\nNew key: ${done.key}`);
console.log('\nThe old key no longer opens this record. Send this one to the player privately:');
console.log('their name and this key, on Bring your record back.');
