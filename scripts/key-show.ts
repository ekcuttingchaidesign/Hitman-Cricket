import { Redis } from '@upstash/redis';
import { keySealSecret } from '../src/server/career-key';
import { inningsOf, lookUpKey } from '../src/server/key-admin';
import { upstashRecovery } from '../src/server/upstash';

/**
 * One player's career key, read back for the owner. Read-only.
 *
 *   npx vite-node scripts/key-show.ts "Dhruv"
 *   VERCEL_ENV=production npx vite-node scripts/key-show.ts "Dhruv"
 *
 * It needs `KV_REST_API_URL`, `KV_REST_API_READ_ONLY_TOKEN` (or the write token,
 * though this never writes) and `KEY_SEAL_SECRET`, pasted into your own
 * terminal and nowhere else. Which keys it reads is `VERCEL_ENV`'s choice, as
 * for every script here: unset reads the development keys, and it says which
 * on its first line.
 *
 * Only keys issued since sealing began can be read back. One issued before
 * has only its hash in the store, which nothing can reverse; for those the
 * answer is `key-reset.ts`, which gives the player a new key.
 *
 * Whoever you hand a key to holds that career. Be sure it is the player asking.
 */

const name = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (!name) {
  console.error('Which player? npx vite-node scripts/key-show.ts "Their name"');
  process.exit(1);
}
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_READ_ONLY_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_READ_ONLY_TOKEN (or KV_REST_API_TOKEN) must be set in this terminal.');
  process.exit(1);
}
const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;
const redis = new Redis({ url, token });
console.log(`Reading ${SCOPE ? `the ${SCOPE.slice(0, -1)} keys` : 'PRODUCTION'} — read-only.\n`);

const found = await lookUpKey(upstashRecovery(redis), name, keySealSecret());
console.log(`Name:    ${found.name || '(not a name)'}`);
if (found.holder) {
  const innings = await inningsOf((field, id) => redis.hget(field, id), SCOPE, found.holder);
  console.log(`Player:  ${found.holder.slice(0, 6)}…`);
  console.log(`Innings: ${Object.entries(innings).map(([mode, count]) => `${mode} ${count}`).join(', ')}`);
}
if (found.issued) console.log(`Issued:  ${new Date(found.issued).toISOString().slice(0, 10)}`);
console.log('');
if (found.key) {
  console.log(`Key:     ${found.key}`);
  console.log('\nSend it to the player privately. Whoever holds it holds the career.');
} else {
  console.log(found.missing);
  process.exitCode = 1;
}
