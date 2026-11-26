/**
 * Small inline SVG icons and the opponents' emblems. Drawn for this app with
 * currentColor strokes, so they follow the text colour and need no downloads.
 */
const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

export const ICONS = {
  hint: svg(
    '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>',
  ),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  retry: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  speed: svg('<path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/>'),
  soundOn: svg(
    '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  ),
  soundOff: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  rules: svg(
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  ),
  newGame: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
} as const;

/** One emblem per opponent id, drawn on a 24-unit grid. */
const EMBLEMS: Record<string, string> = {
  // Baguhan, "beginner": a sprout.
  'level-1':
    '<path d="M12 21v-8"/><path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 11c0-3.5 2.5-5.5 6-5.5 0 3.5-2.5 5.5-6 5.5z"/>',
  // Sakim, "greedy": a heap of shells in a cupped hand.
  'level-2':
    '<path d="M3 13c2 5 5.5 7 9 7s7-2 9-7"/><ellipse cx="8.5" cy="11" rx="2.6" ry="1.8"/><ellipse cx="15.5" cy="11" rx="2.6" ry="1.8"/><ellipse cx="12" cy="7.5" rx="2.6" ry="1.8"/>',
  // Matalino, "clever": an open eye.
  'level-3':
    '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  // Dalubhasa, "expert": an eight-point star like a carved inlay.
  'level-4':
    '<path d="M12 2l2.2 5.8L20 6l-1.8 5.8L22 12l-3.8 2.2L20 18l-5.8-1.8L12 22l-2.2-5.8L4 18l1.8-5.8L2 12l3.8-2.2L4 6l5.8 1.8z"/>',
  // Hari, "king": a crown.
  'level-5': '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/>',
  // Monte Carlo: a die.
  mcts: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
};

export function emblem(id: string, size = 28): string {
  const body = EMBLEMS[id] ?? EMBLEMS['level-3']!;
  return svg(body).replace('width="20" height="20"', `width="${size}" height="${size}"`);
}

/** The player's own mark: a single cowrie. */
export function youMark(size = 28): string {
  return svg('<ellipse cx="12" cy="12" rx="8.5" ry="6"/><path d="M5.5 12.5q6.5 3 13 0"/>').replace(
    'width="20" height="20"',
    `width="${size}" height="${size}"`,
  );
}
