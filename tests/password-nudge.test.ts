import { describe, expect, it } from 'vitest';
import { NUDGE_RUNS, endCardDue, sheetDue, statsCardDue, type NudgeContext } from '../src/game/password-nudge';
import { entryProblem, insideAnApp, passwordCardMarkup, passwordSheetMarkup, ruleStates } from '../src/ui/Password';
import { QUESTIONS, isQuestion } from '../src/game/password-questions';

const named: NudgeContext = { named: true, canRegister: true, practice: false, rival: false, demo: false, state: 'none', runs: 312 };

describe('when a player is asked for a password', () => {
  it('is on My Stats from the first visit, for anybody with a name and none', () => {
    expect(statsCardDue(named)).toBe(true);
    expect(statsCardDue({ ...named, named: false })).toBe(false);
    expect(statsCardDue({ ...named, state: 'set' })).toBe(false);
  });

  /** An outage is not a no: a card offered then would go to players who have one. */
  it('asks nothing while the store has not answered', () => {
    expect(statsCardDue({ ...named, state: 'unknown' })).toBe(false);
    expect(endCardDue({ ...named, state: 'unknown' })).toBe(false);
  });

  it('is on the end card only once the career passes 50 runs', () => {
    expect(endCardDue({ ...named, runs: NUDGE_RUNS - 1 })).toBe(false);
    expect(endCardDue({ ...named, runs: NUDGE_RUNS })).toBe(true);
  });

  it('is never on a practice, Rival Match or demo card, nor in a private window', () => {
    for (const k of ['practice', 'rival', 'demo'] as const) expect(endCardDue({ ...named, [k]: true }), k).toBe(false);
    expect(endCardDue({ ...named, canRegister: false })).toBe(false);
  });

  it('asks outright after three end cards walked past, then every five, once a visit', () => {
    const due = Array.from({ length: 20 }, (_, n) => n).filter(n => sheetDue(n, false));
    expect(due).toEqual([3, 8, 13, 18]);
    expect(sheetDue(3, true)).toBe(false);
  });
});

describe('the Set a password sheet', () => {
  it('checks the rules as they are typed, quiet until there is something to judge', () => {
    expect(ruleStates('', '', 'Shashank')).toEqual({ long: 'wait', hard: 'wait', same: 'wait' });
    expect(ruleStates('123456', '', 'Shashank')).toMatchObject({ long: 'met', hard: 'bad' });
    expect(ruleStates('Shashank', 'Shashank', 'Shashank')).toMatchObject({ hard: 'bad', same: 'met' });
    expect(ruleStates('Shashank123', 'Shashank12', 'Shashank')).toEqual({ long: 'met', hard: 'met', same: 'bad' });
    expect(ruleStates('Shashank123', 'Shashank123', 'Shashank')).toEqual({ long: 'met', hard: 'met', same: 'met' });
  });

  it('says what is wrong in one line before anything is sent', () => {
    const entry = { password: 'Shashank123', confirm: 'Shashank123', question: null, answer: '' };
    expect(entryProblem(entry, 'Shashank', 'set')).toBeNull();
    expect(entryProblem({ ...entry, password: 'abcdef', confirm: 'abcdef' }, 'Shashank', 'set')).toContain('easy');
    expect(entryProblem({ ...entry, confirm: 'nope' }, 'Shashank', 'set')).toContain('match');
    expect(entryProblem({ ...entry, question: 2 }, 'Shashank', 'set')).toContain('Answer');
  });

  it('keeps a blank password and a kept answer when changing', () => {
    const blank = { password: '', confirm: '', question: 1, answer: '' };
    expect(entryProblem(blank, 'Shashank', 'change', true)).toBeNull();
    expect(entryProblem({ ...blank, question: null }, 'Shashank', 'change')).toContain('Nothing');
  });

  /** What lets Safari and Chrome offer to save it, and fill it in on the restore sheet. */
  it('is a username and a new password to the phone', () => {
    const html = passwordSheetMarkup({ mode: 'set', name: 'Shashank', avatar: 0, question: null });
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('value="Shashank"');
    expect(html.match(/autocomplete="new-password"/g)).toHaveLength(2);
  });

  it('asks no question when it is replacing a forgotten password', () => {
    expect(passwordSheetMarkup({ mode: 'recover', name: 'Gaurav Rana', avatar: 0, question: null })).not.toContain('pw-question');
  });
});

describe('the card that asks', () => {
  it('names what is at stake, on My Stats and on the end card', () => {
    expect(passwordCardMarkup({ place: 'stats', runs: 0 })).toContain('KEEP THIS CAREER SAFE');
    expect(passwordCardMarkup({ place: 'stats', runs: 2140 })).toContain('PROTECT YOUR 2,140 RUNS');
    expect(passwordCardMarkup({ place: 'end', runs: 312 })).toContain('312 RUNS. DON’T LOSE THEM.');
    expect(passwordCardMarkup({ place: 'end', runs: 312, best: 61 })).toContain('YOUR BEST EVER, 61');
  });

  /** Never mistaken for PLAY AGAIN beside it. */
  it('wears the solid orange key on the end card', () => {
    expect(passwordCardMarkup({ place: 'end', runs: 312 })).toContain('k-cta--solid');
    expect(passwordCardMarkup({ place: 'stats', runs: 312 })).toContain('k-cta--primary');
  });
});

describe('the security questions', () => {
  it('are eight, picked by place', () => {
    expect(QUESTIONS).toHaveLength(8);
    expect(isQuestion(0)).toBe(true);
    expect(isQuestion(8)).toBe(false);
    expect(isQuestion('1')).toBe(false);
  });

  it('leave out what half the country would answer the same way', () => {
    for (const q of QUESTIONS) expect(q, q).not.toMatch(/favourite|cricketer|team|IPL|maiden|born/i);
  });
});

describe('inside another app', () => {
  it('knows the in-app browsers that cannot reach saved passwords', () => {
    expect(insideAnApp('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true);
    expect(insideAnApp('Mozilla/5.0 (Linux; Android 14) [FBAN/FB4A;FBAV/450.0]')).toBe(true);
    expect(insideAnApp('Mozilla/5.0 (iPhone) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
  });
});
