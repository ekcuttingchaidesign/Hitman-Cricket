import { describe, expect, it } from 'vitest';
import { emptyBlast, emptySurvive } from '../src/game/career';
import {
  careerBoardMarkup, careerBoardOf, ladderTabsMarkup, laddersOf, placesOf, statsCardMarkup,
  type AnyCareer,
} from '../src/ui/CareerBoard';
import type { CareerRow } from '../src/game/career-api';

const row = (name: string, career: Partial<AnyCareer>, playerId = name): CareerRow<AnyCareer> => ({
  playerId, name, avatar: 0, score: 1, career: { ...emptyBlast(), ...career } as AnyCareer,
});

describe('the ladder tabs', () => {
  it('offers the innings board first and the card last', () => {
    const keys = laddersOf('classic').map(tab => tab.key);
    expect(keys[0]).toBe('best');
    expect(keys.at(-1)).toBe('you');
  });

  it('offers each mode its own career ladders', () => {
    expect(laddersOf('classic').map(tab => tab.key)).toEqual(['best', 'runs', 'boundaries', 'highest', 'you']);
    expect(laddersOf('survive').map(tab => tab.key)).toEqual(['best', 'balls', 'blows', 'runs', 'boundaries', 'you']);
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

describe('the stats card', () => {
  it('shows the six figures a Blast career is read in', () => {
    const markup = statsCardMarkup({
      mode: 'classic', name: 'Rohit',
      career: { ...emptyBlast(), innings: 12, runs: 900, sixes: 40, fours: 30, highest: 140, notOut: 132, balls: 300 },
    });
    for (const label of ['Runs', 'Highest', 'Sixes', 'Fours', 'Best n.o.', 'Balls']) {
      expect(markup).toContain(`<dt>${label}</dt>`);
    }
    expect(markup).toContain('<dd>900</dd>');
    expect(markup).toContain('<dd>140</dd>');
    expect(markup).toContain('<dd>132</dd>');
    expect(markup).toContain('<b>12</b>');
  });

  it('shows the Test career with its three results and its survivals', () => {
    const markup = statsCardMarkup({
      mode: 'survive', name: 'Rohit',
      career: { ...emptySurvive(), innings: 9, balls: 400, runs: 120, blows: 22, sixes: 4, fours: 8, wins: 2, draws: 3, losses: 4 },
    });
    for (const label of ['Balls faced', 'Survived', 'Runs', 'Blows', 'Sixes', 'Fours', 'Won', 'Drawn', 'Lost']) {
      expect(markup).toContain(`<dt>${label}</dt>`);
    }
    // Survived is the two tiers he came through, and nothing else.
    expect(markup).toContain('<dd>5</dd>');
  });

  it('tells a player with no innings that there is nothing yet', () => {
    expect(statsCardMarkup({ mode: 'classic', career: emptyBlast() }))
      .toContain('No innings counted yet');
  });

  it('tells a counted player with no name what is missing', () => {
    const markup = statsCardMarkup({ mode: 'classic', career: { ...emptyBlast(), innings: 3, runs: 90 } });
    expect(markup).toContain('register a name');
  });

  it('names the best standing the player holds on any of the ladders', () => {
    const markup = statsCardMarkup({
      mode: 'classic', name: 'Rohit',
      career: { ...emptyBlast(), innings: 3, runs: 90 },
      places: { runs: 12, boundaries: 4, highest: 30 },
    });
    expect(markup).toContain('<b>4th</b> on Boundaries');
  });

  it('says so plainly when a name is held and no board has them yet', () => {
    const markup = statsCardMarkup({
      mode: 'classic', name: 'Rohit', career: { ...emptyBlast(), innings: 3, runs: 90 }, places: {},
    });
    expect(markup).toContain('Counted, and climbing');
  });

  it('says out loud that the figures belong to this browser', () => {
    expect(statsCardMarkup({ mode: 'classic', career: emptyBlast() }))
      .toContain('keep to one window');
  });

  it('writes the name in as text', () => {
    expect(statsCardMarkup({ mode: 'classic', name: '<b>x</b>', career: { ...emptyBlast(), innings: 1 } }))
      .toContain('&lt;b&gt;x&lt;/b&gt;');
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
