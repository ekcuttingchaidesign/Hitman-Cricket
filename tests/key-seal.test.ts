import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEAL_ENV, keepKey, keyMatches, keySealSecret, mintKey, openKey, sealKey } from '../src/server/career-key';
import { inningsOf, lookUpKey, resetKey } from '../src/server/key-admin';
import { memoryRecovery } from '../src/server/memory-recovery';
import { carryKey, keyOnClaim, restore } from '../src/server/recovery-store';

const SECRET = randomBytes(32);
const OTHER = randomBytes(32);
const at = { address: '10.0.0.1' };
const store = (names: [string, string][] = [['dhruv', 'p-dhruv'], ['rohit', 'p-rohit']]) =>
  memoryRecovery(new Map(names));

describe('the sealing secret', () => {
  it('is thirty-two bytes of base64 from the environment', () => {
    const raw = SECRET.toString('base64');
    expect(keySealSecret({ [SEAL_ENV]: raw })?.equals(SECRET)).toBe(true);
    expect(keySealSecret({ [SEAL_ENV]: `  ${raw}\n` })?.equals(SECRET)).toBe(true);
  });

  /** A secret that is wrong is no secret: keys are kept hash-only and the game carries on. */
  it('is nothing at all when missing or the wrong size', () => {
    expect(keySealSecret({})).toBeNull();
    expect(keySealSecret({ [SEAL_ENV]: '' })).toBeNull();
    expect(keySealSecret({ [SEAL_ENV]: randomBytes(16).toString('base64') })).toBeNull();
    expect(keySealSecret({ [SEAL_ENV]: 'not a secret' })).toBeNull();
  });
});

describe('a sealed key', () => {
  it('opens to the key it sealed, with the secret it was sealed with', () => {
    const key = mintKey();
    expect(openKey({ sealed: sealKey(key, SECRET) }, SECRET)).toBe(key);
  });

  it('is sealed differently every time, so two players with one key look nothing alike', () => {
    const key = mintKey();
    expect(sealKey(key, SECRET)).not.toBe(sealKey(key, SECRET));
  });

  it('does not open with another secret', () => {
    expect(openKey({ sealed: sealKey(mintKey(), SECRET) }, OTHER)).toBeNull();
  });

  /** Changed in the store is not opened to a wrong key: it is not opened at all. */
  it('does not open once it has been tampered with', () => {
    const sealed = sealKey(mintKey(), SECRET);
    const parts = sealed.split('.');
    const body = Buffer.from(parts[3], 'base64url');
    body[0] ^= 1;
    parts[3] = body.toString('base64url');
    expect(openKey({ sealed: parts.join('.') }, SECRET)).toBeNull();
    expect(openKey({ sealed: 'v2.a.b.c' }, SECRET)).toBeNull();
    expect(openKey({ sealed: 'nonsense' }, SECRET)).toBeNull();
    expect(openKey({}, SECRET)).toBeNull();
    expect(openKey(null, SECRET)).toBeNull();
  });

  it('never holds the key in a form that can be read without the secret', () => {
    const key = 'yorker-sprint-cover-47';
    const held = keepKey(key, 0, SECRET);
    expect(JSON.stringify(held)).not.toContain('yorker');
    expect(JSON.stringify(held)).not.toContain('sprint');
  });
});

describe('keeping a key', () => {
  it('seals it when there is a secret, and keeps the hash a restore is checked against', () => {
    const key = mintKey();
    const held = keepKey(key, 0, SECRET);
    expect(held.sealed).toBeDefined();
    expect(keyMatches(key, held)).toBe(true);
    expect(openKey(held, SECRET)).toBe(key);
  });

  it('keeps it as it always has, hash only, when there is no secret', () => {
    const key = mintKey();
    const held = keepKey(key, 0, null);
    expect(held.sealed).toBeUndefined();
    expect(keyMatches(key, held)).toBe(true);
  });

  /** Typed back with odd case and spaces, it is still the key it seals. */
  it('seals the key in the form it is compared in', () => {
    const held = keepKey('  Yorker-Sprint-Cover-47 ', 0, SECRET);
    expect(openKey(held, SECRET)).toBe('yorker-sprint-cover-47');
  });

  it('carries its seal with it when the player changes their name', async () => {
    const recovery = store([['dhruv', 'p-dhruv'], ['dhruvx', 'p-dhruv']]);
    const key = mintKey();
    await recovery.putKey('dhruv', keepKey(key, 0, SECRET));
    await carryKey(recovery, { from: 'Dhruv', to: 'dhruvx', playerId: 'p-dhruv' });
    expect(openKey(await recovery.keyFor('dhruvx'), SECRET)).toBe(key);
  });
});

describe('reading a key back for the owner', () => {
  it('reads a sealed key, by the name as the player types it', async () => {
    const recovery = store();
    const key = mintKey();
    await recovery.putKey('dhruv', keepKey(key, Date.UTC(2026, 9, 1), SECRET));
    const found = await lookUpKey(recovery, '  DHRUV ', SECRET);
    expect(found).toMatchObject({ name: 'DHRUV', folded: 'dhruv', holder: 'p-dhruv', key, missing: null });
    expect(found.issued).toBe(Date.UTC(2026, 9, 1));
  });

  it('says why when there is nothing it can show', async () => {
    const recovery = store();
    expect((await lookUpKey(recovery, 'Nobody', SECRET)).missing).toMatch(/Nobody holds/);
    expect((await lookUpKey(recovery, 'Dhruv', SECRET)).missing).toMatch(/no key yet/);
    await recovery.putKey('dhruv', keepKey(mintKey(), 0, null));
    expect((await lookUpKey(recovery, 'Dhruv', SECRET)).missing).toMatch(/before keys were sealed/);
    await recovery.putKey('dhruv', keepKey(mintKey(), 0, SECRET));
    expect((await lookUpKey(recovery, 'Dhruv', null)).missing).toMatch(/KEY_SEAL_SECRET is not set/);
    expect((await lookUpKey(recovery, 'Dhruv', OTHER)).missing).toMatch(/does not open/);
    expect((await lookUpKey(recovery, '', SECRET)).missing).toMatch(/not a name/);
  });

  it('reads and writes nothing else', async () => {
    const recovery = store();
    const before = JSON.stringify([...recovery.keys]);
    await lookUpKey(recovery, 'Dhruv', SECRET);
    expect(JSON.stringify([...recovery.keys])).toBe(before);
  });
});

describe('a new key for one player', () => {
  it('opens their record, and the old key no longer does', async () => {
    const recovery = store();
    const old = await keyOnClaim(recovery, 'dhruv');
    const done = await resetKey(recovery, 'Dhruv', { secret: SECRET });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.key).not.toBe(old);
    expect(await restore(recovery, { name: 'Dhruv', key: done.key, ...at })).toEqual({ ok: true, playerId: 'p-dhruv' });
    expect((await restore(recovery, { name: 'Dhruv', key: old!, address: '10.0.0.2' })).ok).toBe(false);
  });

  /** One name, one key: everybody else's key goes on opening their own record. */
  it('touches no other player', async () => {
    const recovery = store();
    await keyOnClaim(recovery, 'dhruv');
    const rohits = await keyOnClaim(recovery, 'rohit');
    const before = recovery.keys.get('rohit');
    await resetKey(recovery, 'Dhruv', { secret: SECRET });
    expect(recovery.keys.get('rohit')).toBe(before);
    expect(await restore(recovery, { name: 'Rohit', key: rohits!, ...at })).toEqual({ ok: true, playerId: 'p-rohit' });
    expect([...recovery.keys.keys()].sort()).toEqual(['dhruv', 'rohit']);
  });

  it('gives a key to a player who never had one', async () => {
    const recovery = store();
    const done = await resetKey(recovery, 'Dhruv', { secret: SECRET });
    expect(done.ok && (await restore(recovery, { name: 'Dhruv', key: done.key, ...at })).ok).toBe(true);
  });

  it('is sealed when there is a secret, so it can be read back next time', async () => {
    const recovery = store();
    const done = await resetKey(recovery, 'Dhruv', { secret: SECRET });
    expect(done.ok && done.sealed).toBe(true);
    expect((await lookUpKey(recovery, 'Dhruv', SECRET)).key).toBe(done.ok ? done.key : 'x');
    const plain = await resetKey(recovery, 'Dhruv', { secret: null });
    expect(plain.ok && plain.sealed).toBe(false);
  });

  /** A key with no player behind it opens nothing, and would only confuse whoever was sent it. */
  it('refuses a name nobody holds, and writes nothing', async () => {
    const recovery = store();
    expect(await resetKey(recovery, 'Nobody', { secret: SECRET })).toEqual({
      ok: false, reason: 'Nobody holds that name, so there is no record to give a key to.',
    });
    expect((await resetKey(recovery, '  ', { secret: SECRET })).ok).toBe(false);
    expect(recovery.keys.size).toBe(0);
  });
});

describe('how much of a player there is', () => {
  it('counts the innings in each career, and nought where there is none', async () => {
    const records: Record<string, unknown> = {
      'development:blast:careers': { career: { innings: 42 } },
      'development:marathoncareer:careers': { career: { innings: 3 } },
    };
    const counted = await inningsOf(async field => records[field] ?? null, 'development:', 'p-dhruv');
    expect(counted).toEqual({ blast: 42, survival: 0, marathon: 3 });
  });
});
