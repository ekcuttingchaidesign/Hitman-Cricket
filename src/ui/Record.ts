import type { RivalsRecord } from '../game/challenge-api';

export type { RivalsRecord } from '../game/challenge-api';

/**
 * The Rivals record: matches won, lost and drawn, as three figures in a row.
 *
 * It stands at the top of Rival Matches and under the cards on My Stats, and it
 * is one drawing so the two cannot disagree about what a record looks like.
 * A player with no finished match sees three noughts rather than nothing: the
 * noughts are the invitation.
 */
export function recordMarkup(record: RivalsRecord, title = 'YOUR RECORD', extra = ''): string {
  const cell = (n: number, word: string, tone: string) =>
    `<span class="rival-record-cell ${tone}"><b>${n}</b><i>${word}</i></span>`;
  const total = record.won + record.lost + record.drawn;
  return `<section class="rival-record${extra ? ` ${extra}` : ''}" aria-label="${title.toLowerCase()}: ${record.won} won, ${record.lost} lost, ${record.drawn} drawn">
    <h3 class="rival-section-head">${title}<small>${total} match${total === 1 ? '' : 'es'}</small></h3>
    <div class="rival-record-row">
      ${cell(record.won, 'Won', 'is-won')}${cell(record.lost, 'Lost', 'is-lost')}${cell(record.drawn, 'Drawn', 'is-drawn')}
    </div>
  </section>`;
}
