import { describe, expect, it } from 'vitest';
import { INTRO_SHOWINGS, INTRO_STEPS, introDue, introKeysMarkup } from '../src/ui/MarathonIntro';

describe('the Marathon’s rules, the first time', () => {
  it('are four cards, two of them pointing at what they are about', () => {
    expect(INTRO_STEPS.map(step => step.title)).toEqual(['Three batters', 'Focus to settle', 'The pitch wears', 'Declare, then register']);
    expect(INTRO_STEPS.map(step => step.spot ?? null)).toEqual([null, 'settle', null, 'pause']);
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

  it('are shown twice at most, never once skipped, and not at all where nothing can be remembered', () => {
    expect(introDue(() => null)).toBe(true);
    expect(introDue(() => '1')).toBe(true);
    expect(introDue(() => String(INTRO_SHOWINGS))).toBe(false);
    expect(introDue(() => 'done')).toBe(false);
    expect(introDue(() => { throw new Error('blocked'); })).toBe(false);
  });
});
