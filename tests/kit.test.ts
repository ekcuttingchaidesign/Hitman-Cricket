import { describe, expect, it } from 'vitest';
import { TIERS, roadOf, standingOf } from '../src/game/tier';
import type { CareerMode } from '../src/game/career';
import { badgeSrc, cta, icon, keyTicket, rankHeader, roadToHitman, tabs, tierBadge } from '../src/ui/Kit';
import { galleryMarkup } from '../src/ui/KitGallery';

const at = (mode: CareerMode, measure: number) =>
  standingOf(mode, { runs: measure, balls: measure } as Parameters<typeof standingOf>[1]);

describe('Road to Hitman', () => {
  it('stands the medallions evenly and fills to the share of the gap', () => {
    // The handover's own example: 2,140 runs, Emerging, 1,460 to Star, the
    // fill ending 154 of the track's 298 along.
    const road = roadOf('classic', at('classic', 2140));
    expect(road.goal).toBe('1,460 runs to Star');
    expect(road.position * 298).toBeCloseTo(154, 0);
    expect(road.rungs.map(rung => rung.reached)).toEqual([true, true, false, false]);
  });

  it('sets the first goal as a thing to do, and the last as done', () => {
    expect(roadOf('classic', at('classic', 0)).goal).toBe('Score 350 runs to reach Emerging');
    expect(roadOf('classic', at('classic', 0)).position).toBe(0);
    expect(roadOf('classic', at('classic', 16450)).goal).toBe('Hitman. Top of the game.');
    expect(roadOf('classic', at('classic', 16450)).position).toBe(1);
  });

  it('reads each mode off its own figure and ladder', () => {
    expect(roadOf('survive', at('survive', 0)).goal).toBe('Face 100 balls to reach Emerging');
    expect(roadOf('survive', at('survive', 420)).goal).toBe('580 balls to Star');
    expect(roadOf('marathon', at('marathon', 750)).position).toBeCloseTo(1 / 3);
    expect(roadOf('marathon', at('marathon', 9000)).rungs.map(rung => rung.at)).toEqual([0, 750, 7500, 30000]);
  });

  it('never runs past a rung it has not reached', () => {
    for (const measure of [0, 349, 350, 3599, 3600, 14999, 15000, 90000]) {
      const road = roadOf('classic', at('classic', measure));
      const reached = road.rungs.filter(rung => rung.reached).length;
      expect(road.position).toBeGreaterThanOrEqual((reached - 1) / 3);
      expect(road.position).toBeLessThanOrEqual(reached === 4 ? 1 : reached / 3);
    }
  });

  it('pins the player only between the first medallion and the last', () => {
    expect(roadToHitman('classic', at('classic', 2140))).toContain('k-road-you');
    expect(roadToHitman('classic', at('classic', 0))).not.toContain('k-road-you');
    expect(roadToHitman('classic', at('classic', 16450))).not.toContain('k-road-you');
  });
});

describe('the parts', () => {
  it('draws every key as a button, with a face to press', () => {
    const key = cta({ kind: 'primary', label: 'PLAY AGAIN', id: 'again' });
    expect(key).toMatch(/^<button type="button" class="k-cta k-cta--primary" id="again">/);
    expect(key).toContain('<span class="k-cta-face"><span>PLAY AGAIN</span></span>');
  });

  it('names the square keys for a screen reader, since they print nothing', () => {
    const share = cta({ kind: 'share', label: 'Share on WhatsApp' });
    expect(share).toContain('aria-label="Share on WhatsApp"');
    expect(share).not.toContain('<span>Share on WhatsApp</span>');
  });

  it('turns every icon to the colour of the part round it', () => {
    const svg = icon('trophy');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/stroke="#|stroke="white"/);
    expect(svg).toContain('aria-hidden="true"');
  });

  it('puts only the place in orange, and escapes the name', () => {
    const head = rankHeader({ name: '<Riya>', avatar: 'avatars/a.webp', rank: 23, first: true });
    expect(head).toContain('You are <b>#23</b> on the leaderboard');
    expect(head).toContain('&lt;Riya&gt;');
    expect(head).toContain('First innings');
    expect(rankHeader({ name: 'Riya', avatar: 'a', rank: 7 })).not.toContain('First innings');
  });

  it('marks the chosen tab, and only that one', () => {
    const row = tabs([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], 'b', 'Mode');
    expect(row.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(row).toMatch(/data-key="b" aria-selected="true"/);
  });

  it('carries the key on the ticket', () => {
    expect(keyTicket({ key: 'stamina-lofted-fielder-30' })).toContain('stamina-lofted-fielder-30');
  });

  it('has a medallion for every tier, earned and locked, but never a locked Debutant', () => {
    // Small enough that the build inlines them, so they are told apart by
    // what they are rather than by their file names.
    const seen = new Set<string>();
    for (const tier of TIERS) {
      const earned = badgeSrc(tier.key, true), locked = badgeSrc(tier.key, false);
      if (tier.key === 'debutant') expect(locked).toBe(earned);
      else expect(locked).not.toBe(earned);
      seen.add(earned).add(locked);
    }
    expect(seen.size).toBe(TIERS.length * 2 - 1);
    expect(tierBadge('star', false, 'Star')).toContain('alt="Star (locked)"');
  });

  it('lays the whole kit out on one page', () => {
    const page = galleryMarkup();
    for (const id of ['colour', 'type', 'ctas', 'controls', 'player', 'badges', 'road']) expect(page).toContain(`id="kg-${id}"`);
  });
});
