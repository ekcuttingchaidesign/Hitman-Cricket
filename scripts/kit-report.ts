import { Redis } from '@upstash/redis';
import { emptyBlast, emptyMarathon, emptySurvive, type BlastCareer, type MarathonCareer, type SurviveCareer } from '../src/game/career';
import { BATS, OUTFITS, batSteps, done, outfitSteps, type DressingRecord } from '../src/game/dressing';
import type { StoredCareer } from '../src/server/career-store';

/**
 * Who could earn what on the Dressing Room's shelves, read off the careers the
 * store holds, to judge a goal by before it is changed. Read-only — it never
 * writes, and it asks for the read-only token first. It prints figures and
 * nothing else: no id, no handle, no name.
 *
 *   npx vite-node scripts/kit-report.ts
 *   VERCEL_ENV=production npx vite-node scripts/kit-report.ts
 *
 * It needs `KV_REST_API_URL` and either `KV_REST_API_READ_ONLY_TOKEN` (better)
 * or `KV_REST_API_TOKEN`, pasted into your own terminal and nowhere else. Which
 * keys it reads is `VERCEL_ENV`'s choice, as for every script here.
 *
 * Rival wins live in the challenge rooms, not the careers, so Bumblebee and Meg
 * are read as nought here and left out of the shelf's figures.
 */

const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;
const DAY_MS = 86_400_000;

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_READ_ONLY_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_READ_ONLY_TOKEN (or KV_REST_API_TOKEN) must be set in this terminal.');
  process.exit(1);
}
const redis = new Redis({ url, token });

console.log(`Reading ${SCOPE ? `the ${SCOPE.slice(0, -1)} keys` : 'PRODUCTION'} — read-only.\n`);

/** A whole hash, a page at a time. */
async function hashOf<T>(key: string): Promise<Map<string, T>> {
  const found = new Map<string, T>();
  let cursor: string | number = 0;
  do {
    const [next, flat]: [string | number, unknown[]] = await redis.hscan(key, cursor, { count: 1000 });
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const value = flat[i + 1];
      found.set(String(flat[i]), (typeof value === 'string' ? JSON.parse(value) : value) as T);
    }
    cursor = next;
  } while (String(cursor) !== '0');
  return found;
}

const [blast, survive, marathon, dressing] = await Promise.all([
  hashOf<StoredCareer<BlastCareer>>(`${SCOPE}blast:careers`),
  hashOf<StoredCareer<SurviveCareer>>(`${SCOPE}survivecareer:careers`),
  hashOf<StoredCareer<MarathonCareer>>(`${SCOPE}marathoncareer:careers`),
  hashOf<{ outfit?: string; seen?: string[] }>(`${SCOPE}dressing`),
]);

const now = Date.now();
interface Player { record: DressingRecord; last: number }
const players: Player[] = [...new Set([...blast.keys(), ...survive.keys(), ...marathon.keys()])].map(id => ({
  record: {
    careers: {
      classic: { ...emptyBlast(), ...blast.get(id)?.career },
      survive: { ...emptySurvive(), ...survive.get(id)?.career },
      marathon: { ...emptyMarathon(), ...marathon.get(id)?.career },
    },
    rivals: { won: 0, beaten: 0 }, launch: { classic: 0, survive: 0, marathon: 0 }, welcomed: true,
  },
  last: Math.max(blast.get(id)?.at ?? 0, survive.get(id)?.at ?? 0, marathon.get(id)?.at ?? 0),
}));
const active = players.filter(p => now - p.last < 30 * DAY_MS);

const pct = (part: number, whole: number) => (whole ? `${Math.round(part / whole * 100)}%` : '–').padStart(5);
const row = (label: string, all: number, recent: number) =>
  console.log(`  ${label.padEnd(40)} ${String(all).padStart(6)} ${pct(all, players.length)}   ${String(recent).padStart(6)} ${pct(recent, active.length)}`);
const head = (title: string) => console.log(`\n${title.padEnd(42)}    all players   played in 30 days`);
const count = (list: Player[], test: (r: DressingRecord) => boolean) => list.filter(p => test(p.record)).length;
const both = (label: string, test: (r: DressingRecord) => boolean) => row(label, count(players, test), count(active, test));

console.log(`Players with a career        ${players.length}`);
console.log(`… who played in the last 30  ${active.length}`);

head('Who plays each mode');
const c = (r: DressingRecord) => r.careers;
both('Blast, an innings or more', r => c(r).classic.innings > 0);
both('Test Survival, an innings or more', r => c(r).survive.innings > 0);
both('Test Marathon, an innings or more', r => c(r).marathon.innings > 0);
const innings = (list: Player[], pick: (r: DressingRecord) => number) => list.reduce((sum, p) => sum + pick(p.record), 0);
for (const [label, pick] of [['Blast', (r: DressingRecord) => c(r).classic.innings], ['Survival', (r: DressingRecord) => c(r).survive.innings], ['Marathon', (r: DressingRecord) => c(r).marathon.innings]] as const) {
  console.log(`  ${`Innings in the ${label}`.padEnd(40)} ${String(innings(players, pick)).padStart(6)}`);
}

head('Electric now: Test Survival wins');
for (const n of [1, 5, 10, 25, 50]) both(`${n}+ Survival wins`, r => c(r).survive.wins >= n);

head('Blast best innings');
for (const n of [50, 100, 120, 150, 170]) both(`${n}+ in a Blast`, r => c(r).classic.highest >= n);

head('Blast career runs');
for (const n of [500, 1000, 2500, 5000, 10000]) both(`${n.toLocaleString('en')}+ Blast runs`, r => c(r).classic.runs >= n);

head('Blast hundreds (one batter)');
for (const n of [1, 3, 5, 10]) both(`${n}+ Blast hundreds`, r => c(r).classic.hundreds >= n);

head('Candidates for Electric');
const sixes = (r: DressingRecord) => c(r).classic.sixes + c(r).survive.sixes + c(r).marathon.sixes;
const runs = (r: DressingRecord) => c(r).classic.runs + c(r).survive.runs + c(r).marathon.runs;
both('150 in a Blast', r => c(r).classic.highest >= 150);
both('5,000 Blast runs', r => c(r).classic.runs >= 5000);
both('150 in a Blast AND 5,000 Blast runs', r => c(r).classic.highest >= 150 && c(r).classic.runs >= 5000);
both('… halfway (75 best, 2,500 runs)', r => c(r).classic.highest >= 75 && c(r).classic.runs >= 2500);
both('5 Blast hundreds', r => c(r).classic.hundreds >= 5);
both('500 career sixes', r => sixes(r) >= 500);
both('5,000 career runs, every mode', r => runs(r) >= 5000);

head('Every kit and bat, earned now');
for (const o of OUTFITS) {
  const steps = (r: DressingRecord) => outfitSteps(o.id, r);
  if (o.id === 'home' || o.id === 'papaya') continue;
  if (o.id === 'gold') { console.log(`  ${'Kit: Bumblebee'.padEnd(40)}   (Rival wins: not in the careers)`); continue; }
  both(`Kit: ${o.name}`, r => (steps(r) ?? []).every(done));
}
for (const b of BATS) {
  if (b.id === 'plain' || b.id === 'boom') continue;
  if (b.id === 'meg') { console.log(`  ${'Bat: Meg'.padEnd(40)}   (Rival wins: not in the careers)`); continue; }
  both(`Bat: ${b.name}`, r => (batSteps(b.id, r) ?? []).every(done));
}

const saved = [...dressing.values()];
const wearing = new Map<string, number>();
for (const one of saved) wearing.set(one.outfit ?? 'home', (wearing.get(one.outfit ?? 'home') ?? 0) + 1);
console.log(`\nDressing Room copies saved    ${saved.length}`);
console.log('  Kit worn now:');
for (const o of OUTFITS) console.log(`    ${o.name.padEnd(38)} ${String(wearing.get(o.id) ?? 0).padStart(6)}`);
console.log(`  Electric seen as earned        ${saved.filter(one => one.seen?.includes('kit:electric')).length}`);
