import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_RATE_LIMIT, cleanPlayerId, feedbackCsv, keyAccepted, refusedFeedback, takeFeedback,
  type StoredFeedback,
} from '../src/server/feedback-store';
import { memoryFeedback } from '../src/server/memory-feedback';

/**
 * The submit path, end to end, against the same in-memory store the dev server
 * runs on. One implementation rather than two: a second fake would drift from
 * the one the endpoint is developed against.
 */
const ID = 'abcdef-abcdefghijkl';
const form = (over: Partial<Parameters<typeof takeFeedback>[1]> = {}) => ({
  playerId: ID,
  answers: { fun: ['4'], next: ['overs', 'bowl'] },
  suggestion: 'Let me bowl.',
  context: { mode: 'classic', runs: 58, device: 'touch' },
  address: '1.2.3.4',
  ...over,
});

describe('a form arriving', () => {
  it('is kept, cleaned, and stamped by the store rather than the browser', async () => {
    const store = memoryFeedback();
    const outcome = await takeFeedback(store, form(), 1_700_000_000_000);
    expect(outcome.ok).toBe(true);
    const [kept] = await store.read(10);
    expect(kept.at).toBe(1_700_000_000_000);
    expect(kept.answers).toEqual({ fun: ['4'], next: ['overs', 'bowl'] });
    expect(kept.suggestion).toBe('Let me bowl.');
    expect(kept.context).toEqual({ mode: 'classic', runs: 58, device: 'touch' });
  });

  it('keeps a form that answered one question and skipped the rest', async () => {
    const store = memoryFeedback();
    // Somebody who tapped once and left has still told you something, and
    // insisting on the whole questionnaire would lose the only thing they said.
    const outcome = await takeFeedback(store, form({ answers: { fun: ['1'] }, suggestion: '' }));
    expect(outcome.ok).toBe(true);
    expect((await store.read(10))[0].answers).toEqual({ fun: ['1'] });
  });

  it('keeps a form that is nothing but the box', async () => {
    const store = memoryFeedback();
    expect((await takeFeedback(store, form({ answers: {}, suggestion: 'More overs please' }))).ok).toBe(true);
  });

  it('turns away a form that said nothing at all', async () => {
    const store = memoryFeedback();
    const outcome = await takeFeedback(store, form({ answers: {}, suggestion: '   ' }));
    expect(refusedFeedback(outcome) && outcome.status).toBe(400);
    expect(await store.read(10)).toHaveLength(0);
  });

  it('drops an answer nobody was offered before it is stored', async () => {
    const store = memoryFeedback();
    await takeFeedback(store, form({ answers: { fun: ['4'], sneaky: ['<script>'] } }));
    expect(Object.keys((await store.read(10))[0].answers)).toEqual(['fun']);
  });

  it('newest first, which is the order anybody reads them in', async () => {
    const store = memoryFeedback();
    await takeFeedback(store, form({ suggestion: 'first' }), 1);
    await takeFeedback(store, form({ suggestion: 'second' }), 2);
    expect((await store.read(10)).map(one => one.suggestion)).toEqual(['second', 'first']);
  });

  it('lets an address say its piece and then stops counting it', async () => {
    const store = memoryFeedback();
    for (let i = 0; i < FEEDBACK_RATE_LIMIT; i++) {
      expect((await takeFeedback(store, form())).ok).toBe(true);
    }
    const over = await takeFeedback(store, form());
    expect(refusedFeedback(over) && over.status).toBe(429);
    // Somebody else on another connection is unaffected by that.
    expect((await takeFeedback(store, form({ address: '5.6.7.8' }))).ok).toBe(true);
  });

  it('counts a refused form against the limit, so a script pays for being turned away', async () => {
    const store = memoryFeedback();
    for (let i = 0; i < FEEDBACK_RATE_LIMIT; i++) {
      await takeFeedback(store, form({ answers: {}, suggestion: '' }));
    }
    const over = await takeFeedback(store, form());
    expect(refusedFeedback(over) && over.status).toBe(429);
  });
});

describe('who sent it', () => {
  it('keeps an id this game minted and drops anything else', () => {
    expect(cleanPlayerId(ID)).toBe(ID);
    expect(cleanPlayerId('../../etc/passwd')).toBe('');
    expect(cleanPlayerId(12)).toBe('');
    expect(cleanPlayerId(undefined)).toBe('');
  });
});

describe('the spreadsheet', () => {
  const entry = (over: Partial<StoredFeedback> = {}): StoredFeedback => ({
    at: 1_700_000_000_000,
    playerId: ID,
    answers: { fun: ['4'], next: ['overs', 'bowl'] },
    suggestion: 'Good fun',
    context: { mode: 'classic', runs: 58 },
    ...over,
  });

  it('gives every question a column, whether or not it was answered', () => {
    const [header] = feedbackCsv([entry()]).split('\n');
    expect(header).toContain('"fun"');
    expect(header).toContain('"tempt"');
    expect(header).toContain('"suggestion"');
  });

  it('joins a shortlist into one cell', () => {
    expect(feedbackCsv([entry()])).toContain('"overs bowl"');
  });

  it('escapes a quote the way CSV wants it', () => {
    expect(feedbackCsv([entry({ suggestion: 'the "cut" is off' })])).toContain('"the ""cut"" is off"');
  });

  it('defuses a suggestion a spreadsheet would otherwise run', () => {
    // A cell opening with = is a formula to Excel and Sheets, and this is the
    // one field somebody else typed.
    expect(feedbackCsv([entry({ suggestion: '=1+1' })])).toContain(`"'=1+1"`);
  });

  it('writes the time as something a person can read', () => {
    expect(feedbackCsv([entry()])).toContain('"2023-11-14T22:13:20.000Z"');
  });
});

describe('reading them back', () => {
  const KEY = 'wJRO5JdPrLjafef';

  it('takes the key', () => {
    expect(keyAccepted(KEY, KEY)).toBe(true);
  });

  it('takes it with the space that rides along from a copy and paste', () => {
    // A key pasted into an address bar with a leading space arrives as %20,
    // which is not a wrong key and used to answer exactly like one.
    expect(keyAccepted(KEY, ` ${KEY}`)).toBe(true);
    expect(keyAccepted(KEY, `${KEY} `)).toBe(true);
    // And the same mistake made in the box where the variable is set.
    expect(keyAccepted(` ${KEY} `, KEY)).toBe(true);
  });

  it('refuses a wrong key, an empty one, and anything that is not a string', () => {
    expect(keyAccepted(KEY, 'wJRO5JdPrLjafeg')).toBe(false);
    expect(keyAccepted(KEY, '')).toBe(false);
    expect(keyAccepted(KEY, undefined)).toBe(false);
    expect(keyAccepted(KEY, ['a', 'b'])).toBe(false);
  });

  it('stays shut where no key was ever set', () => {
    // An unset secret must never be a match, or an environment nobody
    // configured would be open to everybody.
    expect(keyAccepted(undefined, '')).toBe(false);
    expect(keyAccepted('', '')).toBe(false);
    expect(keyAccepted('   ', '   ')).toBe(false);
  });
});
