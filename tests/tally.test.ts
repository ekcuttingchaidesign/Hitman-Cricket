import { describe, expect, it } from 'vitest';
import { memoryRecovery } from '../src/server/memory-recovery';
import { setPassword } from '../src/server/recovery-store';
import { TALLIES, tallyFields } from '../src/server/tally';

describe('the password tally', () => {
  it('raises a total and a day, the day in India’s time', () => {
    // 20:00 UTC on the 16th is 01:30 on the 17th in India.
    expect(tallyFields('restore-password', Date.UTC(2026, 9, 16, 20))).toEqual(['restore-password', '2026-10-17:restore-password']);
    expect(tallyFields('password-created', Date.UTC(2026, 9, 16, 12))).toEqual(['password-created', '2026-10-16:password-created']);
  });
  it('is kept by name: an event is only ever added', () => {
    expect(TALLIES.slice(0, 7)).toEqual([
      'password-created', 'password-changed', 'question-set', 'restore-password', 'restore-question', 'restore-key', 'forgot-asked',
    ]);
  });
  it('tells a first password from a change, which is what it counts them by', async () => {
    const store = memoryRecovery(new Map([['gauravrana', 'p-gaurav']]));
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: 'p-gaurav', password: 'square-cut-9' })).toMatchObject({ ok: true, first: true });
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: 'p-gaurav', password: 'cover-drive-4' })).toMatchObject({ ok: true, first: false });
  });
});
