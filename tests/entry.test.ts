import { describe, expect, it } from 'vitest';
import { coverBoardLines, coverMarkup, profileChip } from '../src/ui/Cover';
import { boardNote, modeSelectMarkup, modeSelectParts, posterStat, rivalsLine, surviveLine } from '../src/ui/ModeSelect';
import { plateName, profileMarkup } from '../src/ui/Profile';
import { EXCITED_KEY, SUPER10_OPENS, excitedAlready, opensLine, super10PageMarkup } from '../src/ui/Super10Page';

describe('the cover', () => {
  it('says GUEST on the chip until there is a name, and the name after', () => {
    expect(profileChip(null)).toContain('GUEST');
    expect(profileChip({ name: '<Rohit>', avatar: 2 })).toContain('&lt;Rohit&gt;');
    expect(profileChip({ name: 'Rohit', avatar: 2 })).toContain('<img');
  });

  it('quotes your best and place, the leader, or only where the widget leads', () => {
    expect(coverBoardLines({ kind: 'best', runs: 158, rank: 2 })).toContain('<big>158</big> runs · You are <b>#2</b>');
    expect(coverBoardLines({ kind: 'best', runs: 158, rank: null })).not.toContain('You are');
    expect(coverBoardLines({ kind: 'top', runs: 107, name: 'Rohit' })).toContain('runs by Rohit');
    expect(coverBoardLines({ kind: 'none' })).toContain('Top 50 in every mode');
  });

  it('keeps the ids the game and its checks press', () => {
    const cover = coverMarkup({ player: null, board: { kind: 'none' } });
    for (const id of ['intro', 'start', 'tutorial', 'cover-board', 'feedback-open', 'best-label', 'best', 'cover-profile']) {
      expect(cover).toContain(`id="${id}"`);
    }
  });

  it('is a motion poster for everybody, with three flashes in the stands', () => {
    const cover = coverMarkup({ player: null, board: { kind: 'none' } });
    expect(cover).toContain('cover-motion');
    expect(cover.match(/class="cover-flash"/g)).toHaveLength(3);
  });

  it('says a big score made lately out loud: just now, or today', () => {
    expect(coverBoardLines({ kind: 'recent', runs: 112, name: 'Rohit', ago: 60_000 })).toContain('JUST NOW · THE BLAST');
    expect(coverBoardLines({ kind: 'recent', runs: 112, name: 'Rohit', ago: 60_000 })).toContain('Rohit just scored 112');
    expect(coverBoardLines({ kind: 'recent', runs: 112, name: 'Rohit', ago: 5 * 3_600_000 })).toContain('Rohit scored 112 today');
  });
});

describe('Choose a mode', () => {
  it('puts the best and the place on a poster, or says it has not been played', () => {
    expect(posterStat({ best: '158', rank: 2 })).toBe('Best 158 · #2');
    expect(posterStat({ best: '158', rank: null })).toBe('Best 158');
    expect(posterStat({ best: null, rank: null })).toBe('Not played');
  });

  it('gives Survival its rules until it has a result', () => {
    expect(surviveLine({ best: null, rank: null })).toBe('60 balls, one wicket. Chase or hold out.');
    expect(surviveLine({ best: 'Survived all 60 · drew', rank: 14 })).toBe('Survived all 60 · drew · #14');
  });

  it('says the record against friends, or invites', () => {
    expect(rivalsLine(null)).toBe('Same balls. Best score wins.');
    expect(rivalsLine({ won: 0, lost: 0, drawn: 0 })).toBe('Same balls. Best score wins.');
    expect(rivalsLine({ won: 3, lost: 1, drawn: 0 })).toBe('3 won · 1 lost against friends');
    expect(rivalsLine({ won: 3, lost: 1, drawn: 2 })).toBe('3 won · 1 lost · 2 drawn against friends');
    expect(boardNote(2)).toBe('You are #2 in The Blast');
    expect(boardNote(null)).toBe('Top 50 in every mode');
  });

  it('keeps the ids the game binds, drawn once', () => {
    const screen = modeSelectMarkup();
    for (const id of ['modes', 'modes-cancel', 'mode-marathon', 'mode-classic', 'mode-survive', 'mode-challenge',
      'modes-challenges', 'modes-board', 'modes-stats', 'modes-profile', 'mode-key', 'mode-challenge-flag', 'modes-dressing']) {
      expect(screen).toContain(`id="${id}"`);
    }
  });

  it('puts the three posters on one rail, the Blast first, with Super10 coming soon under it', () => {
    const screen = modeSelectMarkup();
    const order = ['mode-classic', 'mode-marathon', 'mode-survive', 'mode-super10'].map(id => screen.indexOf(`id="${id}"`));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
    expect(screen).toContain('id="modes-rail"');
    expect(screen.match(/class="ms-poster /g)).toHaveLength(3);
    expect(screen).toContain('COMING SOON');
    // No PLAY on Super10's card: it opens its page.
    const card = screen.slice(screen.indexOf('id="mode-super10"'));
    expect(card.slice(0, card.indexOf('</button>'))).not.toContain('PLAY');
  });

  it('draws the podium first, second and third into its places', () => {
    const parts = modeSelectParts({
      player: null, marathon: { best: null, rank: null }, blast: { best: null, rank: null }, survive: { best: null, rank: null },
      podium: [3, 1, 4], blastRank: null, stats: { runs: 0, tier: { key: 'debutant', name: 'DEBUTANT' } }, rivals: null,
      dressing: { earned: 3, of: 13, visited: false },
    });
    expect(parts['modes-dressing-line']).toBe('3 of 13 earned');
    expect(parts['modes-podium-faces']).toMatch(/is-2.*is-1.*is-3/s);
    expect(parts['modes-profile']).toContain('is-guest');
  });
});

describe("Super10's page, coming soon", () => {
  it("offers I'M EXCITED beside GOT IT, with the day it opens", () => {
    const page = super10PageMarkup(false);
    for (const id of ['super10-page', 'super10-back', 'super10-excited', 'super10-got-it', 'super10-when']) expect(page).toContain(`id="${id}"`);
    expect(page).toContain('I’M EXCITED');
    expect(page).toContain(`Coming on ${SUPER10_OPENS}`);
    expect(page).toContain('aria-pressed="false"');
  });

  it('stays pressed for a browser that has said it, and says it was heard', () => {
    const page = super10PageMarkup(true);
    expect(page).toContain('sp-excited is-done');
    expect(page).toContain('EXCITED!');
    expect(page).toContain('aria-pressed="true"');
    expect(opensLine(true)).toBe(`Noted. See you on ${SUPER10_OPENS}.`);
  });

  it('remembers it once a browser, and a browser that keeps nothing never has', () => {
    expect(excitedAlready({ getItem: key => (key === EXCITED_KEY ? '1' : null) })).toBe(true);
    expect(excitedAlready({ getItem: () => null })).toBe(false);
    expect(excitedAlready({ getItem: () => { throw new Error('private'); } })).toBe(false);
  });

  it('tells what is new in it, the stadium unnamed', () => {
    const page = super10PageMarkup(false);
    for (const rule of ['Five bowlers', 'A new stadium', 'The field reads you', 'Its own board']) expect(page).toContain(rule);
    expect(page).not.toMatch(/canopy|pavilion|arena/i);
    expect(page.match(/<i class="is-(powerplay|middle|death)">/g)).toHaveLength(10);
  });
});

describe('the name screen', () => {
  const base = { name: '', avatar: 0, hand: 'right' as const, order: [0, 1, 2, 3, 4] };

  it('is a gate with a way back to the cover and none past', () => {
    const gate = profileMarkup({ ...base, gate: true, fresh: true });
    expect(gate).toContain('id="profile-leave"');
    expect(gate).not.toContain('id="profile-close"');
    expect(gate).toContain('WHO’S WALKING OUT TO BAT?');
    expect(gate).toMatch(/id="profile-send"[^>]*disabled/);
  });

  it('from My Stats, goes back there', () => {
    const edit = profileMarkup({ ...base, name: 'Rohit', gate: false, fresh: false });
    expect(edit).toContain('id="profile-close"');
    expect(edit).not.toContain('id="profile-leave"');
    expect(edit).toContain('YOUR DETAILS');
  });

  it('shows the name typed in capitals over the kit, and the tier under it', () => {
    expect(plateName(' rohit ')).toBe('ROHIT');
    expect(plateName('  ')).toBe('YOUR NAME');
    const screen = profileMarkup({ ...base, name: 'Rohit', hand: 'left', gate: true, fresh: false, tier: { key: 'star', name: 'STAR' } });
    expect(screen).toContain('>ROHIT<');
    expect(screen).toContain('LEFT-HANDED');
    expect(screen).toContain('tier-star');
  });
});
