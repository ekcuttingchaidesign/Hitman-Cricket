import { describe, expect, it } from 'vitest';
import { foldKey, keepKey, keyMatches, keyShaped, mintKey } from '../src/server/career-key';
import { memoryRecovery } from '../src/server/memory-recovery';
import {
  RESTORE_TRIES_AT, RESTORE_TRIES_FROM, firstKey, keyOnClaim, newKey, refusedRecovery, restore,
} from '../src/server/recovery-store';
import { KEY_WORDS } from '../src/game/key-words';
import { keyShareText, keyWhatsappLink } from '../src/game/Share';
import { restoreFailure } from '../src/game/analytics';

const held = (names: [string, string][] = [['rohit', 'p-rohit']]) =>
  memoryRecovery(new Map(names));

describe('the key a career is brought back with', () => {
  it('is three words from the list and two digits', () => {
    for (let i = 0; i < 40; i++) {
      const key = mintKey();
      expect(keyShaped(key)).toBe(true);
      const [a, b, c, digits] = key.split('-');
      expect(KEY_WORDS).toContain(a);
      expect(KEY_WORDS).toContain(b);
      expect(KEY_WORDS).toContain(c);
      expect(digits).toMatch(/^\d{2}$/);
    }
  });

  it('is not the same key twice', () => {
    const minted = new Set(Array.from({ length: 200 }, () => mintKey()));
    expect(minted.size).toBeGreaterThan(190);
  });

  /** Read off paper and typed by hand, so case and spaces are the writer's. */
  it('forgives the case and the spaces a hand adds, and nothing else', () => {
    const key = 'yorker-sprint-cover-47';
    const kept = keepKey(key);
    expect(keyMatches('  YORKER-Sprint-Cover-47 ', kept)).toBe(true);
    expect(keyMatches('yorker - sprint - cover - 47', kept)).toBe(true);
    expect(keyMatches('yorker-sprint-cover-48', kept)).toBe(false);
    expect(keyMatches('yorker-sprint-covers-47', kept)).toBe(false);
  });

  it('keeps no trace of the key it was made from', () => {
    const kept = keepKey('yorker-sprint-cover-47');
    expect(JSON.stringify(kept)).not.toContain('yorker');
    expect(JSON.stringify(kept)).not.toContain('sprint');
  });

  it('salts every key of its own, so two of the same do not look alike', () => {
    const one = keepKey('yorker-sprint-cover-47');
    const two = keepKey('yorker-sprint-cover-47');
    expect(one.salt).not.toBe(two.salt);
    expect(one.hash).not.toBe(two.hash);
    expect(keyMatches('yorker-sprint-cover-47', one)).toBe(true);
    expect(keyMatches('yorker-sprint-cover-47', two)).toBe(true);
  });

  it('answers no to a record it cannot read rather than throwing', () => {
    expect(keyMatches('yorker-sprint-cover-47', { salt: '', hash: 'not-hex', at: 0 })).toBe(false);
  });

  it('is only ever the shape of a key', () => {
    expect(keyShaped(foldKey('yorker-sprint-cover-47'))).toBe(true);
    expect(keyShaped(foldKey('yorker-sprint-47'))).toBe(false);
    expect(keyShaped(foldKey('yorker-sprint-cover-7'))).toBe(false);
    expect(keyShaped(foldKey('yorker sprint cover 47'))).toBe(false);
  });
});

describe('what a name and a key open', () => {
  const at = { address: '10.0.0.1' };

  it('gives back the player the name belongs to', async () => {
    const store = held();
    const key = await keyOnClaim(store, 'rohit');
    const out = await restore(store, { name: 'Rohit', key: key!, ...at });
    expect(out).toEqual({ ok: true, playerId: 'p-rohit' });
  });

  it('reads the name the way the board does, so its spelling does not matter', async () => {
    const store = held();
    const key = await keyOnClaim(store, 'rohit');
    expect((await restore(store, { name: '  R O H I T ', key: key!, ...at })).ok).toBe(true);
  });

  /**
   * Every refusal is one sentence. A key that is wrong, a name nobody holds and
   * a name with no key all answer the same, or this becomes a way to ask which
   * names exist without ever playing an innings.
   */
  it('says the same thing however it failed', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    const wrongKey = await restore(store, { name: 'Rohit', key: 'yorker-sprint-cover-47', ...at });
    const noName = await restore(store, { name: 'Nobody', key: 'yorker-sprint-cover-47', ...at });
    const noKey = await restore(memoryRecovery(new Map([['bare', 'p-bare']])),
      { name: 'Bare', key: 'yorker-sprint-cover-47', ...at });
    expect(wrongKey.ok).toBe(false);
    expect(noName.ok).toBe(false);
    expect(noKey.ok).toBe(false);
    const said = [wrongKey, noName, noKey].map(one => (one as { reason: string }).reason);
    expect(new Set(said).size).toBe(1);
  });

  /**
   * The one refusal that is allowed to say more, because it gives nothing away:
   * the shape is printed in the field's own placeholder. The player it happens
   * to has pasted half a key, and telling them it "did not match" sends them
   * looking for the wrong mistake.
   */
  it('says what a key looks like when what it got is not one', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    const out = await restore(store, { name: 'Rohit', key: 'not-a-key', ...at });
    expect(out).toMatchObject({ ok: false, status: 400 });
    expect((out as { reason: string }).reason).toContain('three words and two numbers');
    // Nothing was spent: the shape is wrong, so no attempt was counted against
    // the name and a player with the right key still has their full allowance.
    expect(store.keys.size).toBe(1);
  });

  it('and never mistakes that for an answer about what is stored', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    const shape = await restore(store, { name: 'Rohit', key: 'not-a-key', ...at });
    const wrong = await restore(store, { name: 'Rohit', key: 'yorker-sprint-cover-47', ...at });
    expect((shape as { reason: string }).reason).not.toBe((wrong as { reason: string }).reason);
  });

  it('stops an address working through the keyspace', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    let last;
    for (let i = 0; i <= RESTORE_TRIES_FROM; i++) {
      last = await restore(store, { name: 'Rohit', key: 'yorker-sprint-cover-47', ...at });
    }
    expect(last).toMatchObject({ ok: false, status: 429 });
    expect((last as { reason: string }).reason).toContain('from here');
  });

  /** The attack this shape invites: many addresses, one name. */
  it('stops many addresses working through one name', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    let last;
    for (let i = 0; i <= RESTORE_TRIES_AT; i++) {
      last = await restore(store, { name: 'Rohit', key: 'yorker-sprint-cover-47', address: `10.0.0.${i}` });
    }
    expect(last).toMatchObject({ ok: false, status: 429 });
    expect((last as { reason: string }).reason).toContain('that name');
  });
});

describe('a key handed over, and a key replaced', () => {
  it('is minted the first time a name is claimed and never again', async () => {
    const store = held();
    const first = await keyOnClaim(store, 'rohit');
    expect(first).not.toBeNull();
    // Registering again is every improved innings, not only the first. Minting
    // here each time would quietly stop the key they wrote down from working.
    expect(await keyOnClaim(store, 'rohit')).toBeNull();
    expect((await restore(store, { name: 'Rohit', key: first!, address: '10.0.0.1' })).ok).toBe(true);
  });

  it('is replaced for somebody who holds the name', async () => {
    const store = held();
    const first = await keyOnClaim(store, 'rohit');
    const made = await newKey(store, { name: 'Rohit', playerId: 'p-rohit' });
    expect(made.ok).toBe(true);
    const fresh = (made as { key: string }).key;
    expect(fresh).not.toBe(first);
    expect((await restore(store, { name: 'Rohit', key: fresh, address: '10.0.0.1' })).ok).toBe(true);
    // The old one stops working, which is what asking for a new one means.
    expect((await restore(store, { name: 'Rohit', key: first!, address: '10.0.0.2' })).ok).toBe(false);
  });

  it('is never replaced for somebody who does not hold the name', async () => {
    const store = held();
    const first = await keyOnClaim(store, 'rohit');
    const made = await newKey(store, { name: 'Rohit', playerId: 'p-somebody-else' });
    expect(made).toMatchObject({ ok: false, status: 403 });
    // And the key they hold is untouched, so the refusal cost them nothing.
    expect((await restore(store, { name: 'Rohit', key: first!, address: '10.0.0.1' })).ok).toBe(true);
  });

  it('leaves the name where it is when a key is replaced', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    await newKey(store, { name: 'Rohit', playerId: 'p-rohit' });
    expect(store.names.get('rohit')).toBe('p-rohit');
  });
});

describe('the message a player sends themselves', () => {
  it('carries both halves, because one of them opens nothing', () => {
    const said = keyShareText('Rohit', 'yorker-sprint-cover-47', 'https://hitman-cricket.vercel.app/');
    expect(said).toContain('Rohit');
    expect(said).toContain('yorker-sprint-cover-47');
  });

  it('and the way back in, which is the point of saving it at all', () => {
    expect(keyShareText('Rohit', 'yorker-sprint-cover-47', 'https://hitman-cricket.vercel.app/')).toContain('http');
  });

  it('survives the trip through a URL', () => {
    const link = keyWhatsappLink('Rohit Ji', 'yorker-sprint-cover-47', 'https://hitman-cricket.vercel.app/');
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.slice('https://wa.me/?text='.length)))
      .toContain('yorker-sprint-cover-47');
  });
});

/**
 * The banding is a regular expression over a message the store writes, which is
 * a thread anybody can cut without noticing: reword a refusal and the band
 * quietly becomes `busy`, and a dashboard goes on reporting rate limiting for
 * something that is nothing of the sort. So these ask the store for the real
 * answers rather than restating them here.
 */
describe('what a refused restore is counted as', () => {
  const at = { address: '10.0.0.1' };

  it('calls a half-typed key a shape problem', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    const out = await restore(store, { name: 'Rohit', key: 'not-a-key', ...at });
    expect(out.ok).toBe(false);
    expect(restoreFailure(refusedRecovery(out) ? out.reason : null)).toBe('shape');
  });

  it('calls a key that does not open the name a mismatch', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    const out = await restore(store, { name: 'Rohit', key: 'yorker-sprint-cover-47', ...at });
    expect(out.ok).toBe(false);
    expect(restoreFailure(refusedRecovery(out) ? out.reason : null)).toBe('mismatch');
  });

  it('and a name nobody claimed the same, since the screen will not say otherwise', async () => {
    const store = held();
    const out = await restore(store, { name: 'Nobody', key: 'yorker-sprint-cover-47', ...at });
    expect(restoreFailure(refusedRecovery(out) ? out.reason : null)).toBe('mismatch');
  });

  it('calls the rate limiter busy, and nothing else does', async () => {
    const store = held();
    await keyOnClaim(store, 'rohit');
    let last = null;
    for (let i = 0; i <= RESTORE_TRIES_AT; i++) {
      last = await restore(store, { name: 'Rohit', key: 'yorker-sprint-cover-47', ...at });
    }
    expect(last!.ok).toBe(false);
    expect(restoreFailure(refusedRecovery(last!) ? last!.reason : null)).toBe('busy');
  });

  it('and anything it has never seen, rather than throwing on it', () => {
    expect(restoreFailure(null)).toBe('busy');
    expect(restoreFailure(undefined)).toBe('busy');
    expect(restoreFailure('The board is down.')).toBe('busy');
  });
});

describe('the key a name never had', () => {
  it('mints one for the player who holds the name', async () => {
    const store = held();
    const out = await firstKey(store, { name: 'Rohit', playerId: 'p-rohit' });
    expect(out.ok).toBe(true);
    expect(keyShaped(foldKey((out as { key: string }).key))).toBe(true);
  });

  it('and the key it mints is the one that name now opens with', async () => {
    const store = held();
    const made = await firstKey(store, { name: 'Rohit', playerId: 'p-rohit' });
    const key = (made as { key: string }).key;
    expect(await restore(store, { name: 'Rohit', key, address: '10.0.0.1' }))
      .toEqual({ ok: true, playerId: 'p-rohit' });
  });

  /**
   * The whole reason this is safe to call unasked. Minting again would leave
   * the key somebody had already written down opening nothing, which is worse
   * than the state it was trying to fix.
   */
  it('never mints over a key that exists, and says so with null', async () => {
    const store = held();
    const first = await firstKey(store, { name: 'Rohit', playerId: 'p-rohit' });
    const again = await firstKey(store, { name: 'Rohit', playerId: 'p-rohit' });
    expect(again).toEqual({ ok: true, key: null });
    // And the one it did not replace still works.
    expect((await restore(store, {
      name: 'Rohit', key: (first as { key: string }).key, address: '10.0.0.1',
    })).ok).toBe(true);
  });

  it('leaves a key minted by a claim alone', async () => {
    const store = held();
    const onClaim = await keyOnClaim(store, 'rohit');
    expect(await firstKey(store, { name: 'Rohit', playerId: 'p-rohit' })).toEqual({ ok: true, key: null });
    expect((await restore(store, { name: 'Rohit', key: onClaim!, address: '10.0.0.1' })).ok).toBe(true);
  });

  it('refuses a name held by somebody else, which is the whole risk', async () => {
    const store = held();
    const out = await firstKey(store, { name: 'Rohit', playerId: 'p-somebody-else' });
    expect(out).toEqual({ ok: false, status: 403, reason: 'That name is not yours.' });
  });

  it('and a name nobody holds, rather than minting one for it', async () => {
    const store = held();
    const out = await firstKey(store, { name: 'Nobody', playerId: 'p-nobody' });
    expect(refusedRecovery(out) && out.status).toBe(403);
    expect(await store.keyFor('nobody')).toBeFalsy();
  });

  it('and anything that is not a player', async () => {
    const store = held();
    expect(refusedRecovery(await firstKey(store, { name: 'Rohit', playerId: '' })) ).toBe(true);
    expect(refusedRecovery(await firstKey(store, { name: '', playerId: 'p-rohit' })) ).toBe(true);
    expect(refusedRecovery(await firstKey(store, { name: 'Rohit', playerId: 42 })) ).toBe(true);
  });
});
