import { Redis } from '@upstash/redis';
import { handleOf } from '../src/game/handle';
import { isPlayerId } from '../src/server/board-store';

/**
 * Handles for everybody who held a name before the profiles came.
 *
 *   npx vite-node scripts/handle-backfill.ts            # say what it would do
 *   npx vite-node scripts/handle-backfill.ts --write    # do it
 *
 * A row on a board opens a profile by its handle, and the store finds the
 * player behind a handle in `${SCOPE}handles`, which is written whenever a
 * player posts, counts an innings or claims a name. Somebody who has done none
 * of those since the profiles shipped has rows that open nothing, so this
 * writes a handle for every id the name registry holds — every named player,
 * which is every player on any board. Only the handle → id map is touched,
 * and writing one twice writes the same thing, so it is safe to run again.
 *
 * It needs `KV_REST_API_URL` and `KV_REST_API_TOKEN`, and it writes to whatever
 * `VERCEL_ENV` says: unset means the development keys, the harmless default.
 * Run it with `VERCEL_ENV=production` once you have run it without.
 */

const WRITE = process.argv.includes('--write');
const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;

function redis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('KV_REST_API_URL and KV_REST_API_TOKEN must both be set.');
    process.exit(1);
  }
  return new Redis({ url, token });
}

async function main() {
  const db = redis();
  const ids = new Set<string>();
  let cursor: string | number = 0;
  do {
    const [next, flat] = await db.hscan(`${SCOPE}names`, cursor, { count: 500 }) as [string | number, unknown[]];
    for (let i = 1; i < flat.length; i += 2) if (isPlayerId(String(flat[i]))) ids.add(String(flat[i]));
    cursor = next;
  } while (String(cursor) !== '0');

  console.log(`${ids.size} named players in ${SCOPE ? `"${SCOPE}"` : 'production'}.`);
  if (!WRITE) {
    console.log('Nothing written. Run again with --write to write their handles.');
    return;
  }
  const all = [...ids];
  for (let i = 0; i < all.length; i += 200) {
    const batch = Object.fromEntries(all.slice(i, i + 200).map(id => [handleOf(id), id]));
    await db.hset(`${SCOPE}handles`, batch);
  }
  console.log(`Wrote ${all.length} handles to ${SCOPE}handles.`);
}

main().catch(error => { console.error(error); process.exit(1); });
