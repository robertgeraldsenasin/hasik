const REPO = 'https://github.com/robertgeraldsenasin/hasik';

export function mountAbout(root: HTMLElement): void {
  root.innerHTML = `
  <section class="prose">
    <h1>How Hasik works</h1>
    <p><strong>Hasik</strong> is Tagalog for "to sow", the one move in Sungka, the Filipino mancala.
    Two players face a board of 7 small houses each, with 7 shells per house and one store at each end.</p>

    <h2>The rules in one minute</h2>
    <ol>
      <li>Pick one of your non-empty houses, scoop up its shells and drop one in each slot going
      counter-clockwise, including your own store but never your opponent's.</li>
      <li>Last shell in <em>your store</em>: move again.</li>
      <li>Last shell in a house that already had shells: scoop them all up and keep sowing.</li>
      <li>Last shell in an <em>empty house on your side</em>: capture it plus everything in the house opposite.</li>
      <li>When the player to move has no shells left, the game ends; shells still in a row go to that row's owner.
      Most shells wins.</li>
    </ol>
    <p class="muted">Regional variants differ; every rule above is a flag in the engine (see ADR-0001).</p>

    <h2>The engine</h2>
    <ul>
      <li><strong>Alpha-beta search</strong> with iterative deepening, a Zobrist-hashed transposition table and
      move ordering. The Sungka twist: after an extra turn the same player moves again, so the search must not flip
      the score's sign.</li>
      <li><strong>Monte Carlo Tree Search</strong> as a second, completely different AI.</li>
      <li><strong>Glicko-2</strong> ratings from round-robin tournaments.</li>
      <li><strong>A CI strength gate</strong>: every change to the engine plays the main branch under a Sequential
      Probability Ratio Test and cannot merge unless it is proven not to be weaker.</li>
    </ul>
    <p>Code, design records and the build guide: <a href="${REPO}">${REPO.replace('https://', '')}</a>.</p>

    <h2>Keyboard</h2>
    <p>Keys <kbd>1</kbd>–<kbd>7</kbd> play your houses from left to right; <kbd>N</kbd> starts a new game.</p>
  </section>`;
}
