import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAIM_MS, PENDING_MAX, PENDING_MAX_AGE_MS, allPending, claimPending, dropPending, keepPending, nextPending, resetPendingMemory,
  type PendingInnings,
} from '../src/game/pending-innings';
import { countInnings } from '../src/game/career-api';
import { BLAST_CAREER, emptyBlast, type BlastTally } from '../src/game/career';
import { MIN_INNINGS_MS, countInnings as countOnStore, refusedCareer } from '../src/server/career-store';
import { memoryCareer } from '../src/server/memory-career';
import { foldName } from '../src/server/board-store';

const ME = 'abc123-defghijklmno';
const NOW = 1_800_000_000_000;

function fakeStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
    removeItem: (key: string) => { held.delete(key); },
  });
  return held;
}

const innings = (nonce: string, over: Partial<PendingInnings> = {}): PendingInnings => ({
  player: ME, mode: 'classic', tally: { runs: 150 }, nonce, look: null, ended: NOW, ...over,
});

beforeEach(() => { resetPendingMemory(); fakeStorage(); });
afterEach(() => vi.unstubAllGlobals());

describe('an innings the career has not answered for', () => {
  it('is kept until it is crossed off, and only once however often it is kept', () => {
    keepPending(innings('aaaabbbbcccc'));
    keepPending(innings('aaaabbbbcccc'));
    expect(allPending()).toHaveLength(1);
    expect(nextPending(ME, NOW)?.nonce).toBe('aaaabbbbcccc');
    dropPending('aaaabbbbcccc');
    expect(nextPending(ME, NOW)).toBeNull();
  });

  it('survives a reload, because it is in the browser and not the page', () => {
    const held = fakeStorage();
    keepPending(innings('aaaabbbbcccc'));
    fakeStorage(Object.fromEntries(held));
    expect(nextPending(ME, NOW)?.nonce).toBe('aaaabbbbcccc');
  });

  it('goes oldest first, so the innings land in the order they were played', () => {
    keepPending(innings('first0000000', { ended: NOW - 2000 }));
    keepPending(innings('second000000', { ended: NOW - 1000 }));
    expect(nextPending(ME, NOW)?.nonce).toBe('first0000000');
    expect(nextPending(ME, NOW, new Set(['first0000000']))?.nonce).toBe('second000000');
  });

  it('is left alone while another tab is sending it, and free again once that tab lets go', () => {
    keepPending(innings('aaaabbbbcccc'));
    claimPending('aaaabbbbcccc', NOW);
    expect(nextPending(ME, NOW + 1000)).toBeNull();
    // A tab that closed mid-send never lets go; the claim runs out on its own.
    expect(nextPending(ME, NOW + CLAIM_MS + 1)?.nonce).toBe('aaaabbbbcccc');
    claimPending('aaaabbbbcccc', null);
    expect(nextPending(ME, NOW + 1000)?.nonce).toBe('aaaabbbbcccc');
  });

  it('is never sent for somebody this browser is not any more', () => {
    keepPending(innings('aaaabbbbcccc', { player: 'zzz999-somebodyelse0' }));
    expect(nextPending(ME, NOW)).toBeNull();
  });

  it('is dropped once it is too old to be worth counting', () => {
    keepPending(innings('aaaabbbbcccc'));
    expect(nextPending(ME, NOW + PENDING_MAX_AGE_MS + 1)).toBeNull();
    expect(allPending()).toHaveLength(0);
  });

  it('keeps the newest when there are more than it holds', () => {
    for (let i = 0; i < PENDING_MAX + 5; i++) keepPending(innings(`n${String(i).padStart(11, '0')}`, { ended: NOW + i }));
    const kept = allPending();
    expect(kept).toHaveLength(PENDING_MAX);
    expect(kept[0].nonce).toBe(`n${String(5).padStart(11, '0')}`);
  });

  it('is still held for this visit when the browser will not store it', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('off'); },
      setItem: () => { throw new Error('off'); },
      removeItem: () => { throw new Error('off'); },
    });
    keepPending(innings('aaaabbbbcccc'));
    expect(nextPending(ME, NOW)?.nonce).toBe('aaaabbbbcccc');
    dropPending('aaaabbbbcccc');
    expect(nextPending(ME, NOW)).toBeNull();
  });

  it('reads junk in storage as nothing held', () => {
    fakeStorage({ 'hitman-pending-innings': 'not json' });
    expect(nextPending(ME, NOW)).toBeNull();
    fakeStorage({ 'hitman-pending-innings': JSON.stringify([{ nonce: 'x' }, innings('aaaabbbbcccc')]) });
    expect(allPending().map(one => one.nonce)).toEqual(['aaaabbbbcccc']);
  });
});

describe('what the store says about an innings it did not count', () => {
  const tally: BlastTally = {
    runs: 150, sixes: 25, fours: 0, wickets: 0, dots: 5, balls: 30, individual: 150, hundreds: 1,
  };
  const sending = (nonce: string) => ({ playerId: ME, name: 'Asha', avatar: 1, nonce, address: '1.2.3.4', tally });
  const store = () => memoryCareer<ReturnType<typeof emptyBlast>>(new Map([[foldName('Asha'), ME]]));

  it('says repeat for one it has counted, and soon for one hard on the heels of the last', async () => {
    const held = store();
    await countOnStore(held, BLAST_CAREER, sending('aaaabbbbcccc'), NOW);
    const again = await countOnStore(held, BLAST_CAREER, sending('aaaabbbbcccc'), NOW + 60_000);
    const soon = await countOnStore(held, BLAST_CAREER, sending('ddddeeeeffff'), NOW + 1000);
    if (refusedCareer(again) || refusedCareer(soon)) throw new Error('refused');
    expect([again.counted, again.why]).toEqual([false, 'repeat']);
    expect([soon.counted, soon.why]).toEqual([false, 'soon']);
    // And the one called soon counts once the gap has passed: kept, not lost.
    const later = await countOnStore(held, BLAST_CAREER, sending('ddddeeeeffff'), NOW + MIN_INNINGS_MS + 1);
    if (refusedCareer(later)) throw new Error('refused');
    expect(later.counted).toBe(true);
    expect(later.career.innings).toBe(2);
  });
});

describe('one attempt to count, as the browser reads it', () => {
  const answering = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));

  it('took it, counted or not, with the reason when not', async () => {
    answering(200, { ok: true, counted: false, why: 'soon', career: emptyBlast(), name: 'Asha', avatar: 1 });
    expect(await countInnings(ME, 'classic', {}, null, 'aaaabbbbcccc')).toMatchObject({ kind: 'took', counted: false, why: 'soon' });
  });

  it('refused for good on a request that can never be counted', async () => {
    answering(400, { error: 'That innings could not have happened.', retry: false, status: 400 });
    expect(await countInnings(ME, 'classic', {}, null, 'aaaabbbbcccc')).toEqual({ kind: 'refused' });
  });

  it('unreached on no signal, an address over its allowance, or the store down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await countInnings(ME, 'classic', {}, null, 'aaaabbbbcccc')).toEqual({ kind: 'unreached' });
    answering(429, { error: 'Too many innings from here.', retry: false, status: 429 });
    expect(await countInnings(ME, 'classic', {}, null, 'aaaabbbbcccc')).toEqual({ kind: 'unreached' });
    answering(503, { error: 'The board could not be reached.', retry: true, status: 503 });
    expect(await countInnings(ME, 'classic', {}, null, 'aaaabbbbcccc')).toEqual({ kind: 'unreached' });
  });
});
