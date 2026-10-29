import './styles.css';
import { mountAbout } from './views/about';
import { mountLeaderboard } from './views/leaderboard';
import { mountPlay } from './views/play';

const root = document.querySelector<HTMLElement>('#app')!;
let cleanup: (() => void) | void;

function route() {
  cleanup?.();
  cleanup = undefined;
  const page = location.hash.replace(/^#\/?/, '') || 'play';
  document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.page === page);
  });
  if (page === 'leaderboard') void mountLeaderboard(root);
  else if (page === 'about') mountAbout(root);
  else cleanup = mountPlay(root);
  root.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();
