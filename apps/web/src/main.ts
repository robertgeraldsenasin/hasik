import './styles.css';
import { mountAbout } from './views/about';
import { mountLeaderboard } from './views/leaderboard';
import { mountPlay } from './views/play';

const root = document.querySelector<HTMLElement>('#app')!;
let cleanup: (() => void) | void;

/** A visible, dismissible notice instead of a silently broken page. */
function showError(message: string) {
  let bar = document.querySelector<HTMLElement>('.error-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'error-bar';
    bar.setAttribute('role', 'alert');
    document.body.prepend(bar);
  }
  bar.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = `Something went wrong: ${message}. Reloading the page usually fixes it; your game is saved.`;
  const close = document.createElement('button');
  close.className = 'btn';
  close.textContent = 'Dismiss';
  close.onclick = () => bar!.remove();
  bar.append(text, close);
}

window.addEventListener('error', (e) => showError(e.message || 'an unexpected error'));
window.addEventListener('unhandledrejection', (e) => {
  const r: unknown = e.reason;
  if (r instanceof Error && r.name === 'CancelledError') return;
  showError(r instanceof Error ? r.message : String(r));
});

function route() {
  cleanup?.();
  cleanup = undefined;
  const page = location.hash.replace(/^#\/?/, '') || 'play';
  document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.page === page);
  });
  try {
    if (page === 'leaderboard') void mountLeaderboard(root);
    else if (page === 'about') mountAbout(root);
    else cleanup = mountPlay(root, { tutorial: page === 'learn' });
  } catch (e) {
    root.innerHTML = `<section class="prose"><h1>Hasik couldn't start</h1>
      <p>Your browser is missing something the game needs (<span id="start-error"></span>).
      Try an up-to-date Chrome, Edge, Firefox or Safari.</p></section>`;
    root.querySelector('#start-error')!.textContent = e instanceof Error ? e.message : String(e);
  }
  root.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();
