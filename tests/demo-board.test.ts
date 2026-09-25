import { describe, expect, it } from 'vitest';
import { DEMO_ROWS, demoBoard, demoCareers, demoSurvive } from '../src/game/demo-board';
import { BLAST_BOARDS, SURVIVE_BOARDS, blastTallyPlausible } from '../src/game/career';
import { survivePlausible } from '../src/game/survive-board';
import { AVATARS } from '../src/config/board';

const ME = 'abc123-defghijklmno';
const falling = (scores: number[]) => scores.every((one, i) => i === 0 || scores[i - 1] >= one);

describe('a board with fifty made-up people on it', () => {
  it('fills the whole board, on both ladders', () => {
    expect(demoBoard(ME)).toHaveLength(DEMO_ROWS);
    expect(demoSurvive(ME)).toHaveLength(DEMO_ROWS);
    expect(DEMO_ROWS).toBe(50);
  });

  it('puts one of them in the middle and makes it yours', () => {
    // The lit row is the point of looking at a full board, and a lit row at
    // the top or the bottom says nothing about what it looks like among rows.
    const mine = demoBoard(ME).filter(row => row.playerId === ME);
    expect(mine).toHaveLength(1);
    const place = demoBoard(ME).findIndex(row => row.playerId === ME);
    expect(place).toBeGreaterThan(2);
    expect(place).toBeLessThan(DEMO_ROWS - 3);
    // And nobody at all where this browser has no id yet.
    expect(demoBoard(null).some(row => row.playerId === ME)).toBe(false);
  });

  it('is in the order its own ladder would have put it', () => {
    expect(falling(demoBoard(ME).map(row => row.score))).toBe(true);
    expect(falling(demoSurvive(ME).map(row => row.score))).toBe(true);
  });

  it('is made of innings that could have been played', () => {
    // A made-up row that the real board would refuse is a row showing a screen
    // state nothing can reach.
    for (const row of demoBoard(ME)) {
      expect(blastTallyPlausible({ ...row, individual: row.runs, hundreds: 0 }), JSON.stringify(row)).toBe(true);
      expect(row.avatar).toBeLessThan(AVATARS);
    }
    for (const row of demoSurvive(ME)) {
      expect(survivePlausible(row), JSON.stringify(row)).toBe(true);
    }
  });

  it('fills every career ladder of both modes, each in its own order', () => {
    for (const [mode, ladders] of [['classic', BLAST_BOARDS], ['survive', SURVIVE_BOARDS]] as const) {
      const payload = demoCareers(mode, ME);
      expect(Object.keys(payload.boards)).toEqual(ladders.map(one => one.key));
      for (const board of ladders) {
        const rows = payload.boards[board.key];
        expect(rows.length, board.key).toBeGreaterThan(20);
        expect(falling(rows.map(row => row.score)), board.key).toBe(true);
        expect(rows.some(row => row.playerId === ME), board.key).toBe(true);
      }
    }
  });
});
