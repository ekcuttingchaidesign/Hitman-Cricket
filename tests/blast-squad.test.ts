import { describe, expect, it } from 'vitest';
import { BLAST_NUMBERS, NEW_BATSMAN, blastMates, gearFor } from '../src/game/blast-squad';
import { GLOVES } from '../src/entities/gloves';

describe("the Blast's teammates", () => {
  it('sends out No. 2 and No. 3 unnamed, as a new batsman in, each with his number', () => {
    const [two, three] = blastMates();
    expect(two.walkOut).toBe(`NO. 2 · ${NEW_BATSMAN} #${BLAST_NUMBERS[0]}`);
    expect(three.walkOut).toBe(`NO. 3 · ${NEW_BATSMAN} #${BLAST_NUMBERS[1]}`);
    expect(NEW_BATSMAN.length).toBeLessThanOrEqual(15);
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
    for (const name of blastMates().map(mate => mate.walkOut)) for (let yours = 0; yours < 5; yours++) {
      const face = mateFace(name, yours);
      expect(MATE_FACES).toContain(face);
      expect(face).not.toBe(yours);
      expect(mateFace(name, yours)).toBe(face);
    }
  });
});
