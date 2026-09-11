/** The link a friend follows: this game, without whatever seed or debug flag is on. */
export const gameLink = () => new URL(location.pathname, location.origin).href;
export const shareText = (runs: number, url: string) =>
  `I scored ${runs} runs on Hitman Cricket, Can you beat my score ${url}`;
export const whatsappLink = (runs: number, url: string) =>
  `https://wa.me/?text=${encodeURIComponent(shareText(runs, url))}`;

/** The caption that rides along with the picture, wherever the sheet sends it. */
export const storyText = (runs: number, url: string) =>
  `${runs} runs on Hitman Cricket. Five overs, three wickets. Play at ${url}`;

/** The card travels as a PNG for its flat colour and sharp type; the story is a
    photograph with type on it, so it travels as a JPEG. */
export const shareFileName = (runs: number, kind: 'card' | 'story') =>
  `hitman-cricket-${runs}-runs-${kind}.${kind === 'story' ? 'jpg' : 'png'}`;
export const shareFileType = (kind: 'card' | 'story') =>
  kind === 'story' ? 'image/jpeg' : 'image/png';
