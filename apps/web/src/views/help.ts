/**
 * The rules card. It opens by itself on a first visit (with the tutorial offered
 * first) and any time from the Rules button or the ? key. Each rule is one
 * sentence and a small drawing; the tutorial does the real teaching.
 */
const pit = (x: number, y: number, r = 7, cls = '') =>
  `<circle cx="${x}" cy="${y}" r="${r}" class="pit ${cls}"/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="1.8" class="bead"/>`;
const art = (body: string) =>
  `<svg viewBox="0 0 132 44" class="rule-art" aria-hidden="true" focusable="false">${body}</svg>`;

const ROW = [14, 36, 58, 80];

const RULES: ReadonlyArray<{ word: string; title: string; text: string; art: string }> = [
  {
    word: 'Hasik',
    title: 'Sow',
    text: 'Pick one of your houses. Its shells go out one per pit, moving right along your row and on around the board. You skip the other player’s store.',
    art: art(
      ROW.map((x) => pit(x, 30)).join('') +
        [36, 58, 80].map((x) => dot(x, 30)).join('') +
        '<path d="M14 18 C30 4, 70 4, 84 18" class="arrow"/><path d="M80 14l4 4-5 2" class="arrow"/>' +
        pit(108, 26, 11, 'store'),
    ),
  },
  {
    word: 'Isa pa!',
    title: 'Extra turn',
    text: 'If your last shell drops into your own store, you go again.',
    art: art(
      [14, 36, 58, 80].map((x) => pit(x, 30)).join('') +
        pit(110, 24, 13, 'store hot') +
        '<path d="M58 18 C80 2, 100 4, 108 12" class="arrow"/><path d="M103 10l5 2-2 5" class="arrow"/>',
    ),
  },
  {
    word: 'Tuloy',
    title: 'Keep going',
    text: 'If it drops into a house that already has shells, scoop them all up and keep sowing.',
    art: art(
      ROW.map((x) => pit(x, 30)).join('') +
        dot(55, 28) +
        dot(60, 32) +
        dot(58, 26) +
        '<path d="M14 18 C26 8, 46 8, 56 18" class="arrow"/><path d="M60 18 C72 8, 90 8, 98 18" class="arrow dashed"/>' +
        pit(118, 26, 9, 'store'),
    ),
  },
  {
    word: 'Kain',
    title: 'Capture',
    text: 'If it drops into an empty house on your side, take that shell and everything in the house across.',
    art: art(
      pit(36, 12, 7) +
        dot(33, 11) +
        dot(38, 13) +
        dot(36, 9) +
        pit(36, 34, 7, 'hot') +
        dot(36, 34) +
        pit(110, 23, 13, 'store') +
        '<path d="M46 12 C70 4, 92 8, 102 16" class="arrow"/><path d="M46 34 C70 42, 92 38, 102 30" class="arrow"/>',
    ),
  },
  {
    word: 'Tapos',
    title: 'Finish',
    text: 'When the player to move has an empty row, the game ends. Shells left on a row go to its owner. 50 of the 98 shells always wins.',
    art: art(
      ROW.map((x) => pit(x, 30)).join('') +
        pit(110, 23, 15, 'store hot') +
        '<text x="110" y="27.5" class="art-num">50</text>',
    ),
  },
];

export function helpDialogHtml(): string {
  return `
  <dialog id="help" class="dialog help" aria-labelledby="help-title">
    <header class="help-head">
      <h2 id="help-title">How to play Sungka</h2>
      <p>Two rows of seven houses (<i lang="tl">bahay</i>), a store (<i lang="tl">ulo</i>) at each
      end and 98 cowrie shells. Yours are the row nearest you and the store it sows into.</p>
    </header>
    <ol class="rules">
      ${RULES.map(
        (r) => `<li>
          ${r.art}
          <div><h3><span lang="tl">${r.word}</span> <small>${r.title}</small></h3><p>${r.text}</p></div>
        </li>`,
      ).join('')}
    </ol>
    <p class="keys small"><kbd>1</kbd>–<kbd>7</kbd> play a house, <kbd>H</kbd> hint, <kbd>U</kbd> undo,
    <kbd>N</kbd> new game, <kbd>M</kbd> sound, <kbd>V</kbd> 2.5D or flat board, <kbd>Space</kbd> skip an
    animation, <kbd>?</kbd> rules</p>
    <form method="dialog" class="help-actions">
      <button class="btn" value="tutorial" data-testid="start-tutorial">Teach me with 5 moves</button>
      <button class="btn" value="ok" id="help-ok">Start playing</button>
    </form>
  </dialog>`;
}
