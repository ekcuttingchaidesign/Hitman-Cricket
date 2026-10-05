import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

describe('the stylesheet', () => {
  // A brace left behind by an edit takes every style in the game with it, and
  // nothing else in the unit tests reads the file: the first to know was a
  // browser check finding no play key on a page with no styles.
  it('parses', () => {
    expect(() => postcss.parse(readFileSync(join(__dirname, '../src/styles.css'), 'utf8'))).not.toThrow();
  });
});
