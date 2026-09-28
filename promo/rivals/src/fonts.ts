// Jaro and Satoshi, the game's own faces, loaded before the first frame renders.
import { continueRender, delayRender, staticFile } from 'remotion';

const handle = delayRender('Loading Jaro and Satoshi');
const faces = [
  new FontFace('Jaro', `url(${staticFile('fonts/jaro-latin.woff2')}) format('woff2')`),
  new FontFace('Satoshi', `url(${staticFile('fonts/satoshi-latin.woff2')}) format('woff2')`, { weight: '300 900' }),
];
Promise.all(faces.map(face => face.load()))
  .then(loaded => {
    loaded.forEach(face => document.fonts.add(face));
    continueRender(handle);
  })
  .catch(err => {
    console.error(err);
    continueRender(handle);
  });
