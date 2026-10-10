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

/**
 * The record at the head of Rival Matches, as UI v1 draws it (133:7037): won,
 * lost and drawn in the big face, the last four results as chips, and a bar
 * split by wins and losses. An empty record keeps its four empty chips.
 */
export function rivalsRecordMarkup(record: RivalsRecord, form: readonly ('W' | 'L' | 'D')[] = []): string {
  const n = (value: number, word: string, tone: string) =>
    `<span class="rv-n ${tone}"><b>${value}</b><i>${word}</i></span>`;
  const chips = Array.from({ length: 4 }, (_, i) => form[i]
    ? `<i class="rv-chip is-${form[i]}">${form[i]}</i>`
    : '<i class="rv-chip is-empty"></i>').join('');
  const decided = record.won + record.lost;
  const share = decided
    ? `<i class="is-won" style="flex:${record.won}"></i><i class="is-lost" style="flex:${record.lost}"></i>`
    : '<i class="is-none" style="flex:1"></i>';
  return `<section class="rival-record rv-record" aria-label="Your record: ${record.won} won, ${record.lost} lost, ${record.drawn} drawn">
    <div class="rv-scoreline">
      <div class="rv-score">${n(record.won, 'WON', 'is-won')}${n(record.lost, 'LOST', 'is-lost')}${n(record.drawn, 'DRAWN', 'is-drawn')}</div>
      <div class="rv-form"><span>${form.length ? `LAST ${form.length}` : 'FORM'}</span><span class="rv-chips">${chips}</span></div>
    </div>
    <div class="rv-share" aria-hidden="true">${share}</div>
  </section>`;
}
