import { describe, expect, it } from 'vitest';
import {
  PLAYED, QUESTIONS, SUGGESTION_MAX, answered, askOf, cleanAnswers, cleanContext, cleanSuggestion,
  feedbackRoute, playedFrom, questionsFor,
} from '../src/game/feedback';

/**
 * The questionnaire's own rules, which are the ones both ends of the wire run.
 * The form draws itself from this list and the endpoint validates against it, so
 * a question that cannot survive `cleanAnswers` is a column of blanks in a
 * spreadsheet weeks later and nothing else says so.
 */
describe('the questions', () => {
  it('has no two questions or choices under one id', () => {
    const ids = QUESTIONS.map(question => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const question of QUESTIONS) {
      const choices = question.choices.map(choice => choice.id);
      expect(new Set(choices).size, `duplicate choice in ${question.id}`).toBe(choices.length);
    }
  });

  it('keeps every id spreadsheet-safe, since they are column headings', () => {
    for (const question of QUESTIONS) {
      expect(question.id).toMatch(/^[a-z]+$/);
      for (const choice of question.choices) expect(choice.id).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('asks a thumb about swipes and a keyboard about keys', () => {
    const controls = QUESTIONS.find(question => question.id === 'controls')!;
    expect(askOf(controls, true)).toContain('swipes');
    expect(askOf(controls, false)).toContain('keys');
    // Everything else is asked the same way on both, and must not quietly
    // acquire a second wording nobody maintains.
    for (const question of QUESTIONS) {
      if (question.id !== 'controls') expect(askOf(question, true)).toBe(question.ask);
    }
  });
});

describe('who gets asked what', () => {
  const ids = (list: { id: string }[]) => list.map(question => question.id);

  it('never puts the gate to somebody already batting', () => {
    const asked = questionsFor({ standalone: false, played: true, touch: true });
    expect(ids(asked)).not.toContain(PLAYED);
    expect(ids(asked)).not.toContain('source');
    expect(ids(asked)).toContain('fun');
  });

  it('asks the link nothing but the gate until it is answered', () => {
    expect(ids(questionsFor({ standalone: true, played: null, touch: true }))).toEqual([PLAYED]);
  });

  it('branches on the gate: a player is asked about the batting, a friend is not', () => {
    const player = ids(questionsFor({ standalone: true, played: true, touch: true }));
    const friend = ids(questionsFor({ standalone: true, played: false, touch: true }));
    expect(player).toContain('shot');
    expect(player).not.toContain('tempt');
    // Somebody who has never faced a ball cannot say which shot felt best, and
    // asking them fills the answers with noise rather than leaving a blank.
    expect(friend).not.toContain('shot');
    expect(friend).toContain('tempt');
    // Both are asked where they came from: that is the link's own question.
    expect(friend).toContain('source');
  });

  it('counts an innings opened and left as having played', () => {
    expect(playedFrom('innings')).toBe(true);
    expect(playedFrom('opened')).toBe(true);
    expect(playedFrom('no')).toBe(false);
    expect(playedFrom(undefined)).toBe(false);
  });

  it('keeps every form short enough to finish', () => {
    for (const played of [true, false]) {
      const asked = questionsFor({ standalone: true, played, touch: true });
      // Plus the words box. A questionnaire past a dozen screens is one people
      // leave halfway, and the answers from the ones who stayed are worth less
      // than the ones who left.
      expect(asked.length).toBeLessThanOrEqual(11);
    }
  });
});

describe('answers arriving from anywhere', () => {
  it('keeps what was offered and drops what was not', () => {
    expect(cleanAnswers({ fun: ['4'], nonsense: ['x'], shot: ['trebuchet'] })).toEqual({ fun: ['4'] });
  });

  it('takes a bare string as one answer', () => {
    expect(cleanAnswers({ fun: '4' })).toEqual({ fun: ['4'] });
  });

  it('holds a single-answer question to one, and the shortlist to two', () => {
    expect(cleanAnswers({ fun: ['4', '5'] })).toEqual({ fun: ['4'] });
    expect(cleanAnswers({ next: ['overs', 'bowl', 'shots'] })).toEqual({ next: ['overs', 'bowl'] });
  });

  it('drops duplicates rather than counting the same tap twice', () => {
    expect(cleanAnswers({ next: ['overs', 'overs'] })).toEqual({ next: ['overs'] });
  });

  it('answers nothing to nothing', () => {
    expect(cleanAnswers(null)).toEqual({});
    expect(cleanAnswers('everything')).toEqual({});
    expect(cleanAnswers({ fun: [] })).toEqual({});
  });
});

describe('the one thing anybody types', () => {
  it('cuts it to the length the box allows', () => {
    expect(cleanSuggestion('x'.repeat(400))).toHaveLength(SUGGESTION_MAX);
  });

  it('collapses the invisible marks that turn a spreadsheet row around', () => {
    expect(cleanSuggestion('more‮overs')).toBe('more overs');
    expect(cleanSuggestion(' too   hard \n really ')).toBe('too hard really');
  });

  it('is nothing at all when it is not a string', () => {
    expect(cleanSuggestion(42)).toBe('');
    expect(cleanSuggestion(null)).toBe('');
  });
});

describe('what rides along', () => {
  it('takes the figures and leaves everything else', () => {
    expect(cleanContext({ mode: 'survive', runs: 42, device: 'touch', secret: 'no' }))
      .toEqual({ mode: 'survive', runs: 42, device: 'touch' });
  });

  it('leaves a missing figure out rather than storing it as a duck', () => {
    const context = cleanContext({ runs: undefined, balls: 'lots', best: 12 });
    expect(context.runs).toBeUndefined();
    expect(context.balls).toBeUndefined();
    expect(context.best).toBe(12);
  });

  it('refuses a mode nobody can play', () => {
    expect(cleanContext({ mode: 'golf' }).mode).toBeUndefined();
  });
});

describe('whether anything was said', () => {
  it('is false for an empty form and true for one tap', () => {
    expect(answered({}, '')).toBe(false);
    expect(answered({ fun: ['3'] }, '')).toBe(true);
    expect(answered({}, 'more overs')).toBe(true);
  });
});

describe('the link', () => {
  it('reads both spellings of the route', () => {
    expect(feedbackRoute({ pathname: '/feedback', search: '' })).toBe(true);
    expect(feedbackRoute({ pathname: '/feedback/', search: '' })).toBe(true);
    expect(feedbackRoute({ pathname: '/', search: '?feedback=1' })).toBe(true);
    expect(feedbackRoute({ pathname: '/', search: '' })).toBe(false);
    // A seed or a mode is the game, not the form.
    expect(feedbackRoute({ pathname: '/', search: '?mode=survive' })).toBe(false);
  });
});
