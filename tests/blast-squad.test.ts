import { describe, expect, it } from 'vitest';
import { BLAST_NUMBERS, BLAST_POOL, blastMates, gearFor } from '../src/game/blast-squad';
import { GLOVES } from '../src/entities/gloves';

describe("the Blast's teammates", () => {
  it('sends out two different men, each with his place and number, from the squads’ batters', () => {
    for (let i = 0; i < 200; i++) {
      const [two, three] = blastMates();
      expect(two.name).not.toBe(three.name);
      expect(BLAST_POOL).toContain(two.name); expect(BLAST_POOL).toContain(three.name);
      expect(two.walkOut).toBe(`NO. 2 · ${two.name.toUpperCase()} #${BLAST_NUMBERS[0]}`);
      expect(three.walkOut).toBe(`NO. 3 · ${three.name.toUpperCase()} #${BLAST_NUMBERS[1]}`);
    }
  });

  it('draws from every end of the pool, so the side is not the same pair every innings', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) blastMates().forEach(mate => seen.add(mate.name));
    expect(seen.size).toBe(BLAST_POOL.length);
    expect(BLAST_POOL.length).toBeGreaterThanOrEqual(20);
    expect(new Set(BLAST_POOL).size).toBe(BLAST_POOL.length);
  });

  it('never dresses a man in what the man before him wore, where there is anything else', () => {
    for (let r = 0; r < 1; r += .01) {
      const guard = gearFor(GLOVES, [GLOVES[0].id, GLOVES[3].id], r);
      expect([GLOVES[0].id, GLOVES[3].id]).not.toContain(guard.id);
    }
    // With nothing else to wear, he wears the same.
    expect(gearFor([GLOVES[0]], [GLOVES[0].id], .5)).toBe(GLOVES[0]);
  });
});

describe("a teammate's face", () => {
  it('is one of the men’s, the same for a name every time, and never the player’s', async () => {
    const { mateFace, MATE_FACES } = await import('../src/game/blast-squad');
    for (const name of BLAST_POOL) for (let yours = 0; yours < 5; yours++) {
      const face = mateFace(name, yours);
      expect(MATE_FACES).toContain(face);
      expect(face).not.toBe(yours);
      expect(mateFace(name, yours)).toBe(face);
    }
  });
});
