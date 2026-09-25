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

/**
 * The career card's own captions.
 *
 * The playable link goes in the WhatsApp text and not only on the picture,
 * which is the whole difference between a brag and an invitation: a thread full
 * of somebody's numbers is a thread where nobody can go and beat them. The
 * picture carries the address painted on as well, for the trip through
 * Instagram where no text survives at all.
 *
 * The figure quoted is the one the card leads on — career runs in the Blast,
 * balls faced in the Test match — because a message that opens with a number
 * has to open with the same number the picture does.
 */
export const statsShareText = (lead: { label: string; value: number }, innings: number, url: string) =>
  `${lead.value} ${lead.label.toLowerCase()} across ${innings} ${innings === 1 ? 'innings' : 'innings'} on Hitman Cricket. Beat my numbers: ${url}`;

export const statsWhatsappLink = (lead: { label: string; value: number }, innings: number, url: string) =>
  `https://wa.me/?text=${encodeURIComponent(statsShareText(lead, innings, url))}`;

/** What rides along with the story picture, wherever the sheet sends it. */
export const statsStoryText = (lead: { label: string; value: number }, innings: number, url: string) =>
  `${lead.value} ${lead.label.toLowerCase()} across ${innings} ${innings === 1 ? 'innings' : 'innings'} on Hitman Cricket. Play at ${url}`;

/** The card travels as a PNG for its flat colour and sharp type; the story is a
    photograph with type on it, so it travels as a JPEG. */
export const statsFileName = (kind: 'card' | 'story') =>
  `hitman-cricket-career-${kind}.${kind === 'story' ? 'jpg' : 'png'}`;

/**
 * The message a player sends themselves to keep their key.
 *
 * Their name is in it because the key alone opens nothing — the pair is what
 * brings a record back, and a key saved without the name it belongs to is half
 * a lifeline. The link rides along so the message is also the way back in: a
 * year from now, on a new phone, what they will find is this message, and it
 * should carry everything needed rather than just the half that is secret.
 */
export const keyShareText = (name: string, code: string, url: string) =>
  `My Hitman Cricket career key\n\nName: ${name}\nKey: ${code}\n\n`
  + `Keep this message. The two together bring my record back on any phone. ${url}`;

export const keyWhatsappLink = (name: string, code: string, url: string) =>
  `https://wa.me/?text=${encodeURIComponent(keyShareText(name, code, url))}`;
