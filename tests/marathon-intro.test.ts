import { describe, expect, it } from 'vitest';
import { INTRO_SHOWINGS, INTRO_STEPS, introCardMarkup, introDue, introKeysMarkup, introStageMarkup } from '../src/ui/MarathonIntro';
import { SHOTS_STEP } from '../src/ui/ShotsIntro';

describe('the Marathon’s rules, the first time', () => {
  it('open with how to hit, then four rules, two of them pointing at what they are about', () => {
    expect(INTRO_STEPS.map(step => step.title)).toEqual(['Swipe to hit', 'Three batters', 'Focus to settle', 'The pitch wears', 'Every innings counts']);
    expect(INTRO_STEPS[0]).toBe(SHOTS_STEP);
    expect(INTRO_STEPS.map(step => step.spot ?? null)).toEqual([null, 'wickets', 'settle', null, 'pause']);
    expect(INTRO_STEPS.map(step => step.tag ?? null)).toEqual([null, 'Wickets left', 'Focus meter', null, 'Pause']);
    expect(INTRO_STEPS[3].pitch).toBe(true);
  });

  it('say every innings goes on the board, and declaring is a choice rather than a step', () => {
    const last = INTRO_STEPS[INTRO_STEPS.length - 1];
    expect(last.line).toMatch(/all out or declared/i);
    expect(`${last.title} ${last.line}`).not.toMatch(/then register|declare, then/i);
  });

  it('never tell a player there are five hundred balls', () => {
    for (const step of INTRO_STEPS) expect(`${step.title} ${step.line}`).not.toMatch(/500|five hundred/i);
  });

  it('say Skip and NEXT, and Back and LET’S BAT on the last', () => {
    const first = introKeysMarkup(0, 5);
    expect(first).toContain('>NEXT<');
    expect(first).toMatch(/id="mi-skip" class="mi-skip" type="button">Skip</);
    expect(first).not.toContain('mi-back');
    const last = introKeysMarkup(4, 5);
    expect(last).toContain('>LET’S BAT<');
    expect(last).toMatch(/id="mi-back" class="mi-skip" type="button">Back</);
    expect(last).not.toContain('id="mi-skip"');
  });

  it('have nothing to go back to on a card of their own', () => {
    expect(introKeysMarkup(0, 1)).toContain('id="mi-back" class="mi-skip" type="button" hidden>');
  });

  it('end on the two ways on when opened from the cover', () => {
    const last = introKeysMarkup(1, 2, true);
    expect(last).toContain('id="mi-modes"');
    expect(last).toMatch(/id="mi-next"[^>]*><span class="k-cta-face">(<[^>]+>)*PLAY NOW/);
  });

  it('name the game, and say where the player is in the cards', () => {
    const card = introCardMarkup(INTRO_STEPS[2], 2, 5, { name: 'Test Marathon', tone: 'marathon' });
    expect(card).toContain('>Test Marathon<');
    expect(card.match(/class="is-done"/g)).toHaveLength(2);
    expect(card.match(/class="is-on"/g)).toHaveLength(1);
    expect(introCardMarkup(INTRO_STEPS[0], 0, 1, { name: 'Test Survival', tone: 'survival' })).toContain('class="mi-dots" aria-hidden="true" hidden');
  });

  it('draw the swipes for the batter who is in, and the pitch where it wears', () => {
    expect(introStageMarkup(SHOTS_STEP)).toContain('hb-fan');
    expect(introStageMarkup(SHOTS_STEP, true)).not.toBe(introStageMarkup(SHOTS_STEP));
    expect(introStageMarkup(INTRO_STEPS[3])).toContain('mi-pitch');
    expect(introStageMarkup(INTRO_STEPS[1])).toBe('');
  });

  it('are shown twice at most, never once skipped, and not at all where nothing can be remembered', () => {
    expect(introDue(() => null)).toBe(true);
    expect(introDue(() => '1')).toBe(true);
    expect(introDue(() => String(INTRO_SHOWINGS))).toBe(false);
    expect(introDue(() => 'done')).toBe(false);
    expect(introDue(() => { throw new Error('blocked'); })).toBe(false);
  });
});
