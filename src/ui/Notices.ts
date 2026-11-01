import { MODE_NAME, noticeGroups, type Notice, type NoticeFilter } from '../game/notices';
import { cta, icon } from './Kit';
import { escape, kitMarkup } from './Leaderboard';

/**
 * The Notifications screen, drawn (Figma section 23, E2 to E4): a back key
 * and the title, the four filters, then NEEDS YOU, TODAY and EARLIER as
 * cards of rows. A row is a face (marked online or batting like any other),
 * what happened, the mode in its colour and when, and one key or a verdict.
 * What each row says is `src/game/notices.ts`.
 */

const TONE: Record<Notice['mode'], string> = { classic: '#3f88f2', super10: '#a78bfa', marathon: '#2fbf71', survive: '#ff5a4e' };
const FILTERS: { id: NoticeFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'challenges', label: 'Challenges' }, { id: 'results', label: 'Results' }, { id: 'board', label: 'Board' },
];

export interface NoticesView {
  notices: readonly Notice[];
  filter: NoticeFilter;
  /** The last look before this one: anything newer has the dot. */
  seenAt: number;
  you: { avatar: number | null };
  now?: number;
}

function keyOf(notice: Notice, index: number): string {
  if (notice.key?.kind === 'answer') return `<button type="button" class="nt-key is-answer" data-key="${index}">ANSWER</button>`;
  if (notice.key?.kind === 'winback') return `<button type="button" class="nt-key is-win" data-key="${index}">WIN IT BACK</button>`;
  if (notice.key?.kind === 'again') return `<button type="button" class="nt-key is-again" data-key="${index}">AGAIN</button>`;
  if (notice.chip) return `<i class="nt-chip is-${notice.chip}" aria-label="${notice.chip === 'W' ? 'Won' : notice.chip === 'L' ? 'Lost' : 'Drawn'}">${notice.chip}</i>`;
  return '';
}

function rowMarkup(notice: Notice, index: number, seenAt: number): string {
  const fresh = notice.needsYou || notice.at > seenAt;
  return `<li class="nt-row${fresh ? ' is-new' : ''}" data-row="${index}" data-handle="${escape(notice.face.handle)}" tabindex="0">
      ${fresh ? '<i class="nt-new" aria-label="New"></i>' : ''}
      ${kitMarkup(notice.face.avatar, notice.face.name)}
      <span class="nt-text"><b>${escape(notice.title)}</b>
        <small><span class="nt-mode" style="--tone:${TONE[notice.mode]}">${MODE_NAME[notice.mode]}</span> · ${escape(notice.sub)}</small></span>
      ${keyOf(notice, index)}
    </li>`;
}

/** The list under the filters, or the empty screen (E4). */
export function noticesBodyMarkup(view: NoticesView): string {
  const now = view.now ?? Date.now();
  const groups = noticeGroups(view.notices, view.filter, now);
  if (!groups.length) {
    const what = view.filter === 'all' ? 'Challenge someone from their profile, or from Around now on Rivals. Their answers and your results will show up here.'
      : view.filter === 'board' ? 'When somebody chases or surpasses you on a board, it lands here.'
        : view.filter === 'results' ? 'Settled matches land here, won or lost.'
          : 'Challenges you send and get land here.';
    return `<div class="nt-empty">
        <span class="nt-empty-faces" aria-hidden="true">${view.you.avatar === null ? '<span class="board-kit is-empty"></span>' : kitMarkup(view.you.avatar, 'You')}<i></i></span>
        <h3>NOTHING HERE YET</h3><p>${what}</p>
      </div>`;
  }
  return groups.map(group => `<h4 class="nt-group">${group.title}</h4><ul class="nt-card">${group.notices
    .map(notice => rowMarkup(notice, view.notices.indexOf(notice), view.seenAt)).join('')}</ul>`).join('');
}

export function noticesMarkup(view: NoticesView): string {
  const empty = !view.notices.length;
  return `<div class="nt-screen">
      <header class="nt-top">
        <button id="notices-back" type="button" class="k-icon-button" aria-label="Back">${icon('arrow-left')}</button>
        <h2 id="notices-title" class="nt-title">NOTIFICATIONS</h2>
      </header>
      <div class="nt-filters" role="tablist" aria-label="Show">${FILTERS.map(one =>
        `<button type="button" role="tab" class="nt-filter${one.id === view.filter ? ' is-on' : ''}" data-filter="${one.id}" aria-selected="${one.id === view.filter}">${one.label}</button>`).join('')}</div>
      <div id="notices-body" class="nt-body">${noticesBodyMarkup(view)}</div>
      ${empty ? `<div class="nt-foot">${cta({ kind: 'primary', label: 'OPEN THE LEADERBOARD', id: 'notices-board', wide: true })}</div>` : ''}
    </div>`;
}
