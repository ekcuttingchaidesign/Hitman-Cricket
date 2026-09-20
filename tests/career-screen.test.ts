import { describe, expect, it } from 'vitest';
import { emptyBlast } from '../src/game/career';
import {
  bestStanding, careerBoardMarkup, careerBoardOf, ladderTabsMarkup, laddersOf, placesOf,
  type AnyCareer,
} from '../src/ui/CareerBoard';
import type { CareerRow } from '../src/game/career-api';

const row = (name: string, career: Partial<AnyCareer>, playerId = name): CareerRow<AnyCareer> => ({
  playerId, name, avatar: 0, score: 1, career: { ...emptyBlast(), ...career } as AnyCareer,
});

describe('the ladder tabs', () => {
  it('offers the innings board first', () => {
    expect(laddersOf('classic').map(tab => tab.key)[0]).toBe('best');
  });

  it('offers each mode its own career ladders', () => {
    expect(laddersOf('classic').map(tab => tab.key)).toEqual(['best', 'runs', 'boundaries', 'individual']);
    expect(laddersOf('survive').map(tab => tab.key)).toEqual(['best', 'balls', 'blows', 'runs', 'boundaries']);
  });

  it('keeps the player\'s own card out of the strip', () => {
    // It is a destination rather than a way of re-sorting the rows, so it has
    // its own key under the sheet. A pill here would have read as a seventh
    // ladder and been the only one that did not rank anybody.
    for (const mode of ['classic', 'survive'] as const) {
      expect(laddersOf(mode).map(tab => tab.key)).not.toContain('you');
      expect(ladderTabsMarkup(mode, 'best')).not.toContain('board-ladder-you');
    }
  });

  it('marks exactly one tab as the live one', () => {
    const markup = ladderTabsMarkup('classic', 'runs');
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup).toContain('id="board-ladder-runs"');
    expect(markup).toContain('class="ladder-tab is-on"');
  });

  it('gives every tab an id the sheet can find it by', () => {
    for (const tab of laddersOf('survive')) {
      expect(ladderTabsMarkup('survive', 'best')).toContain(`id="board-ladder-${tab.key}"`);
    }
  });
});

describe('a career board, drawn', () => {
  const board = careerBoardOf('classic', 'runs')!;

  it('draws a row a place for each career it was handed', () => {
    const markup = careerBoardMarkup({
      mode: 'classic', board,
      rows: [row('Rohit', { runs: 900, innings: 12, sixes: 40 }), row('Bumrah', { runs: 400, innings: 9 })],
    });
    expect(markup.match(/class="board-row/g)).toHaveLength(2);
    expect(markup).toContain('>900<');
    expect(markup).toContain('>1</span>');
  });

  it('leads a row with the figure the board ranks on', () => {
    const markup = careerBoardMarkup({
      mode: 'classic', board: careerBoardOf('classic', 'boundaries')!,
      rows: [row('Rohit', { runs: 900, sixes: 40, fours: 12 })],
    });
    // Sixes lead on this board, with fours beside them; runs are not shown.
    expect(markup).toContain('<span class="board-runs">40</span>');
    expect(markup).toContain('12<small>4s</small>');
  });

  it('says where the player stands when they are on it', () => {
    const markup = careerBoardMarkup({
      mode: 'classic', board, youId: 'Bumrah',
      rows: [row('Rohit', { runs: 900 }), row('Bumrah', { runs: 400 })],
    });
    expect(markup).toContain('You are <b>2nd</b>');
    expect(markup).toContain('aria-current="true"');
  });

  it('names the leader when the player is not on it', () => {
    const markup = careerBoardMarkup({ mode: 'classic', board, youId: 'nobody', rows: [row('Rohit', { runs: 900 })] });
    expect(markup).toContain('Rohit leads with <b>900</b>');
  });

  it('says so rather than showing an empty fifty', () => {
    expect(careerBoardMarkup({ mode: 'classic', board, rows: [], state: 'ready' }))
      .toContain('Nobody has a career here yet');
    expect(careerBoardMarkup({ mode: 'classic', board, rows: [], state: 'loading' }))
      .toContain('Fetching the board…');
    expect(careerBoardMarkup({ mode: 'classic', board, rows: [], state: 'offline' }))
      .toContain('could not be reached');
  });

  it('writes a name in as text and never as markup', () => {
    const markup = careerBoardMarkup({
      mode: 'classic', board, rows: [row('<img src=x>', { runs: 10 })],
    });
    expect(markup).not.toContain('<img src=x>');
    expect(markup).toContain('&lt;img src=x&gt;');
  });

  it('carries the sheet\'s way out and the innings-end keys when it is given them', () => {
    expect(careerBoardMarkup({ mode: 'classic', board, rows: [] })).toContain('id="board-close"');
    expect(careerBoardMarkup({ mode: 'classic', board, rows: [], actionsMarkup: '<i id="board-again"></i>' }))
      .toContain('id="board-again"');
  });
});

describe('where a player stands', () => {
  it('reads a place off each board they are on, counting from one', () => {
    const boards = {
      runs: [row('Rohit', {}), row('Bumrah', {})],
      boundaries: [row('Bumrah', {}), row('Rohit', {})],
      highest: [row('Bumrah', {})],
    };
    expect(placesOf(boards, 'Rohit')).toEqual({ runs: 1, boundaries: 2 });
  });

  it('has nothing to say about nobody', () => {
    expect(placesOf({ runs: [row('Rohit', {})] }, null)).toEqual({});
  });
});

describe('the best standing on any ladder', () => {
  it('names the highest place the player holds, and the board it is on', () => {
    expect(bestStanding('classic', { runs: 12, boundaries: 4, highest: 30 })).toBe('4th on Boundaries');
  });

  it('has nothing to say where no board has them', () => {
    expect(bestStanding('classic', {})).toBeNull();
  });
});
