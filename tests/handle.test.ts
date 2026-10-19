import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handleOf, isHandle, sha256 } from '../src/game/handle';

const node = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256', () => {
  it('matches Node on the empty string, a short one and the block boundaries', () => {
    for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(119), 'x'.repeat(1000)]) {
      expect(sha256(text)).toBe(node(text));
    }
  });

  it('hashes the UTF-8 bytes, so names with accents and emoji agree too', () => {
    for (const text of ['José', 'शशांक', '🏏 six', 'mlx3k9-a1b2c3d4e5f6']) expect(sha256(text)).toBe(node(text));
  });
});

describe('handleOf', () => {
  it('is sixteen hex digits, the same every time, and different for every id', () => {
    const a = handleOf('mlx3k9-a1b2c3d4e5f6'), b = handleOf('mlx3k9-a1b2c3d4e5f7');
    expect(isHandle(a)).toBe(true);
    expect(handleOf('mlx3k9-a1b2c3d4e5f6')).toBe(a);
    expect(a).not.toBe(b);
  });

  it('is not the id, nor a plain hash of it', () => {
    const id = 'mlx3k9-a1b2c3d4e5f6';
    expect(handleOf(id)).not.toContain(id);
    expect(node(id).startsWith(handleOf(id))).toBe(false);
  });

  it('turns away anything not shaped like one', () => {
    for (const bad of ['', 'mlx3k9-a1b2c3d4e5f6', 'ABCDEF0123456789', '0123456789abcde', 7, null]) expect(isHandle(bad)).toBe(false);
  });
});
