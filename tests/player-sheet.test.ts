import { describe, expect, it } from 'vitest';
import { emptyBlast } from '../src/game/career';
import type { ProfilePayload } from '../src/game/profile-api';
import { chaseLabel, chaseShort, chaseTarget, playedMode, playerFootMarkup, playerSheetMarkup, playerTab, playerTabs, type PlayerSheetView } from '../src/ui/PlayerSheet';
import { EMPTY_KNOCKOUT_CAREER, type KnockoutStanding } from '../src/server/knockout-ledger';

const none = { career: null, granted: null, best: null, bestRank: null };
const profile = (over: Partial<ProfilePayload['modes']> = {}): ProfilePayload => ({
  handle: '0123456789abcdef', name: 'Kabir', avatar: 1, bio: 'Leg-side bully.', lastAt: null,
  modes: {
    classic: { career: { ...emptyBlast(), innings: 64, runs: 6210, highest: 187 }, granted: null, best: { runs: 187, place: 4, total: 900 }, bestRank: 3 },
    survive: none, marathon: none, super10: none, ...over,
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

  it('has a short form without the name, for a name too long for the key', () => {
    expect(chaseShort(1187)).toBe('CHASE THEIR 1,187');
    expect(playerSheetMarkup(view())).toMatch(/id="player-chase"[^]*data-short="CHASE THEIR /);
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

describe('the Test Marathon', () => {
  it('offers its second target under the six: their best batter, not out marked', () => {
    const marathon = { career: null, granted: null, best: { runs: 312, place: 11, total: 90 }, bestRank: 7, solo: { runs: 141, out: false, place: 4 } };
    const html = playerSheetMarkup(view({ mode: 'marathon', profile: profile({ marathon }) }));
    expect(html).toContain('id="player-chase-solo"');
    expect(html).toContain('or chase the best batter, 141*');
    expect(html).toContain('CHASE KABIR’S 312');
    expect(playerSheetMarkup(view())).not.toContain('player-chase-solo');
  });
});

describe('Test Survival', () => {
  it('keys the chase to their result, and offers none until the profile has said it', () => {
    const survive = { career: null, granted: null, best: { runs: 30, place: 3, total: 20, result: { kind: 'lost' as const, balls: 40, runs: 30 } }, bestRank: 3 };
    const html = playerSheetMarkup(view({ mode: 'survive', profile: profile({ survive }) }));
    expect(html).toContain('OUTLAST KABIR');
    expect(html).not.toContain('CHASE KABIR');
    expect(chaseTarget(view({ mode: 'survive', state: 'loading', profile: null, seed: { ...seed, mode: 'survive' } }))).toBeNull();
  });
});

describe('playedMode', () => {
  it('opens on the board\u2019s mode, or the first they have batted', () => {
    expect(playedMode(profile(), { mode: 'classic', modes: ['classic', 'marathon', 'survive'] })).toBe('classic');
    expect(playedMode(profile(), { mode: 'survive', modes: ['classic', 'marathon', 'survive'] })).toBe('classic');
  });
});

describe('Super Knockout on another player’s profile', () => {
  const places = { points: { week: 1, all: 4 }, wins: { week: 2, all: 3 }, best: 6, rate: null };
  const standing: KnockoutStanding = {
    ok: true, week: '2026-11-16', behind: null, pointsFrom: 3, places,
    career: { ...EMPTY_KNOCKOUT_CAREER, played: 112, wins: 31, top3: 48, places: 336, best: 118, bestPlace: 1, points: 900, last: [1, 4], week: '2026-11-16', weekPoints: 128, weekWins: 9, weekPlayed: 20 },
  };
  const ko = (over: Partial<NonNullable<PlayerSheetView['knockout']>> = {}) => ({ standing, state: 'ready' as const, invite: true, ...over });

  it('is one more tab on the switch where it is offered, the last, and none where it is not', () => {
    expect(playerTabs(view())).toEqual(['classic', 'marathon', 'survive']);
    expect(playerTabs(view({ knockout: ko() }))).toEqual(['classic', 'marathon', 'survive', 'knockout']);
    expect(playerSheetMarkup(view())).not.toContain('data-mode="knockout"');
    const offered = playerSheetMarkup(view({ knockout: ko() }));
    expect(offered).toMatch(/class="ps-tab is-on"[^>]*data-mode="classic"/);
    expect(offered).toMatch(/class="ps-tab"[^>]*data-mode="knockout"/);
    // The career on show is still the one drawn.
    expect(offered).toContain('id="player-chase"');
    expect(playerTab(view({ knockout: ko() }))).toBe('classic');
    expect(playerTab(view({ knockout: ko(), onKnockout: true }))).toBe('knockout');
    // Asked for where it is not offered, the career stands.
    expect(playerTab(view({ onKnockout: true }))).toBe('classic');
  });

  it('says how many they have won, the week at a glance and six figures, with nothing to chase', () => {
    const sheet = playerSheetMarkup(view({ knockout: ko(), onKnockout: true }));
    expect(sheet).toMatch(/class="ps-sheet tier-none is-knockout is-ready"/);
    expect(sheet).toMatch(/class="ps-tab is-on"[^>]*data-mode="knockout"/);
    expect(sheet).toContain('31 wins in 112 matches');
    expect(sheet).toMatch(/<b>128<\/b><span>points this week<\/span>/);
    expect(sheet).toMatch(/class="ps-glance-one is-place"><b>#1<\/b><span>Super Knockout<\/span>/);
    expect(sheet).toMatch(/<b>9<\/b><span>wins this week<\/span>/);
    for (const [label, value] of [['Matches', '112'], ['Wins', '31'], ['Top 3', '48'], ['Highest total', '118'], ['Average finish', '3rd'], ['Best rank', '#1']]) {
      expect(sheet).toContain(`<b>${value}</b><span>${label}</span>`);
    }
    expect(sheet).not.toContain('id="player-chase"');
    expect(sheet).toContain('id="player-invite"');
    expect(sheet).toContain('INVITE TO A MATCH');
    expect(sheet).toContain('“Leg-side bully.”');
  });

  it('waits on bones, says so of a player with no match, and of a store out of reach', () => {
    const loading = playerSheetMarkup(view({ knockout: ko({ standing: null, state: 'loading' }), onKnockout: true }));
    expect((loading.match(/ps-tile is-bone/g) ?? []).length).toBe(6);
    const none = playerSheetMarkup(view({ knockout: ko({ standing: { ...standing, career: null } }), onKnockout: true }));
    expect(none).toContain('No Super Knockout matches yet');
    expect(none).toContain('No matches yet');
    const offline = playerSheetMarkup(view({ knockout: ko({ standing: null, state: 'offline' }), onKnockout: true }));
    expect(offline).toContain('Couldn’t load Kabir’s matches');
  });

  it('offers no invite where matches cannot be hosted from here, and keeps CHALLENGE where there is one', () => {
    const sheet = playerSheetMarkup(view({ knockout: ko({ invite: false }), onKnockout: true, challenge: { foot: { kind: 'challenge' } } }));
    expect(sheet).not.toContain('id="player-invite"');
    expect(sheet).toContain('id="player-challenge"');
    expect(playerFootMarkup(view({ knockout: ko(), onKnockout: true, challenge: { foot: { kind: 'challenge' } } }))).toMatch(/ps-keys is-two[^]*id="player-challenge"[^]*id="player-invite"/);
  });
});
