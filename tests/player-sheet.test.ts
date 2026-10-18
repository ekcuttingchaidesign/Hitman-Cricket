import { describe, expect, it } from 'vitest';
import { emptyBlast } from '../src/game/career';
import type { ProfilePayload } from '../src/game/profile-api';
import { chaseLabel, chaseTarget, playedMode, playerSheetMarkup, type PlayerSheetView } from '../src/ui/PlayerSheet';

const none = { career: null, granted: null, best: null, bestRank: null };
const profile = (over: Partial<ProfilePayload['modes']> = {}): ProfilePayload => ({
  handle: '0123456789abcdef', name: 'Kabir', avatar: 1, bio: 'Leg-side bully.', lastAt: null,
  modes: {
    classic: { career: { ...emptyBlast(), innings: 64, runs: 6210, highest: 187 }, granted: null, best: { runs: 187, place: 4, total: 900 }, bestRank: 3 },
    survive: none, marathon: none, ...over,
  },
});
const seed = { handle: '0123456789abcdef', name: 'Kabir', avatar: 1, mode: 'classic' as const, place: 4, best: 180 };
const view = (over: Partial<PlayerSheetView> = {}): PlayerSheetView =>
  ({ seed, mode: 'classic', modes: ['classic', 'marathon', 'survive'], state: 'ready', profile: profile(), ...over });

describe('the chase', () => {
  it('aims at the best on the profile once it is in, and at the row before', () => {
    expect(chaseTarget(view())).toBe(187);
    expect(chaseTarget(view({ state: 'loading', profile: null }))).toBe(180);
    expect(chaseTarget(view({ state: 'offline', profile: null }))).toBe(180);
  });

  it('has nothing to aim at in a mode never batted, or a mode the row was not on', () => {
    expect(chaseTarget(view({ mode: 'survive' }))).toBeNull();
    expect(chaseTarget(view({ state: 'loading', profile: null, mode: 'marathon' }))).toBeNull();
  });

  it('names them and the figure', () => {
    expect(chaseLabel('Kabir', 1187)).toBe('CHASE KABIR\u2019S 1,187');
  });
});

describe('playerSheetMarkup', () => {
  it('draws the rung, their line, the place and the key', () => {
    const html = playerSheetMarkup(view());
    expect(html).toContain('tier-star');
    expect(html).toContain('Leg-side bully.');
    expect(html).toContain('#4');
    expect(html).toContain('id="player-chase"');
  });

  it('says a mode is empty and offers no chase there', () => {
    const html = playerSheetMarkup(view({ mode: 'survive' }));
    expect(html).toContain('No Survival innings yet');
    expect(html).not.toContain('id="player-chase"');
  });

  it('keeps the chase when the store cannot be reached, and says so', () => {
    const html = playerSheetMarkup(view({ state: 'offline', profile: null }));
    expect(html).toContain('id="player-retry"');
    expect(html).toContain('The chase still works');
    expect(html).toContain('id="player-chase"');
  });

  it('escapes what a player wrote', () => {
    const html = playerSheetMarkup(view({ profile: { ...profile(), bio: '<img src=x onerror=alert(1)>' } }));
    expect(html).not.toContain('<img src=x');
  });
});

describe('playedMode', () => {
  it('opens on the board\u2019s mode, or the first they have batted', () => {
    expect(playedMode(profile(), { mode: 'classic', modes: ['classic', 'marathon', 'survive'] })).toBe('classic');
    expect(playedMode(profile(), { mode: 'survive', modes: ['classic', 'marathon', 'survive'] })).toBe('classic');
  });
});
