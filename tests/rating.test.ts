import { describe, expect, it } from 'vitest';
import {
  GAME_AFTER, MAX_DISMISSALS, NEW_MODES, QUIET_DAYS, cleanRating, counted, dismissed, emptyMemory,
  nextAsk, rated, tierOf, type AskWhen, type RatedMode, type RatingMemory,
} from '../src/game/rating';
import { FOLLOW_UPS, QUESTIONS, cleanAnswers, followUpFor, questionsFor } from '../src/game/feedback';

/**
 * When the stars are asked for. Every rule here is a rule about *not* asking,
 * because a rating prompt that comes too often is one people learn to close
 * unread — and nothing else would notice it creeping.
 */
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const when = (over: Partial<AskWhen> = {}): AskWhen => ({
  mode: 'classic', practice: false, askedThisVisit: false, formGiven: false, now: NOW, ...over,
});

/** A memory with these innings finished, in order. */
const after = (...modes: RatedMode[]): RatingMemory => modes.reduce(counted, emptyMemory());

describe('when the stars are asked for', () => {
  it('never on the first innings anybody plays, whatever it was', () => {
    for (const mode of ['classic', ...NEW_MODES] as RatedMode[]) {
      expect(nextAsk(after(mode), when({ mode }))).toBeNull();
    }
  });

  it('asks about a new mode by name after its first finished innings', () => {
    expect(nextAsk(after('classic', 'marathon'), when({ mode: 'marathon' })))
      .toEqual({ thing: 'marathon', moment: 'mode' });
    expect(nextAsk(after('classic', 'rivals'), when({ mode: 'rivals' })))
      .toEqual({ thing: 'rivals', moment: 'mode' });
  });

  it('asks about the game after the third finished innings, and not before', () => {
    expect(nextAsk(after('classic', 'classic'), when())).toBeNull();
    expect(nextAsk(after(...Array<RatedMode>(GAME_AFTER).fill('classic')), when()))
      .toEqual({ thing: 'game', moment: 'innings' });
  });

  it('puts the mode before the game when both are due', () => {
    expect(nextAsk(after('classic', 'classic', 'survive'), when({ mode: 'survive' }))?.thing).toBe('survive');
  });

  it('asks about each thing once', () => {
    const memory = rated(after('classic', 'classic', 'classic'), 'game', NOW);
    expect(nextAsk(memory, when())).toBeNull();
    const marathon = rated(after('classic', 'marathon'), 'marathon', NOW);
    expect(nextAsk(marathon, when({ mode: 'marathon' }))).toBeNull();
  });

  it('still asks somebody who rated the game about a mode that is new to them', () => {
    const memory = rated(after('classic', 'classic', 'classic', 'marathon'), 'game', NOW);
    expect(nextAsk(memory, when({ mode: 'marathon' }))?.thing).toBe('marathon');
  });

  it('does not ask about the game anybody already answered the questionnaire on', () => {
    expect(nextAsk(after('classic', 'classic', 'classic'), when({ formGiven: true }))).toBeNull();
    // But the new modes are new to them too.
    expect(nextAsk(after('classic', 'survive'), when({ mode: 'survive', formGiven: true }))?.thing).toBe('survive');
  });

  it('never on practice, and once a visit at most', () => {
    const memory = after('classic', 'classic', 'classic');
    expect(nextAsk(memory, when({ practice: true }))).toBeNull();
    expect(nextAsk(memory, when({ askedThisVisit: true }))).toBeNull();
  });

  it('keeps quiet for a week after being waved away, then asks again', () => {
    const memory = dismissed(after('classic', 'classic', 'classic'), NOW);
    expect(nextAsk(memory, when({ now: NOW + DAY }))).toBeNull();
    expect(nextAsk(memory, when({ now: NOW + (QUIET_DAYS - 1) * DAY }))).toBeNull();
    expect(nextAsk(memory, when({ now: NOW + QUIET_DAYS * DAY }))?.thing).toBe('game');
  });

  it('stops for good after being waved away enough times', () => {
    let memory = after('classic', 'classic', 'classic');
    for (let i = 0; i < MAX_DISMISSALS; i++) memory = dismissed(memory, NOW - 365 * DAY);
    expect(nextAsk(memory, when())).toBeNull();
  });
});

describe('a rating as it arrives', () => {
  it('keeps a whole star from one to five, and nothing else', () => {
    expect(cleanRating({ stars: 4, thing: 'marathon', moment: 'mode', ref: 'abc12345' }))
      .toEqual({ stars: 4, thing: 'marathon', moment: 'mode', ref: 'abc12345' });
    for (const stars of [0, 6, 3.5, '5', null, -1]) {
      const kept = cleanRating({ stars, thing: 'game' });
      if (stars === '5') expect(kept?.stars).toBe(5);
      else expect(kept, String(stars)).toBeNull();
    }
  });

  it('refuses a thing that is not one, and a ref that is not one', () => {
    expect(cleanRating({ stars: 5, thing: 'cheats' })).toBeNull();
    expect(cleanRating({ stars: 5, thing: 'game', ref: '<script>' })?.ref).toBe('');
    expect(cleanRating({ stars: 5, thing: 'game', moment: 'sometime' })?.moment).toBe('form');
    expect(cleanRating('five')).toBeNull();
  });

  it('meets a low mark quietly and a five with a six', () => {
    expect([1, 2, 3, 4, 5].map(tierOf)).toEqual(['low', 'low', 'mid', 'high', 'top']);
  });
});

describe('what follows a rating', () => {
  const ids = (list: readonly { id: string }[]) => list.map(question => question.id);

  it('asks a low mark what went wrong, a three what would make it five, a high one what next', () => {
    expect(ids(followUpFor('game', 1))).toContain('wrong');
    expect(ids(followUpFor('game', 3))).toContain('five');
    expect(ids(followUpFor('game', 5))).toContain('build');
    expect(ids(followUpFor('game', 5))).not.toContain('wrong');
  });

  it('asks about the thing rated and nothing else', () => {
    expect(ids(followUpFor('marathon', 4))).toEqual(expect.arrayContaining(['mlength', 'mbest']));
    expect(ids(followUpFor('marathon', 4))).not.toContain('rfair');
    expect(ids(followUpFor('rivals', 2))).toEqual(expect.arrayContaining(['rfair', 'rinvite']));
    expect(ids(followUpFor('survive', 3))).toEqual(expect.arrayContaining(['sblows', 'slength']));
  });

  it('stays short: a reason and a couple about the thing, never the questionnaire', () => {
    for (const thing of ['game', 'classic', 'survive', 'marathon', 'rivals'] as const) {
      for (let stars = 1; stars <= 5; stars++) {
        const asked = followUpFor(thing, stars);
        expect(asked.length, `${thing} ${stars}`).toBeGreaterThanOrEqual(1);
        expect(asked.length, `${thing} ${stars}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('never leaks onto the questionnaire', () => {
    const follow = new Set(ids(FOLLOW_UPS));
    for (const standalone of [true, false]) {
      for (const played of [true, false]) {
        for (const question of questionsFor({ standalone, played, touch: false })) expect(follow.has(question.id)).toBe(false);
      }
    }
  });

  it('shares no id with the questionnaire, since both are columns of one sheet', () => {
    const asked = new Set(ids(QUESTIONS));
    for (const question of FOLLOW_UPS) {
      expect(asked.has(question.id), question.id).toBe(false);
      expect(question.id).toMatch(/^[a-z]+$/);
      for (const choice of question.choices) expect(choice.id).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('keeps a follow-up answer through the same cleaning the endpoint runs', () => {
    expect(cleanAnswers({ mlength: 'long', mbest: ['focus', 'side', 'card'], wrong: ['nonsense'] }))
      .toEqual({ mlength: ['long'], mbest: ['focus', 'side'] });
  });
});
