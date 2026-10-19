import { createInterface } from 'node:readline/promises';
import { Redis } from '@upstash/redis';
import { HEADLINE_MS } from '../src/game/answered';
import { handleOf } from '../src/game/handle';
import { cleanName, foldName } from '../src/server/board-store';
import { noteEvent, type ActivityEvent } from '../src/server/player-store';
import { upstashProfiles, upstashRecovery } from '../src/server/upstash';

/**
 * A pass the store did not see, put on the passed player's profile by hand:
 * one innings went past them before profiles were live, so nothing was noted
 * and their My profile never led with Rank down.
 *
 *   npx vite-node scripts/note-pass.ts "Who went past" "Who was passed"            # what it would write, nothing more
 *   npx vite-node scripts/note-pass.ts "Who went past" "Who was passed" --write    # asks for the passed name again, then writes
 *   … --mode survive | marathon                                                   # the board (the Blast unless said)
 *
 * It writes one event, exactly the one the store writes after a post that
 * passes somebody (`afterPost`), so the card, the sheet and WIN IT BACK work
 * as if the store had seen it. It is dated when the passing innings was
 * posted if that was inside the two days the card stands (`HEADLINE_MS`), and
 * now otherwise, so the card still shows; it says which it chose. Nothing
 * else is touched: not the board, not anybody's score.
 *
 * Asked twice, as anything here that touches a real player is: `--write`, and
 * then the passed player's name typed again. It needs `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN` in your own terminal and nowhere else, and it writes
 * where `VERCEL_ENV` says: unset is the development keys, the harmless default.
 */

const WRITE = process.argv.includes('--write');
const flag = (name: string) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : undefined; };
const mode = (flag('--mode') ?? 'classic') as 'classic' | 'survive' | 'marathon';
const [passer, passed] = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith('--') && all[i - 1] !== '--mode');
if (!passer || !passed || !['classic', 'survive', 'marathon'].includes(mode)) {
  console.error('Who went past whom? npx vite-node scripts/note-pass.ts "Who went past" "Who was passed" [--mode classic|survive|marathon] [--write]');
  process.exit(1);
}
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_TOKEN must both be set in this terminal.');
  process.exit(1);
}
const scope = process.env.VERCEL_ENV === 'production' ? 'PRODUCTION' : `the ${process.env.VERCEL_ENV ?? 'development'} keys`;
const redis = new Redis({ url, token });
const recovery = upstashRecovery(redis);
const stores = upstashProfiles(redis);
const board = mode === 'marathon' ? stores.boards.team : stores.boards[mode];
console.log(`${WRITE ? 'Writing to' : 'Looking at'} ${scope}.\n`);

const idOf = async (name: string) => {
  const folded = foldName(cleanName(name));
  return folded ? await recovery.holderOf(folded) : null;
};
const [passerId, passedId] = await Promise.all([idOf(passer), idOf(passed)]);
if (!passerId || !passedId) {
  console.error(`Nobody holds "${cleanName(!passerId ? passer : passed)}". Check the spelling against the board.`);
  process.exit(1);
}
const [rows, theirs] = await Promise.all([board.rows([passerId, passedId]), board.standing(passedId)]);
const [mine, own] = rows as ({ name: string; avatar: number; runs: number; at?: number } | null)[];
if (!mine || !own) {
  console.error(`${!mine ? cleanName(passer) : cleanName(passed)} has no row on that board.`);
  process.exit(1);
}
if (mine.runs <= own.runs) console.warn(`Warning: ${mine.name}'s ${mine.runs} is not above ${own.name}'s ${own.runs}.\n`);

const now = Date.now();
const recent = typeof mine.at === 'number' && now - mine.at < HEADLINE_MS;
const at = recent ? mine.at! : now;
const event: ActivityEvent = {
  kind: 'passed', handle: handleOf(passerId), name: mine.name, avatar: mine.avatar, mode,
  runs: mine.runs, target: own.runs, place: theirs.rank, at,
};
console.log(`${mine.name} (${mine.runs}) surpassed ${own.name} (${own.runs}), who is #${theirs.rank ?? '?'} now.`);
console.log(`Dated ${new Date(at).toISOString()} — ${recent ? 'when that innings was posted' : 'now, as that innings is older than the two days the card stands'}.`);

if (!WRITE) {
  console.log('\nNothing changed. Run again with --write to put it on their profile.');
  process.exit(0);
}
const ask = createInterface({ input: process.stdin, output: process.stdout });
const again = await ask.question(`\nType "${own.name}" again to put this on their profile: `);
ask.close();
if (foldName(cleanName(again)) !== foldName(cleanName(passed))) {
  console.log('That is not the same name. Nothing changed.');
  process.exit(1);
}
await noteEvent(stores.players, passedId, event);
console.log(`\nDone. ${own.name}'s My profile leads with Rank down until ${new Date(at + HEADLINE_MS).toISOString()}.`);
