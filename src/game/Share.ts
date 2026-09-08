/** The link a friend follows: this game, without whatever seed or debug flag is on. */
export const gameLink = () => new URL(location.pathname, location.origin).href;
export const shareText = (runs: number, url: string) =>
  `I scored ${runs} runs on Hitman Cricket, Can you beat my score ${url}`;
export const whatsappLink = (runs: number, url: string) =>
  `https://wa.me/?text=${encodeURIComponent(shareText(runs, url))}`;
