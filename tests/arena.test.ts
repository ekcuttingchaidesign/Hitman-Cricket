import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA, ARENA_CROWD, ARENA_PALETTES, CUES, DEFAULT_PALETTE, arenaFrame, arenaStands, paletteFrom, screenFrom, usePalette } from '../src/scene/arena';
import { buildGround, groundFrom, nightOnly, ownFloodlights } from '../src/scene/grounds';

const hex = (c: THREE.Color) => c.getHex();
const crowdOf = (world: THREE.Object3D) => {
  const crowd: THREE.InstancedMesh[] = [];
  world.traverse(object => { if (object instanceof THREE.InstancedMesh) crowd.push(object); });
  return crowd[0];
};

describe('the arena', () => {
  it('is asked for with ?ground=arena, brings its own lights and is played at night only', () => {
    expect(groundFrom('?ground=arena&mode=super10')).toBe('arena');
    expect(ownFloodlights('arena')).toBe(true);
    expect(nightOnly('arena')).toBe(true);
    expect(nightOnly('stadium')).toBe(false);
  });

  it('keeps the big screen unless the link asks for the commentary box', () => {
    expect(screenFrom('')).toBe(true);
    expect(screenFrom('?ground=arena')).toBe(true);
    expect(screenFrom('?ground=arena&screen=0')).toBe(false);
  });

  it('takes its calm colours from a palette the link can ask for, never Power Surge\'s gold or the death overs\' red', () => {
    expect(paletteFrom('')).toBe(DEFAULT_PALETTE);
    expect(paletteFrom('?palette=VIOLET')).toBe('violet');
    expect(paletteFrom('?palette=lime')).toBe(DEFAULT_PALETTE);
    for (const name of Object.keys(ARENA_PALETTES) as (keyof typeof ARENA_PALETTES)[]) {
      usePalette(name);
      expect(hex(arenaFrame('calm', null, 0).halo)).toBe(ARENA_PALETTES[name].halo);
      for (const c of [ARENA.halo, ARENA.ribbon]) expect(c === ARENA.surge || c === ARENA.death || c === ARENA.out).toBe(false);
    }
    usePalette(DEFAULT_PALETTE);
  });

  it('is lit by a ring of lamps round the whole roof, and stands up no towers', () => {
    const lights = arenaStands(new THREE.Group());
    expect(lights.towers).toHaveLength(0);
    expect(lights.roof.length).toBeGreaterThan(100);
    // All the way round: every quarter of the ground has its share.
    const quarters = new Set(lights.roof.map(p => Math.floor((Math.atan2(p.x, p.z - 10) + Math.PI) / (Math.PI / 2)) % 4));
    expect(quarters.size).toBe(4);
    // And the stadium keeps its towers.
    expect(buildGround('stadium', new THREE.Group())!.towers).toHaveLength(4);
  });

  it('seats the two sides in their colours, a section each, where the stadium has its summer whites', () => {
    const crowd = crowdOf((() => { const g = new THREE.Group(); arenaStands(g); return g; })());
    const allowed = new Set(ARENA_CROWD.flat());
    const seen = new Set<number>();
    const colour = new THREE.Color();
    for (let i = 0; i < crowd.count; i++) { crowd.getColorAt(i, colour); seen.add(colour.getHex()); }
    for (const c of seen) expect(allowed.has(c)).toBe(true);
    // Both sides are in.
    expect(seen.has(ARENA_CROWD[0][0]) && seen.has(ARENA_CROWD[1][0])).toBe(true);
  });

  it('is calm in its two colours, gold under Power Surge and red in the death overs', () => {
    const calm = arenaFrame('calm', null, 5000);
    expect(hex(calm.halo)).toBe(ARENA.halo);
    expect(hex(calm.ribbon)).toBe(ARENA.ribbon);
    expect(calm.word).toBeNull();
    expect(calm.chase).toBe(0);
    expect(calm.beams).toBe(0);
    // A mood breathes, but stays its colour: the hue is the surge's gold, the death's red.
    const hue = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }).h;
    for (let t = 0; t < 3000; t += 250) {
      expect(hue(arenaFrame('surge', null, t).halo)).toBeCloseTo(hue(new THREE.Color(ARENA.surge)), 2);
      expect(hue(arenaFrame('death', null, t).halo)).toBeCloseTo(hue(new THREE.Color(ARENA.death)), 2);
    }
  });

  it('runs its light round for a four and puts the word on the boards', () => {
    const four = arenaFrame('calm', { kind: 'four', at: 1000 }, 1300);
    expect(four.word).toBe('FOUR');
    expect(four.chase).toBeGreaterThan(0);
    expect(four.beams).toBe(0);
  });

  it('puts the searchlights up for a six and a milestone, and not for a four or a wicket', () => {
    expect(arenaFrame('calm', { kind: 'six', at: 0 }, 800).beams).toBe(1);
    expect(arenaFrame('calm', { kind: 'milestone', at: 0, word: 'HUNDRED' }, 800).beams).toBe(1);
    expect(arenaFrame('calm', { kind: 'milestone', at: 0, word: 'HUNDRED' }, 800).word).toBe('HUNDRED');
    expect(arenaFrame('calm', { kind: 'four', at: 0 }, 800).beams).toBe(0);
    expect(arenaFrame('calm', { kind: 'wicket', at: 0 }, 800).beams).toBe(0);
  });

  it('goes to red for a wicket, then down nearly to dark, then back', () => {
    const red = arenaFrame('calm', { kind: 'wicket', at: 0 }, 100);
    expect(hex(red.halo)).toBe(ARENA.out);
    const dark = arenaFrame('calm', { kind: 'wicket', at: 0 }, 700);
    expect(dark.halo.r + dark.halo.g + dark.halo.b).toBeLessThan(.3);
    expect(dark.word).toBe('WICKET');
    const after = arenaFrame('calm', { kind: 'wicket', at: 0 }, CUES.wicket.ms);
    expect(hex(after.halo)).toBe(ARENA.halo);
    expect(after.word).toBeNull();
  });

  it('lets every moment go back into the mood it was in', () => {
    for (const kind of Object.keys(CUES) as (keyof typeof CUES)[]) {
      const over = arenaFrame('surge', { kind, at: 0 }, CUES[kind].ms + 1, true);
      expect(hex(over.halo)).toBe(ARENA.surge);
      expect(over.word).toBeNull();
    }
  });

  it('forgets a moment from before the clock went back to nought, a new innings', () => {
    expect(arenaFrame('calm', { kind: 'six', at: 5000 }, 200).word).toBeNull();
  });

  it('under reduced motion changes colour and says the word, and nothing runs, strobes or sweeps', () => {
    for (const kind of Object.keys(CUES) as (keyof typeof CUES)[]) for (let t = 0; t < CUES[kind].ms; t += 100) {
      const f = arenaFrame('calm', { kind, at: 0 }, t, true);
      expect(f.chase).toBe(0);
      expect(f.beams).toBe(0);
      expect(f.word).not.toBeNull();
    }
    // Power Surge's breathing stands still too.
    expect(hex(arenaFrame('surge', null, 400, true).halo)).toBe(hex(arenaFrame('surge', null, 900, true).halo));
  });
});
