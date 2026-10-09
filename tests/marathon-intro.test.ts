import { describe, expect, it } from 'vitest';
import { INTRO_SHOWINGS, INTRO_STEPS, introCardMarkup, introDue, introKeysMarkup } from '../src/ui/MarathonIntro';
import { SHOTS_STEP } from '../src/ui/ShotsIntro';

describe('the Marathon’s rules, the first time', () => {
  it('open with how to hit, then four rules, two of them pointing at what they are about', () => {
    expect(INTRO_STEPS.map(step => step.title)).toEqual(['Swipe to hit', 'Three batters', 'Focus to settle', 'The pitch wears', 'Every innings counts']);
    expect(INTRO_STEPS[0]).toBe(SHOTS_STEP);
    expect(INTRO_STEPS.map(step => step.spot ?? null)).toEqual([null, null, 'settle', null, 'pause']);
  });

  it('say every innings goes on the board, and declaring is a choice rather than a step', () => {
    const last = INTRO_STEPS[INTRO_STEPS.length - 1];
    expect(last.line).toMatch(/all out or declared/i);
    expect(`${last.title} ${last.line}`).not.toMatch(/then register|declare, then/i);
  });

  it('never tell a player there are five hundred balls', () => {
    for (const step of INTRO_STEPS) expect(`${step.title} ${step.line}`).not.toMatch(/500|five hundred/i);
  });

  it('say Next and Skip, and Let’s bat with no skip on the last', () => {
    expect(introKeysMarkup(0, 4)).toContain('>Next<');
    expect(introKeysMarkup(0, 4)).toMatch(/id="mi-skip" class="mi-skip" type="button">Skip</);
    const last = introKeysMarkup(3, 4);
    expect(last).toContain(">Let's bat<");
    expect(last).toContain('id="mi-skip" class="mi-skip" type="button" hidden>');
    expect(last.match(/class="is-on"/g)).toHaveLength(1);
  });

  it('draw the swipes for the batter who is in', () => {
    expect(introCardMarkup(SHOTS_STEP)).toContain('hb-compass');
    expect(introCardMarkup(SHOTS_STEP, true)).not.toBe(introCardMarkup(SHOTS_STEP));
  });

  it('put no dots under a card on its own', () => {
    expect(introKeysMarkup(0, 1)).toContain('class="mi-dots" aria-hidden="true" hidden');
    expect(introKeysMarkup(0, 4)).not.toContain('aria-hidden="true" hidden');
  });

  it('are shown twice at most, never once skipped, and not at all where nothing can be remembered', () => {
    expect(introDue(() => null)).toBe(true);
    expect(introDue(() => '1')).toBe(true);
    expect(introDue(() => String(INTRO_SHOWINGS))).toBe(false);
    expect(introDue(() => 'done')).toBe(false);
    expect(introDue(() => { throw new Error('blocked'); })).toBe(false);
  });
});
