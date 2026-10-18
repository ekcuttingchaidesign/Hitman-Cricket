import { describe, expect, it } from 'vitest';
import {
  BIO_BLOCKED_REASON, BIO_CONTACT_REASON, BIO_MAX, bioChars, bioProblem, cleanBio,
} from '../src/server/bio-rules';

describe('cleanBio', () => {
  it('folds line breaks and runs of spaces to one, and trims', () => {
    expect(cleanBio('  Leg-side   bully.\n\nPulls everything short.  ')).toBe('Leg-side bully. Pulls everything short.');
  });

  it('drops the invisible characters a name loses too', () => {
    expect(cleanBio('Six​ or‮ nothing')).toBe('Six or nothing');
  });

  it('cuts to eighty as it looks, so an emoji is one and never half of one', () => {
    const long = '🏏'.repeat(100);
    expect(bioChars(cleanBio(long))).toHaveLength(BIO_MAX);
    expect(cleanBio('a'.repeat(120))).toHaveLength(BIO_MAX);
  });

  it('is empty for anything that is not text', () => {
    for (const bad of [null, undefined, 7, {}, ['x']]) expect(cleanBio(bad)).toBe('');
  });
});

describe('bioProblem', () => {
  it('keeps an ordinary line, and an empty one (which removes the bio)', () => {
    for (const fine of ['Leg-side bully. Pulls everything short.', 'Six or nothing.', 'Opener. 100% commitment, 0% defence.', 'Hits 6s for fun', 'Scunthorpe’s finest cover drive', '']) {
      expect(bioProblem(fine), fine).toBeNull();
    }
  });

  it('refuses a way to reach somebody', () => {
    for (const contact of [
      'DM me on insta @kabir_99 for nets', 'mail me kabir@gmail.com', 'www.kabir.in', 'https://x.com/k',
      'kabircricket.com', 'call 98765 43210', '+91-98765-43210', 'add me on snapchat', 'whatsapp me',
    ]) expect(bioProblem(contact), contact).toBe(BIO_CONTACT_REASON);
  });

  it('lets a score through that looks a little like a number', () => {
    for (const fine of ['Best 187, then 196', 'Sachin 100 x 100', '6 6 6 6 6 6']) expect(bioProblem(fine), fine).toBeNull();
  });

  it('refuses a word the names refuse, alone or spelled out', () => {
    for (const bad of ['total shit batter', 'f u c k the bowlers', 'Chutiya bowler', 'bullshit umpiring', 'fucking legend']) expect(bioProblem(bad), bad).toBe(BIO_BLOCKED_REASON);
  });

  it('does not find a word across the gap between two words', () => {
    expect(bioProblem('sab itch to bat')).toBeNull();
  });
});
