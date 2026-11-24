import { describe, expect, it } from 'vitest';
import { lastCard, mineIn, pointsNote, pointsWord, resultsOf } from '../src/game/knockout-told';
import type { MatchResult, MatchResultRow } from '../src/server/knockout-result';

/**
 * A finished match in words (`knockout-told.ts`): the room's Results, the
 * lobby's card for the match before, and what was paid, off the store's result.
 */
const row = (place: number, name: string, over: Partial<MatchResultRow> = {}): MatchResultRow => ({
  handle: over.sub ? null : `h-${name.toLowerCase()}`, name, face: place % 5, sub: false, place, runs: 100 - place * 7, balls: place <= 2 ? 30 : 24, out: false,
  over: place <= 2 ? null : place <= 5 ? 4 : place <= 8 ? 3 : place <= 10 ? 2 : 1, points: 0, stood: false, ran: false, ...over,
});
const result = (rows: MatchResultRow[], over: Partial<MatchResult> = {}): MatchResult => ({ round: 1, at: 0, reals: 4, worth: [5, 2, 1], counted: true, rows, ...over });
const room = () => result([
  row(1, 'Mojo', { points: 5 }), row(2, 'Riya', { sub: true }), row(3, 'Tanvi', { points: 1 }), row(4, 'Arjun', { sub: true }),
  row(5, 'Farhan', { out: true }), row(6, 'Kabir', { sub: true }), row(7, 'Gauri', { stood: true }),
]);

describe('what a match paid, in words', () => {
  it('says the points, or why there are none', () => {
    expect(pointsWord(5, true)).toBe('+5 POINTS');
    expect(pointsWord(1, true)).toBe('+1 POINT');
    expect(pointsWord(0, true)).toBe('NO POINTS THIS MATCH');
    expect(pointsWord(0, false)).toBe('PRACTICE · NO POINTS');
    expect(pointsNote(2, true)).toBe('+2 points');
    expect(pointsNote(0, true)).toBe('no points this time');
    expect(pointsNote(0, false)).toBe('practice, no points');
  });
  it('finds a player’s own seat by their handle', () => {
    expect(mineIn(room(), 'h-tanvi')).toMatchObject({ name: 'Tanvi', place: 3 });
    expect(mineIn(room(), 'h-nobody')).toBeNull();
    expect(mineIn(null, 'h-tanvi')).toBeNull();
  });
});

describe('the lobby’s card for the match before', () => {
  it('says who won it and where this player came, with what they were paid', () => {
    expect(lastCard(room(), 'h-mojo')).toEqual({ title: 'YOU WON IT', line: '93 off 30 · +5 points', face: 1 });
    expect(lastCard(room(), 'h-tanvi')).toEqual({ title: 'MOJO WON IT', line: '93 off 30 · you were 3rd · +1 point', face: 1 });
    expect(lastCard(room(), 'h-farhan').line).toBe('93 off 30 · you were 5th');
    expect(lastCard(room(), 'h-latecomer').line).toBe('93 off 30 · you sat it out');
  });
  it('says so of a win that paid nothing, and of a match run away from', () => {
    const practice = result([row(1, 'Mojo'), row(2, 'Riya', { sub: true })], { counted: false, worth: [0, 0, 0], reals: 1 });
    expect(lastCard(practice, 'h-mojo')).toMatchObject({ title: 'YOU WON IT', line: '93 off 30 · the room was yours' });
    const ran = result([row(1, 'Riya', { sub: true }), row(2, 'Mojo', { stood: true, ran: true })]);
    expect(lastCard(ran, 'h-mojo')).toMatchObject({ title: 'RIYA WON IT', line: '93 off 30 · you ran away' });
  });
});

describe('the room’s Results, off the store’s result', () => {
  it('lists every seat by its place with how it ended, and the points on those paid', () => {
    const view = resultsOf(room(), 'h-farhan', 'K7Q2', 'BACK TO ROOM');
    expect(view).toMatchObject({ live: false, practice: false, again: 'BACK TO ROOM', pill: 'Room K7Q2' });
    expect(view.rows.map(r => [r.place, r.name, r.line, r.points ?? 0])).toEqual([
      [1, 'Mojo', 'Won the final', 5], [2, 'Riya', 'Runner-up', 0], [3, 'Tanvi', 'Cut after over 4, not out', 1], [4, 'Arjun', 'Cut after over 4, not out', 0],
      [5, 'Farhan', 'Out · cut after over 4', 0], [6, 'Kabir', 'Cut after over 3, not out', 0], [7, 'Gauri', 'Cut after over 3, not out · a sub finished', 0],
    ]);
    expect(view.rows.map(r => r.you)).toEqual([false, false, false, false, true, false, false]);
    expect(view.rows.map(r => !!r.sub)).toEqual([false, true, false, true, false, true, false]);
    expect(view.winner).toEqual({ title: 'Mojo won the room', line: '93 off 30 · outlasted Riya by 7 in the final' });
    expect(view.you).toEqual({ place: 5, of: 7, face: 0, runs: 65, line: '65 off 24 · no points this time' });
  });
  it('says what this player was paid, or that a sub finished for them', () => {
    expect(resultsOf(room(), 'h-mojo', 'K7Q2').winner.title).toBe('You won the room');
    expect(resultsOf(room(), 'h-mojo', 'K7Q2').you.line).toBe('93 off 30 · +5 points');
    expect(resultsOf(room(), 'h-gauri', 'K7Q2').you.line).toBe('51 off 24 · a sub finished for you, so no points');
    const practice = result([row(1, 'Mojo'), row(2, 'Riya', { sub: true })], { counted: false });
    expect(resultsOf(practice, 'h-mojo', 'K7Q2')).toMatchObject({ practice: true });
    expect(resultsOf(practice, 'h-mojo', 'K7Q2').you.line).toBe('93 off 30 · practice, no points');
  });
  it('puts somebody who ran away at the foot with no place, their seat the sub’s who finished it', () => {
    const ran = result([row(1, 'Mojo', { points: 5 }), row(2, 'Farhan', { stood: true, ran: true }), row(3, 'Riya', { sub: true })]);
    const others = resultsOf(ran, 'h-mojo', 'K7Q2');
    expect(others.rows.map(r => [r.place, r.name, r.line, r.runs, !!r.sub])).toEqual([
      [1, 'Mojo', 'Won the final', 93, false], [2, 'Farhan’s sub', 'Runner-up', 86, true], [3, 'Riya', 'Cut after over 4, not out', 79, true], [0, 'Farhan', 'Ran away', null, false],
    ]);
    const theirs = resultsOf(ran, 'h-farhan', 'K7Q2');
    expect(theirs.rows.map(r => r.you)).toEqual([false, false, false, true]);
    expect(theirs.you).toMatchObject({ place: 0, runs: null, sentence: 'You <em>ran away</em>', line: 'No place and no points' });
  });
  it('says so to a player who was not batting it', () => {
    expect(resultsOf(room(), 'h-latecomer', 'K7Q2').you).toMatchObject({ sentence: 'You <em>sat this one out</em>', runs: null });
  });
});
