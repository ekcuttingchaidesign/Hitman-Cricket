import { describe, expect, it } from 'vitest';
import { emptyBlast, emptyMarathon, emptySurvive } from '../src/game/career';
import { dressingMarkup, footMarkup, shelfMarkup, type DressingView } from '../src/ui/DressingRoom';

const view = (patch: Partial<DressingView> = {}): DressingView => ({
  shelf: 'kit', kit: 'home', bat: 'boom', wearing: 'home', holding: 'boom', pictures: {},
  record: {
    careers: { classic: { ...emptyBlast(), sixes: 182, highest: 112 }, survive: { ...emptySurvive(), wins: 18 }, marathon: { ...emptyMarathon(), highest: 142 } },
    rivals: { won: 0, beaten: 0 }, launch: { classic: 0, survive: 0, marathon: 0 }, visited: true,
  },
  ...patch,
});

describe('the Dressing Room screen', () => {
  it('keeps the ids the game and the checks bind', () => {
    const screen = dressingMarkup();
    for (const id of ['dressing-back', 'dressing-tab-kit', 'dressing-tab-bat', 'dressing-name', 'dressing-items', 'dressing-foot']) expect(screen).toContain(`id="${id}"`);
  });

  it('puts every kit on the shelf, a tick on the one worn and a lock on the ones not earned', () => {
    const shelf = shelfMarkup(view());
    expect(shelf.match(/class="dr-item[ "]/g)).toHaveLength(7);
    expect(shelf).toMatch(/data-id="home"[^>]*aria-label="OG Navy, on"/);
    expect(shelf).toMatch(/data-id="lagoon"[^>]*aria-label="Lagoon, locked"/);
    expect(shelfMarkup(view({ shelf: 'bat' })).match(/class="dr-item[ "]/g)).toHaveLength(6);
  });

  it('shows one goal large, and the key to the game it is won in', () => {
    const foot = footMarkup(view({ kit: 'electric' }));
    expect(foot).toContain('Win 50 Test Survivals');
    expect(foot).toMatch(/18<span> \/ 50<\/span>/);
    expect(foot).toContain('32 to go');
    expect(foot).toContain('PLAY TEST SURVIVAL');
  });

  it('shows several as a checklist with a tick a line, a best for a one-off', () => {
    const foot = footMarkup(view({ shelf: 'bat', bat: 'savage', record: { ...view().record, careers: { ...view().record.careers, survive: { ...emptySurvive() } } } }));
    expect(foot.match(/<li/g)).toHaveLength(3);
    expect(foot).toMatch(/is-done.*A hundred in the Blast/s);
    expect(foot).toMatch(/A hundred in Test Marathon<\/span><b>Done/);
    expect(foot).toContain('PLAY TEST SURVIVAL');
  });

  it('says what earned one that is owned, offers Next up, and WEARING once it is on', () => {
    const worn = footMarkup(view());
    expect(worn).toContain('Your kit from day one.');
    expect(worn).toContain('id="dressing-next"');
    expect(worn).toContain('WEARING');
    const owned = footMarkup(view({ shelf: 'bat', bat: 'savage' }));
    expect(owned).toContain('Nobody messes with Savage');
    expect(owned).toContain('PICK IT UP');
  });
});
