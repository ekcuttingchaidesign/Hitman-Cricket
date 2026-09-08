/**
 * A ground's scoreboard, drawn the way a real one is: a grid of lamps, most of
 * them dark. The unlit dots are the point — they are what makes a panel read as
 * a board rather than as text in a box — so both layers are drawn.
 *
 * Faces are 7 rows tall and as wide as their rows; punctuation is narrow, so a
 * score reads 5.0 rather than 5 . 0.
 */
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '01010'],
  '.': ['00', '00', '00', '00', '00', '11', '11'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
};
const ROWS = 7;
/** One blank column between faces, the way the lamps are spaced on a board. */
const GAP = 1;
const face = (character: string) => GLYPHS[character.toUpperCase()] ?? GLYPHS['-'];

/** The width in lamps of a string, so a caller can size a slot before drawing. */
export function matrixWidth(text: string) {
  return [...text].reduce((total, character) => total + face(character)[0].length + GAP, 0) - GAP;
}

/** The panel as SVG: every lamp on the grid, lit ones marked. */
export function dotMatrix(text: string, label = text) {
  const width = Math.max(1, matrixWidth(text));
  const off: string[] = [], on: string[] = [];
  let column = 0;
  for (const character of text) {
    const rows = face(character);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < rows[y].length; x++) {
        const lamp = `<circle cx="${column + x + .5}" cy="${y + .5}" r=".4"/>`;
        (rows[y][x] === '1' ? on : off).push(lamp);
      }
    column += rows[0].length + GAP;
  }
  return `<svg class="matrix" viewBox="0 0 ${width} ${ROWS}" style="--lamps:${width}" role="img" aria-label="${label}">`
    + `<g class="matrix-dark">${off.join('')}</g><g class="matrix-lit">${on.join('')}</g></svg>`;
}
