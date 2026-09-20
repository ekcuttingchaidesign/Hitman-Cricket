import { Redis } from '@upstash/redis';
import {
  BLAST_CAREER, SURVIVE_CAREER, emptyBlast, emptySurvive, rankCareer,
  type BlastCareer, type CareerLadder, type SurviveCareer,
} from '../src/game/career';
import type { StoredCareer } from '../src/server/career-store';
import type { StoredRow } from '../src/server/board-store';
import type { Innings } from '../src/game/leaderboard';
import { standingOf, type SurviveInnings } from '../src/game/survive-board';

/**
 * Day one for the career boards, seeded out of the innings boards.
 *
 *   npx vite-node scripts/career-seed.ts            # say what it would do
 *   npx vite-node scripts/career-seed.ts --write    # do it
 *
 * The careers start empty, and seven empty boards on the morning a feature
 * ships is the worst possible time for them to be empty: nobody can see what
 * the screen is *for*. Everybody already on an innings board has played at
 * least the innings that put them there, and that innings is a real one, so it
 * is counted as a career of exactly one.
 *
 * What this seeds is therefore true and incomplete, which is the honest trade
 * and worth saying out loud: a player with four hundred innings behind them
 * starts on the runs of their best. Every innings after this one is counted in
 * full, so the boards converge on the truth rather than away from it, and
 * nothing here is ever invented.
 *
 * It is a one-shot. A record that already exists is left exactly as it is —
 * running this twice must not count anybody's best innings twice — so it is
 * safe to re-run after a partial failure, and safe to forget you ran it.
 *
 * It needs `KV_REST_API_URL` and `KV_REST_API_TOKEN`, and it writes to whatever
 * `VERCEL_ENV` says: unset means the development keys, which is deliberately
 * the harmless default. Run it with `VERCEL_ENV=production` against the board
 * people are playing for, and not before you have run it without.
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

/** A Blast row as a career of one innings. The row holds all six figures. */
function blastSeed(row: StoredRow<Innings>): BlastCareer {
  return {
    ...emptyBlast(),
    innings: 1,
    runs: row.runs, balls: row.balls, sixes: row.sixes, fours: row.fours,
    wickets: row.wickets, dots: row.dots,
    highest: row.runs,
    notOut: row.wickets === 0 ? row.runs : 0,
  };
}

/**
 * A Test row, the same way. Its sixes and fours are the one thing that cannot
 * be seeded: the Test board never carried them, because its ladder never
 * ranked on them. They start at nought and are counted from the next innings,
 * which is the only answer that does not involve inventing a figure.
 */
function surviveSeed(row: StoredRow<SurviveInnings>): SurviveCareer {
  const standing = standingOf(row);
  return {
    ...emptySurvive(),
    innings: 1,
    runs: row.runs, balls: row.balls, blows: row.blows,
    wins: Number(standing === 'WON'),
    draws: Number(standing === 'DRAWN'),
    losses: Number(standing === 'LOST'),
  };
}

async function seed<C, T>(
  client: Redis, ladder: CareerLadder<C, T>, boardScope: string, into: (row: never) => C,
) {
  const rows = await client.hgetall<Record<string, StoredRow<never>>>(`${SCOPE}${boardScope}players`);
  const held = await client.hgetall<Record<string, StoredCareer<C>>>(`${SCOPE}${ladder.scope}careers`);
  const players = Object.entries(rows ?? {});
  let seeded = 0;
  let skipped = 0;

  for (const [id, row] of players) {
    if (held?.[id]) { skipped++; continue; }
    const career = ladder.figures(into(row));
    // The row's own stamp, not today's. A career board is tied on the day the
    // total was reached, and these totals were reached when the innings was
    // played — stamping them all with this morning would hand the tiebreak to
    // whoever the migration happened to write first.
    const at = Number(row.at) || Date.now();
    const record: StoredCareer<C> = {
      career, name: row.name, avatar: row.avatar, at,
      // No innings has been counted through the endpoint yet, so there is no
      // id to repeat and no day to be spent. A seeded player's next innings is
      // their first counted one.
      nonce: '', day: 0, today: 0,
    };
    if (WRITE) {
      await client.hset(`${SCOPE}${ladder.scope}careers`, { [id]: record });
      for (const board of ladder.boards) {
        if (!board.counts(career)) continue;
        await client.zadd(`${SCOPE}${ladder.scope}career:${board.key}`, { gt: true },
          { score: rankCareer(board, career, at), member: id });
      }
    }
    seeded++;
  }
  console.log(`${ladder.mode}: ${players.length} rows, ${seeded} to seed, ${skipped} already have a career.`);
}

const client = redis();
console.log(WRITE ? `Writing to the ${SCOPE || 'production'} keys.` : 'Dry run. Pass --write to do it.');
await seed(client, BLAST_CAREER, '', blastSeed as (row: never) => BlastCareer);
await seed(client, SURVIVE_CAREER, 'survive:', surviveSeed as (row: never) => SurviveCareer);
console.log(WRITE ? 'Done.' : 'Nothing written.');
