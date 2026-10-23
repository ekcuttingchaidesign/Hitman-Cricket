import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARENA, CUES, FLASH, MILESTONE_WORDS, MOST_FLASHES, Showboards, TORCHES, arenaFrame, arenaStands, screenFrom, slamScale, stingOf, stumpLight, type ArenaCue, type ArenaMood } from '../src/scene/arena';
import { paintless } from './paintless';
import { WAVE, waveAt } from '../src/scene/crowdLife';
import { buildGround, groundFrom, nightOnly, ownFloodlights } from '../src/scene/grounds';
import { STADIUM } from '../src/scene/stadium';

const KINDS = Object.keys(CUES) as ArenaCue[];
const MOODS: ArenaMood[] = ['calm', 'surge', 'death'];
const built = () => { const world = new THREE.Group(); const lights = arenaStands(world); return { world, lights }; };
const crowdOf = (world: THREE.Object3D) => {
  const crowd: THREE.InstancedMesh[] = [];
  world.traverse(object => { if (object instanceof THREE.InstancedMesh) crowd.push(object); });
  return crowd;
};
/** How many times the floodlights strike up from under a flash over `ms`, sampled every frame. */
function flashes(mood: ArenaMood, cue: { kind: ArenaCue; at: number } | null, from: number, ms: number, still = false) {
  let count = 0, was = false;
  for (let t = from; t < from + ms; t += 1000 / 60) {
    const flash = arenaFrame(mood, cue, t, still).lamps >= FLASH;
    if (flash && !was) count++;
    was = flash;
  }
  return count;
}
/** Every colour the crowd is wearing. */
const shirts = (world: THREE.Object3D) => {
  const [crowd] = crowdOf(world);
  const seen = new Set<number>(), colour = new THREE.Color();
  for (let i = 0; i < crowd.count; i++) { crowd.getColorAt(i, colour); seen.add(colour.getHex()); }
  return seen;
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

  it('is lit by a ring of lamps round the whole roof, and stands up no towers', () => {
    const { lights } = built();
    expect(lights.towers).toHaveLength(0);
    expect(lights.roof.length).toBeGreaterThan(100);
    const quarters = new Set(lights.roof.map(p => Math.floor((Math.atan2(p.x, p.z - 10) + Math.PI) / (Math.PI / 2)) % 4));
    expect(quarters.size).toBe(4);
    expect(buildGround('stadium', new THREE.Group())!.towers).toHaveLength(4);
  });

  it('seats the stadium\'s own crowd, and keeps its white sightscreen for the red ball', () => {
    const stadium = new THREE.Group(); buildGround('stadium', stadium);
    expect([...shirts(built().world)].sort()).toEqual([...shirts(stadium)].sort());
    const colours = new Set<number>();
    built().world.traverse(o => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) colours.add((o.material as THREE.MeshStandardMaterial).color.getHex()); });
    expect(colours.has(STADIUM.cover)).toBe(true);
    expect(colours.has(ARENA.ink)).toBe(false);
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

  it('burns its floodlights at the night\'s own at rest, its boards idle, and the idle boards at 40% while the ball is live', () => {
    const calm = arenaFrame('calm', null, 5000);
    expect(calm.lamps).toBe(1);
    expect(calm.torches).toBe(TORCHES.calm);
    expect(calm.board).toBe('idle');
    expect(calm.word).toBeNull();
    expect(calm.boards).toBe(1);
    expect(arenaFrame('calm', null, 5000, false, true).boards).toBe(.4);
    // A moment's board is never dimmed: it is the news.
    expect(arenaFrame('calm', { kind: 'four', at: 0 }, 300, false, true).boards).toBe(1);
  });

  it('puts more phone torches up as the game gets tight, and never flashes the floodlights for a mood alone', () => {
    expect(TORCHES.calm).toBeLessThan(TORCHES.surge);
    expect(TORCHES.surge).toBeLessThan(TORCHES.death);
    for (const mood of MOODS) {
      expect(arenaFrame(mood, null, 1234).torches).toBe(TORCHES[mood]);
      expect(flashes(mood, null, 0, 6000)).toBe(0);
    }
    // A six and a milestone put the phones up; they come down with the moment.
    expect(arenaFrame('calm', { kind: 'six', at: 0 }, 1000).torches).toBe(TORCHES.moment);
    expect(arenaFrame('calm', { kind: 'milestone', at: 0 }, 1000).torches).toBe(TORCHES.moment);
    expect(arenaFrame('calm', { kind: 'six', at: 0 }, CUES.six.ms + 1).torches).toBe(TORCHES.calm);
  });

  it('strikes the floodlights once for a four and crackles them for a six', () => {
    expect(arenaFrame('calm', { kind: 'four', at: 0 }, 40).lamps).toBeGreaterThanOrEqual(FLASH);
    expect(arenaFrame('calm', { kind: 'four', at: 0 }, 700).lamps).toBe(1);
    expect(flashes('calm', { kind: 'four', at: 0 }, 0, CUES.four.ms)).toBe(1);
    expect(flashes('calm', { kind: 'six', at: 0 }, 0, CUES.six.ms)).toBe(3);
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

  it('takes the lights down for a wicket and brings them back', () => {
    expect(arenaFrame('calm', { kind: 'wicket', at: 0 }, 700).lamps).toBeLessThan(.5);
    expect(arenaFrame('calm', { kind: 'wicket', at: 0 }, CUES.wicket.ms).lamps).toBe(1);
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
      expect(over.lamps).toBe(1);
      expect(over.word).toBeNull();
      expect(over.board).toBe('idle');
    }
  });

  it('lights the LED stumps as the sheet has them: rings at 60% at rest, then strike, raspberry, one dip, hold, and back', () => {
    const rest = stumpLight(-1);
    expect(rest.rings).toEqual({ colour: ARENA.volt, level: .6 });
    expect(rest.crown.level).toBe(0); expect(rest.bails.level).toBe(0);
    expect(stumpLight(20).crown.colour).toBe(ARENA.white);
    expect(stumpLight(100).crown).toEqual({ colour: ARENA.wicket, level: 1 });
    expect(stumpLight(300).rings.level).toBe(.3);
    expect(stumpLight(1500).bails).toEqual({ colour: ARENA.wicket, level: 1 });
    expect(stumpLight(3000)).toEqual(rest);
    // Two flashes and a hold: never more than three a second.
    let flashes = 0, was = 0;
    for (let t = 0; t < 3000; t += 1000 / 60) { const level = stumpLight(t).crown.level; if (level >= 1 && was < 1) flashes++; was = level; }
    expect(flashes).toBeLessThanOrEqual(MOST_FLASHES);
    // Raspberry only once a bail has gone; under reduced motion no flash and no dip.
    for (let t = 0; t < 2400; t += 50) { expect(stumpLight(t, true).crown).toEqual({ colour: ARENA.wicket, level: 1 }); }
  });

  it('forgets a moment from before the clock went back to nought, a new innings', () => {
    expect(arenaFrame('calm', { kind: 'six', at: 5000 }, 200).word).toBeNull();
  });

  it('under reduced motion says the word, and nothing runs, strikes or flickers', () => {
    for (const mood of MOODS) for (const kind of KINDS) for (let t = 0; t < CUES[kind].ms; t += 100) {
      const f = arenaFrame(mood, { kind, at: 0 }, t, true);
      expect(f.chase).toBe(0);
      expect(f.word).not.toBeNull();
    }
    for (const kind of KINDS) expect(flashes('calm', { kind, at: 0 }, 0, CUES[kind].ms, true)).toBe(0);
  });
});

describe('the boards any ground carries', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  /** The boards along the rope as the stadium builds them: the sponsors' faces, lit a little by day. */
  const rope = () => {
    const sponsors = new THREE.Texture();
    return { sponsors, material: new THREE.MeshStandardMaterial({ map: sponsors, emissiveMap: sponsors, emissive: 0xffffff, emissiveIntensity: .35 }) };
  };

  it('keeps a board\'s own face between moments, puts the brand\'s up in one, and hands back at the night\'s level', () => {
    paintless();
    const { sponsors, material } = rope();
    const show = new Showboards(null);
    show.ring(material, 30, true); show.lit(.35);
    expect(show.update(0, false, true).board).toBe('idle');
    expect(material.map).toBe(sponsors);
    expect(material.emissiveIntensity).toBe(.35);
    expect(material.color.getHex()).toBe(0xffffff);
    show.cue('four', 1000);
    const f = show.update(1100, false, false);
    expect(f.board).toBe('four');
    expect(material.map).not.toBe(sponsors);
    expect(material.emissiveMap).toBe(material.map);
    expect(material.emissiveIntensity).toBe(1);
    expect(show.state).toMatchObject({ word: 'FOUR', board: 'four', screen: null, sting: null });
    // Night fell while the word was up: the sponsors come back at the night's level.
    show.lit(1);
    expect(show.update(1000 + CUES.four.ms, false, false).board).toBe('idle');
    expect(material.map).toBe(sponsors);
    expect(material.emissiveMap).toBe(sponsors);
    expect(material.emissiveIntensity).toBe(1);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(show.state).toMatchObject({ word: null, board: 'idle', sting: null });
  });

  it('shows the brand\'s idle on a board that is the brand\'s, at 40% while the ball is live', () => {
    paintless();
    const ribbon = new THREE.MeshBasicMaterial();
    const show = new Showboards(null);
    show.ring(ribbon, 20);
    show.update(0, false, true);
    expect(ribbon.map).not.toBeNull();
    expect(ribbon.color.r).toBeCloseTo(.4);
    show.update(16, false, false);
    expect(ribbon.color.r).toBe(1);
    // The same face for the same state and lap, painted once.
    const idle = ribbon.map;
    show.cue('six', 100); show.update(200, false, false);
    expect(ribbon.map).not.toBe(idle);
    show.update(100 + CUES.six.ms, false, false);
    expect(ribbon.map).toBe(idle);
  });

  it('lets a moment go when its ground goes out of sight, and when a new innings starts the clock again', () => {
    paintless();
    const { sponsors, material } = rope();
    const show = new Showboards(null);
    show.ring(material, 30, true); show.lit(.35);
    show.cue('wicket', 500, 'BOWLED'); show.update(600, false, false);
    expect(show.state).toMatchObject({ word: 'BOWLED', board: 'wicket' });
    show.rest();
    expect(material.map).toBe(sponsors);
    expect(material.emissiveIntensity).toBe(.35);
    expect(show.state).toMatchObject({ word: null, board: 'idle' });
    show.cue('six', 5000); show.update(5100, false, false);
    expect(show.state.word).toBe('SIX');
    expect(show.update(0, false, false).word).toBeNull();
    expect(material.map).toBe(sponsors);
  });
});
