import { describe, expect, it } from 'vitest';
import { activityMarkup, activitySheetMarkup, agoOf, eventTitle, headline, winnable } from '../src/ui/Activity';
import type { OwnActivity } from '../src/game/profile-api';

const NOW = Date.UTC(2026, 9, 18, 12);
const HOUR = 3_600_000;
type Event = OwnActivity['events'][number];
const event = (over: Partial<Event>): Event => ({
  kind: 'beat', handle: '0123456789abcdef', name: 'Kabir', avatar: 1, mode: 'classic', runs: 196, target: 187, place: 5, at: NOW - HOUR, ...over,
});

describe('what the profile collected', () => {
  it('says each thing in a line', () => {
    expect(eventTitle(event({}))).toBe('Kabir beat your 187 with 196');
    expect(eventTitle(event({ kind: 'short', name: 'Meera', runs: 181 }))).toBe('Meera chased your 187');
    expect(eventTitle(event({ kind: 'passed', name: 'Arjun' }))).toBe('Arjun passed you');
  });

  it('offers WIN IT BACK on what was taken and not yet answered', () => {
    expect(winnable(event({}))).toBe(true);
    expect(winnable(event({ kind: 'passed' }))).toBe(true);
    expect(winnable(event({ kind: 'short' }))).toBe(false);
    expect(winnable(event({ wonBack: true }))).toBe(false);
  });

  it('leads with the newest thing taken, and nothing when all is answered', () => {
    const activity: OwnActivity = { views: 14, bio: null, events: [event({ kind: 'short' }), event({ name: 'Zoya' }), event({ name: 'Tara' })] };
    expect(headline(activity)?.name).toBe('Zoya');
    expect(headline({ ...activity, events: [event({ wonBack: true })] })).toBeNull();
  });

  it('counts the time as a row says it', () => {
    expect(agoOf(NOW - 10_000, NOW)).toBe('now');
    expect(agoOf(NOW - 5 * 60_000, NOW)).toBe('5m');
    expect(agoOf(NOW - HOUR, NOW)).toBe('1h');
    expect(agoOf(NOW - 3 * 24 * HOUR, NOW)).toBe('3d');
  });
});

describe('the headline and the quiet line', () => {
  it('puts the beat first, with the place and how many more', () => {
    const html = activityMarkup({ views: 14, bio: null, events: [event({}), event({ kind: 'short', at: NOW - 2 * HOUR })] }, NOW);
    expect(html).toContain('is-taken');
    expect(html).toContain('Kabir beat your 187');
    expect(html).toContain('You’re #5 now · and 1 more this week');
  });

  it('says who looked and chased when nothing was taken', () => {
    const html = activityMarkup({ views: 14, bio: null, events: [event({ kind: 'short' })] }, NOW);
    expect(html).toContain('is-quiet');
    expect(html).toContain('14 looked at you · 1 chased');
    expect(html).toContain('nothing taken from you');
  });

  it('is nothing at all for a profile nobody has touched', () => {
    expect(activityMarkup({ views: 0, bio: null, events: [] }, NOW)).toBe('');
    expect(activityMarkup(null, NOW)).toBe('');
  });
});

describe('the Your profile sheet', () => {
  it('groups by day, keeps who looked private, and asks for a bio where there is none', () => {
    const html = activitySheetMarkup({ views: 14, bio: null, events: [event({}), event({ kind: 'passed', at: NOW - 2 * 24 * HOUR, wonBack: true })] }, NOW);
    expect(html).toContain('TODAY');
    expect(html).toContain('THIS WEEK');
    expect(html).toContain('Who looked stays private');
    expect(html).toContain('WIN IT BACK');
    expect(html).toContain('You won it back');
    expect(html).toContain('id="activity-bio"');
    expect(activitySheetMarkup({ views: 1, bio: 'Six or nothing.', events: [] }, NOW)).not.toContain('id="activity-bio"');
  });

  it('writes a name in as text and never as markup', () => {
    const html = activitySheetMarkup({ views: 0, bio: null, events: [event({ name: '<img src=x>' })] }, NOW);
    expect(html).not.toContain('<img src=x>');
  });
});
