import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA, ARENA_CROWD, CUES, MILESTONE_WORDS, MOST_FLASHES, arenaFrame, arenaStands, screenFrom, slamScale, stingOf, type ArenaCue, type ArenaMood } from '../src/scene/arena';
import { WAVE, waveAt } from '../src/scene/crowdLife';
import { buildGround, groundFrom, nightOnly, ownFloodlights } from '../src/scene/grounds';

const hex = (c: THREE.Color) => c.getHex();
const KINDS = Object.keys(CUES) as ArenaCue[];
const MOODS: ArenaMood[] = ['calm', 'surge', 'death'];
const built = () => { const world = new THREE.Group(); const lights = arenaStands(world); return { world, lights }; };
const crowdOf = (world: THREE.Object3D) => {
  const crowd: THREE.InstancedMesh[] = [];
  world.traverse(object => { if (object instanceof THREE.InstancedMesh) crowd.push(object); });
  return crowd;
};
/** How many times the halo goes up to lime from something else over `ms`, sampled every frame. */
function flashes(mood: ArenaMood, cue: { kind: ArenaCue; at: number } | null, from: number, ms: number) {
  let count = 0, was = false;
  for (let t = from; t < from + ms; t += 1000 / 60) {
    const lime = hex(arenaFrame(mood, cue, t).halo) === ARENA.volt;
    if (lime && !was) count++;
    was = lime;
  }
  return count;
}

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

  it('is lit by a ring of lamps round the whole roof, and stands up no towers', () => {
    const { lights } = built();
    expect(lights.towers).toHaveLength(0);
    expect(lights.roof.length).toBeGreaterThan(100);
    const quarters = new Set(lights.roof.map(p => Math.floor((Math.atan2(p.x, p.z - 10) + Math.PI) / (Math.PI / 2)) % 4));
    expect(quarters.size).toBe(4);
    expect(buildGround('stadium', new THREE.Group())!.towers).toHaveLength(4);
  });

  it('seats the two sides in their colours, a section each, where the stadium has its summer whites', () => {
    const [crowd] = crowdOf(built().world);
    const allowed = new Set(ARENA_CROWD.flat());
    const seen = new Set<number>();
    const colour = new THREE.Color();
    for (let i = 0; i < crowd.count; i++) { crowd.getColorAt(i, colour); seen.add(colour.getHex()); }
    for (const c of seen) expect(allowed.has(c)).toBe(true);
    expect(seen.has(ARENA_CROWD[0][0]) && seen.has(ARENA_CROWD[1][0])).toBe(true);
  });

  it('keeps the eyeline dark: the sightscreen and the covered seats are ink, in the arena and nowhere else', () => {
    const colours = (world: THREE.Object3D) => {
      const found = new Set<number>();
      world.traverse(o => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) found.add((o.material as THREE.MeshStandardMaterial).color.getHex()); });
      return found;
    };
    expect(colours(built().world).has(ARENA.ink)).toBe(true);
    const stadium = new THREE.Group(); buildGround('stadium', stadium);
    expect(colours(stadium).has(ARENA.ink)).toBe(false);
  });

  it('brings the crowd to life on its own materials, never the scenery\'s shared ones, and only in the arena', () => {
    const { world, lights } = built();
    const [bodies, heads] = crowdOf(world);
    expect(lights.life && lights.seats?.length).toBeTruthy();
    for (const mesh of [bodies, heads]) expect((mesh.material as THREE.Material).customProgramCacheKey()).toBe('crowd-life');
    const stadium = new THREE.Group(); const plain = buildGround('stadium', stadium)!;
    expect(plain.life).toBeUndefined();
  });

  it('sends a wave a lap and a bit round the ground, coming up and going down gently', () => {
    expect(waveAt(-1).on).toBe(0);
    expect(waveAt(0).on).toBe(0);
    expect(waveAt(WAVE.lap * WAVE.laps).on).toBe(0);
    expect(waveAt(WAVE.lap / 2).on).toBe(1);
    // It goes round, and through the far end (straight, nought) in its first lap.
    const front = (t: number) => waveAt(t).at;
    expect(front(WAVE.lap) - front(0)).toBeCloseTo(Math.PI * 2, 5);
    expect(front(0)).toBeLessThan(0);
    expect(front(WAVE.lap / 2)).toBeGreaterThan(0);
  });

  it('is violet at rest, its boards idle, and the idle boards at 40% while the ball is live', () => {
    const calm = arenaFrame('calm', null, 5000);
    expect(hex(calm.halo)).toBe(ARENA.violet);
    expect(calm.board).toBe('idle');
    expect(calm.word).toBeNull();
    expect(calm.beams).toBe(0);
    expect(calm.boards).toBe(1);
    expect(arenaFrame('calm', null, 5000, false, true).boards).toBe(.4);
    // A moment's board is never dimmed: it is the news.
    expect(arenaFrame('calm', { kind: 'four', at: 0 }, 300, false, true).boards).toBe(1);
  });

  it('charges the roof lime for Power Surge, and crackles it in the death overs, never in red', () => {
    for (let t = 0; t < 3000; t += 97) {
      const surge = arenaFrame('surge', null, t).halo;
      expect(surge.g).toBeGreaterThan(surge.b);
      for (const mood of MOODS) {
        const h = arenaFrame(mood, null, t).halo;
        expect(h.r > .8 && h.g < .4 && h.b < .5).toBe(false);
      }
    }
    expect(flashes('death', null, 0, 2600)).toBeGreaterThan(0);
  });

  it('puts the brand\'s board up for each moment: four, six, wicket, and a word on its plate for the rest', () => {
    expect(arenaFrame('calm', { kind: 'four', at: 0 }, 300).board).toBe('four');
    expect(arenaFrame('calm', { kind: 'six', at: 0 }, 300).board).toBe('six');
    expect(arenaFrame('calm', { kind: 'wicket', at: 0 }, 300).board).toBe('wicket');
    for (const kind of ['milestone', 'surge', 'death'] as const) expect(arenaFrame('calm', { kind, at: 0 }, 300).board).toBe('word');
  });

  it('says a figure for a milestone, never the number in words', () => {
    for (const word of Object.values(MILESTONE_WORDS)) expect(word).toMatch(/^\d/);
    expect(arenaFrame('calm', { kind: 'milestone', at: 0, word: '100' }, 800).word).toBe('100');
  });

  it('puts the searchlights up for a six and a milestone, and not for a four or a wicket', () => {
    expect(arenaFrame('calm', { kind: 'six', at: 0 }, 800).beams).toBe(1);
    expect(arenaFrame('calm', { kind: 'milestone', at: 0, word: '100' }, 800).beams).toBe(1);
    expect(arenaFrame('calm', { kind: 'four', at: 0 }, 800).beams).toBe(0);
    expect(arenaFrame('calm', { kind: 'wicket', at: 0 }, 800).beams).toBe(0);
  });

  it('takes the lights down for a wicket and brings them back', () => {
    const down = arenaFrame('calm', { kind: 'wicket', at: 0 }, 700).halo;
    const up = arenaFrame('calm', { kind: 'wicket', at: 0 }, CUES.wicket.ms).halo;
    expect(down.r + down.g + down.b).toBeLessThan(.6);
    expect(hex(up)).toBe(ARENA.violet);
  });

  it('flashes nothing more than three times a second, whatever is up', () => {
    for (const mood of MOODS) for (const kind of KINDS) {
      const cue = { kind, at: 0 };
      for (let from = 0; from < CUES[kind].ms; from += 250) expect(flashes(mood, cue, from, 1000)).toBeLessThanOrEqual(MOST_FLASHES);
    }
  });

  it('plays a sting where the brand has one: the boundaries, and a wicket by how he went', () => {
    expect(stingOf('four', null)).toBe('four');
    expect(stingOf('six', null)).toBe('six');
    expect(stingOf('wicket', 'BOWLED')).toBe('bowled');
    expect(stingOf('wicket', 'DUCK')).toBe('duck');
    expect(stingOf('wicket', 'OUT')).toBe('out');
    for (const kind of ['milestone', 'surge', 'death'] as const) expect(stingOf(kind, null)).toBeNull();
  });

  it('slams a word on from big, overshoots once and settles by eleven frames', () => {
    expect(slamScale(0)).toBeGreaterThan(1.8);
    const scales = Array.from({ length: 30 }, (_, i) => slamScale(i * 1000 / 30));
    expect(Math.min(...scales)).toBeLessThan(1);
    expect(slamScale(11 * 1000 / 30 + 5)).toBe(1);
    // Down, past one, and back: one overshoot.
    let turns = 0;
    for (let i = 2; i < scales.length; i++) if (Math.sign(scales[i] - scales[i - 1]) !== Math.sign(scales[i - 1] - scales[i - 2]) && scales[i] !== scales[i - 1]) turns++;
    expect(turns).toBeLessThanOrEqual(2);
  });

  it('lets every moment go back into the mood it was in', () => {
    for (const kind of KINDS) {
      const over = arenaFrame('calm', { kind, at: 0 }, CUES[kind].ms + 1, true);
      expect(hex(over.halo)).toBe(ARENA.violet);
      expect(over.word).toBeNull();
      expect(over.board).toBe('idle');
    }
  });

  it('forgets a moment from before the clock went back to nought, a new innings', () => {
    expect(arenaFrame('calm', { kind: 'six', at: 5000 }, 200).word).toBeNull();
  });

  it('under reduced motion changes colour and says the word, and nothing runs, flickers or sweeps', () => {
    for (const mood of MOODS) for (const kind of KINDS) for (let t = 0; t < CUES[kind].ms; t += 100) {
      const f = arenaFrame(mood, { kind, at: 0 }, t, true);
      expect(f.chase).toBe(0);
      expect(f.beams).toBe(0);
      expect(f.word).not.toBeNull();
    }
    expect(hex(arenaFrame('surge', null, 400, true).halo)).toBe(hex(arenaFrame('surge', null, 900, true).halo));
    expect(hex(arenaFrame('death', null, 100, true).halo)).toBe(ARENA.violet);
  });
});
