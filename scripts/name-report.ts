import { Redis } from '@upstash/redis';
import { foldName } from '../src/server/board-store';
import { siblingBase, SIBLING_WINDOW_MS } from '../src/server/name-rules';

/**
 * Who has claimed the same name more than once, with a number on the end:
 * "Name", "Name 1", "Name 2". Read-only — it never writes, and it asks for the
 * read-only token first.
 *
 *   npx vite-node scripts/name-report.ts
 *   VERCEL_ENV=production npx vite-node scripts/name-report.ts
 *
 * It needs `KV_REST_API_URL` and either `KV_REST_API_READ_ONLY_TOKEN` (better)
 * or `KV_REST_API_TOKEN`, pasted into your own terminal and nowhere else. Which
 * keys it reads is `VERCEL_ENV`'s choice, as for every script here: unset reads
 * the development keys, which are harmless and usually empty, and it says which
 * on its first line.
 *
 * The database keeps who holds a name, not when it was claimed. So "when" here
 * is each player's last activity — the latest of their board rows and career
 * records — and a group is marked CLOSE when two of its players were active
 * within a day of each other: the pattern a person farming names leaves, and
 * one somebody who simply lost their phone mostly does not.
 */

const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;
/** The innings boards' scopes: see `board-store.ts`. Each keeps `<scope>players`. */
const BOARDS: Record<string, string> = { blast: '', survival: 'survive:', marathon: 'marathon:', 'marathon solo': 'marathonone:' };
/** The careers' scopes: see `career.ts`. Each keeps `<scope>careers`. */
const CAREERS: Record<string, string> = { blast: 'blast:', survival: 'survivecareer:', marathon: 'marathoncareer:' };

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_READ_ONLY_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_READ_ONLY_TOKEN (or KV_REST_API_TOKEN) must be set in this terminal.');
  process.exit(1);
}
const redis = new Redis({ url, token });

interface Player { id: string; folded: string; shown: string; last: number; boards: string[]; innings: Record<string, number> }

console.log(`Reading ${SCOPE ? `the ${SCOPE.slice(0, -1)} keys` : 'PRODUCTION'} — read-only.\n`);

const names = (await redis.hgetall<Record<string, string>>(`${SCOPE}names`)) ?? {};
const players = new Map<string, Player>();
const playerFor = (folded: string, id: string) => {
  const key = `${folded}|${id}`;
  if (!players.has(key)) players.set(key, { id, folded, shown: folded, last: 0, boards: [], innings: {} });
  return players.get(key)!;
};
const byId = new Map<string, Player[]>();
for (const [folded, id] of Object.entries(names)) {
  const player = playerFor(folded, id);
  byId.set(id, [...(byId.get(id) ?? []), player]);
}

// A player id can hold more than one name (it renamed): what each row says is
// the name it is under now, so the activity is put against that name.
const current = (id: string, name: string) => (byId.get(id) ?? []).find(one => one.folded === foldName(name));
for (const [label, scope] of Object.entries(BOARDS)) {
  const rows = (await redis.hgetall<Record<string, { name?: string; at?: number }>>(`${SCOPE}${scope}players`)) ?? {};
  for (const [id, row] of Object.entries(rows)) {
    const player = row?.name ? current(id, row.name) : undefined;
    if (!player) continue;
    player.shown = row.name!;
    player.last = Math.max(player.last, row.at ?? 0);
    player.boards.push(label);
  }
}
for (const [label, scope] of Object.entries(CAREERS)) {
  const records = (await redis.hgetall<Record<string, { name?: string; at?: number; career?: { innings?: number } }>>(`${SCOPE}${scope}careers`)) ?? {};
  for (const [id, record] of Object.entries(records)) {
    const player = record?.name ? current(id, record.name) : undefined;
    if (!player) continue;
    player.shown = record.name!;
    player.last = Math.max(player.last, record.at ?? 0);
    player.innings[label] = record.career?.innings ?? 0;
  }
}

const groups = new Map<string, Player[]>();
for (const player of players.values()) {
  const base = siblingBase(player.folded);
  groups.set(base, [...(groups.get(base) ?? []), player]);
}
const families = [...groups.entries()].filter(([, members]) => members.length > 1);
const close = (members: Player[]) => {
  const times = members.map(one => one.last).filter(Boolean).sort((a, b) => a - b);
  return times.some((at, i) => i > 0 && at - times[i - 1] <= SIBLING_WINDOW_MS);
};
const sameOwner = (members: Player[]) => new Set(members.map(one => one.id)).size < members.length;
families.sort(([, a], [, b]) => Number(close(b)) - Number(close(a)) || b.length - a.length);

const day = (at: number) => (at ? new Date(at).toISOString().replace('T', ' ').slice(0, 16) : 'no activity');
const shortId = (id: string) => id.slice(-6);
const closeCount = families.filter(([, members]) => close(members)).length;
console.log(`${Object.keys(names).length} names claimed. ${families.length} groups of siblings, ${closeCount} of them active within a day of each other.\n`);
for (const [base, members] of families) {
  const tags = [close(members) ? 'CLOSE' : '', sameOwner(members) ? 'ONE PLAYER RENAMED' : ''].filter(Boolean).join(', ');
  console.log(`${base}${tags ? `  [${tags}]` : ''}`);
  for (const one of [...members].sort((a, b) => a.last - b.last)) {
    const innings = Object.entries(one.innings).map(([mode, n]) => `${n} ${mode}`).join(', ') || 'no career';
    console.log(`  ${one.shown.padEnd(16)} player …${shortId(one.id)}  last active ${day(one.last)}  boards: ${one.boards.join(', ') || 'none'}  innings: ${innings}`);
  }
  console.log('');
}
