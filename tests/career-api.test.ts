import { afterEach, describe, expect, it, vi } from 'vitest';
import { heldCareer, mintNonce } from '../src/game/career-api';
import {
  BLAST_CAREER, SURVIVE_CAREER, blastTally, emptyBlast, readBlastTally, readSurviveTally,
} from '../src/game/career';

/** localStorage, as a map, so the mirror can be tested without a browser. */
function fakeStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
  });
  return held;
}

afterEach(() => vi.unstubAllGlobals());

describe('the career this browser last saw', () => {
  it('is an empty one until anything has been counted', () => {
    fakeStorage();
    expect(heldCareer('classic')).toEqual(emptyBlast());
  });

  it('reads back what was mirrored', () => {
    fakeStorage({
      'hitman-career': JSON.stringify({ classic: { ...emptyBlast(), innings: 4, runs: 240, highest: 90 } }),
    });
    const held = heldCareer('classic');
    expect(held.innings).toBe(4);
    expect(held.runs).toBe(240);
  });

  it('keeps the two modes apart', () => {
    fakeStorage({
      'hitman-career': JSON.stringify({ classic: { ...emptyBlast(), runs: 240 } }),
    });
    expect(heldCareer('survive').runs).toBe(0);
    // The Test career has figures the Blast one does not, and reading the wrong
    // mode's mirror would have handed back the Blast's shape under Test labels.
    expect('blows' in heldCareer('survive')).toBe(true);
  });

  it('reads a figure an older build never wrote as a nought, not an undefined', () => {
    // A mirror written before `notOut` existed. Drawn straight onto the card it
    // would have put the word "undefined" in a cell the size of a score.
    fakeStorage({ 'hitman-career': JSON.stringify({ classic: { innings: 2, runs: 120 } }) });
    const held = heldCareer('classic');
    expect(held).toEqual({ ...emptyBlast(), innings: 2, runs: 120 });
    for (const figure of Object.values(held)) expect(Number.isInteger(figure)).toBe(true);
  });

  it('treats junk, a negative and a missing store as no mirror at all', () => {
    fakeStorage({ 'hitman-career': 'not json' });
    expect(heldCareer('classic')).toEqual(emptyBlast());
    fakeStorage({ 'hitman-career': JSON.stringify({ classic: { runs: -5, innings: 1.5 } }) });
    expect(heldCareer('classic').runs).toBe(0);
    expect(heldCareer('classic').innings).toBe(1);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('off'); } });
    expect(heldCareer('classic')).toEqual(emptyBlast());
  });
});

describe('an innings id', () => {
  it('is the shape the store will take', () => {
    for (let i = 0; i < 20; i++) expect(mintNonce()).toMatch(/^[0-9a-z-]{8,40}$/);
  });

  it('is not the same one twice', () => {
    expect(new Set(Array.from({ length: 50 }, mintNonce)).size).toBe(50);
  });
});

describe('a tally read off the wire', () => {
  it('keeps every figure the ladder needs, so the endpoint cannot hand it fewer', () => {
    // The endpoint used to coerce the body with its own copy of this, and when
    // the Blast tally grew the two figures a scorecard knows, the copy went on
    // reading six. Every Blast career was refused as impossible, and nothing
    // anywhere said so.
    const played = blastTally({
      runs: 130, sixes: 18, fours: 4, wickets: 2, dots: 6, balls: 30,
      history: [
        ...Array.from({ length: 4 }, () => ({ runs: 5, isWicket: false })),
        { runs: 0, isWicket: true },
        { runs: 0, isWicket: true },
        ...Array.from({ length: 11 }, () => ({ runs: 10, isWicket: false })),
      ],
    } as never);
    const wire = JSON.parse(JSON.stringify(played)) as unknown;
    expect(readBlastTally(wire)).toEqual(played);
    expect(BLAST_CAREER.plausible(readBlastTally(wire))).toBe(true);
  });

  it('refuses a body missing a figure rather than calling it nought', () => {
    // Six figures is what the old endpoint sent. It must not pass for eight.
    const six = { runs: 60, sixes: 10, fours: 0, wickets: 0, dots: 20, balls: 30 };
    expect(BLAST_CAREER.plausible(readBlastTally(six))).toBe(false);
  });

  it('reads the Test match\'s seven, boundaries included', () => {
    const tally = { runs: 40, balls: 60, wickets: 0, blows: 3, health: 70, sixes: 2, fours: 3 };
    expect(readSurviveTally(tally)).toEqual(tally);
    expect(SURVIVE_CAREER.plausible(readSurviveTally(tally))).toBe(true);
  });
});
