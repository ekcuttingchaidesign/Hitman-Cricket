import { describe, expect, it } from 'vitest';
import { activityMarkup, activitySheetMarkup, agoOf, droppedBy, eventTitle, headline, rankLine, takenLine, winnable } from '../src/ui/Activity';
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
    expect(headline(activity, NOW, {})?.name).toBe('Zoya');
    expect(headline({ ...activity, events: [event({ wonBack: true })] }, NOW, {})).toBeNull();
  });

  it('stands two days at most', () => {
    const activity: OwnActivity = { views: 0, bio: null, events: [event({ at: NOW - 47 * HOUR })] };
    expect(headline(activity, NOW, {})).not.toBeNull();
    expect(headline(activity, NOW + 2 * HOUR, {})).toBeNull();
    expect(activityMarkup(activity, NOW + 2 * HOUR, {})).not.toContain('Rank down');
  });

  it('comes down once WIN IT BACK is played, won or not, and only for that player and mode', () => {
    const activity: OwnActivity = { views: 0, bio: null, events: [event({})] };
    const key = `${event({}).handle}:classic`;
    expect(headline(activity, NOW, { [key]: NOW - 30 * 60_000 })).toBeNull();
    expect(headline(activity, NOW, { [key]: NOW - 2 * HOUR })?.name).toBe('Kabir');
    expect(headline(activity, NOW, { [`${event({}).handle}:marathon`]: NOW })?.name).toBe('Kabir');
    expect(headline(activity, NOW, { [`fedcba9876543210:classic`]: NOW })?.name).toBe('Kabir');
  });

  it('counts the time as a row says it', () => {
    expect(agoOf(NOW - 10_000, NOW)).toBe('now');
    expect(agoOf(NOW - 5 * 60_000, NOW)).toBe('5m');
    expect(agoOf(NOW - HOUR, NOW)).toBe('1h');
    expect(agoOf(NOW - 3 * 24 * HOUR, NOW)).toBe('3d');
  });
});

describe('the headline and the quiet line', () => {
  it('leads with the rank going down, not who took it', () => {
    const html = activityMarkup({ views: 14, bio: null, events: [event({}), event({ kind: 'passed', at: NOW - 2 * HOUR }), event({ kind: 'short', at: NOW - 3 * HOUR })] }, NOW);
    expect(html).toContain('is-taken');
    expect(html).toContain('Rank down');
    expect(html).toContain('You’re #5 now');
    expect(html).toContain('Someone beat your 187 in the Blast · 1 more this week');
    expect(html).not.toContain('Kabir');
    expect(html).not.toContain('board-kit');
  });

  it('says a beat that left the place alone as a best beaten', () => {
    const html = activityMarkup({ views: 0, bio: null, events: [event({ dropped: false, place: 2 })] }, NOW);
    expect(html).toContain('Best beaten');
    expect(html).toContain('You’re still #2');
  });

  it('names the line the place fell across', () => {
    expect(rankLine(2)).toBe('You’re no longer #1');
    expect(rankLine(3)).toBe('You’re #3 now');
    expect(rankLine(4)).toBe('You’re out of the top 3');
    expect(rankLine(11)).toBe('You’re out of the top 10');
    expect(rankLine(14)).toBe('You’re #14 now');
    expect(rankLine(null)).toBe('You lost a place');
  });

  it('says what happened without the name, in every mode', () => {
    expect(takenLine(event({}))).toBe('Someone beat your 187');
    expect(takenLine(event({ kind: 'passed' }))).toBe('Someone passed your 187');
    expect(takenLine(event({ mode: 'survive', result: { mine: { kind: 'lost', balls: 46, runs: 30 }, theirs: { kind: 'lost', balls: 40, runs: 30 } } }))).toBe('Someone outlasted you');
    expect(droppedBy(event({}))).toBe(true);
    expect(droppedBy(event({ dropped: false }))).toBe(false);
    expect(droppedBy(event({ kind: 'passed' }))).toBe(true);
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
