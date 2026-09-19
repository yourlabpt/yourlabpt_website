/**
 * The platform's one icon set, taken from the approved mockup (docs/mockups/ios):
 * 24px grid, 1.8 stroke, round caps and joins, no fills.
 *
 * Every screen draws from here — sidebar, phone tab bar, rows, cards — so an icon means
 * the same thing wherever it appears. Loaded before app.js.
 */
(function initIosIcons() {
  // Subpaths are separated by "|" so each draws as its own <path>.
  const PATHS = {
    // Places
    tray: 'M3 13h5l1.5 3h5l1.5-3h5|M5.5 5h13l2.5 8v6H3v-6z',
    folder: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z',
    bolt: 'M13 3L4 14h6l-1 7 9-11h-6z',
    gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z|M19.4 15a1.7 1.7 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a1.7 1.7 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.4 2.5h4l.4-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.5z',
    person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4.5 20a7.5 7.5 0 0 1 15 0',
    people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z|M2.5 20a6.5 6.5 0 0 1 13 0|M16 4.5a3.5 3.5 0 0 1 0 6.5|M18 14a6 6 0 0 1 3.5 6',

    // A project's sections
    gauge: 'M4 19V5|M4 19h16|M8 16v-5|M12 16V8|M16 16v-3',
    plan: 'M4 19h16|M7 19V10|M12 19V5|M17 19v-6',
    list: 'M9 6h11|M9 12h11|M9 18h11|M4.5 6h.01|M4.5 12h.01|M4.5 18h.01',
    branch: 'M6 3v12|M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M18 9a9 9 0 0 1-9 9',
    send: 'M21 3L10 14|M21 3l-7 18-4-7-7-4z',
    doc: 'M7 3h7l5 5v13H7z|M14 3v5h5',
    clock: 'M12 7v5l3 2|M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
    // Not drawn in the mockup; made on the same grid for the pages behind «Mais».
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8|M12 16.5h.01',
    layers: 'M12 3l9 5-9 5-9-5z|M3 13l9 5 9-5',
    sparkle: 'M12 3v4|M12 17v4|M3 12h4|M17 12h4|M6 6l2.5 2.5|M15.5 15.5L18 18|M6 18l2.5-2.5|M15.5 8.5L18 6',
    notes: 'M7 3h10v18H7z|M10 8h4|M10 12h4|M10 16h2',

    // Things in rows and cards
    image: 'M4 5h16v14H4z|M4 16l5-5 4 4 3-3 4 4|M15 9h.01',
    code: 'M8 7l-5 5 5 5|M16 7l5 5-5 5',
    alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 8v5|M12 16h.01',
    check: 'M5 12.5l4.5 4.5L19 7',

    // Controls
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M20 20l-4-4',
    chevronRight: 'M9.5 6l6 6-6 6',
    chevronLeft: 'M15 5l-7 7 7 7',
    chevronDown: 'M6 9.5l6 6 6-6',
    plus: 'M12 5v14|M5 12h14',
    more: 'M6 12h.01|M12 12h.01|M18 12h.01',
    filter: 'M4 6h16|M7 12h10|M10 18h4',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7|M20 5v6h-6',
    logout: 'M15 4h4v16h-4|M10 8l-4 4 4 4|M6 12h10',
    close: 'M6 6l12 12|M18 6L6 18',
  };

  /**
   * An icon as inline SVG. Colour comes from `currentColor`, so the element around it
   * decides whether it is grey, gold or red.
   */
  function svg(name, { size = 20, className = '', strokeWidth = 1.8 } = {}) {
    const d = PATHS[name] || PATHS.more;
    const paths = d.split('|').map((part) => `<path d="${part}"></path>`).join('');
    return `<svg class="ios-icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-width="${strokeWidth}" aria-hidden="true">${paths}</svg>`;
  }

  /** Draws every `[data-ios-icon]` inside a root that has not been drawn yet. */
  function hydrate(root = document) {
    root.querySelectorAll('[data-ios-icon]:not([data-ios-icon-drawn])').forEach((el) => {
      el.insertAdjacentHTML('afterbegin', svg(el.dataset.iosIcon, { size: Number(el.dataset.iosIconSize) || 20 }));
      el.setAttribute('data-ios-icon-drawn', '');
    });
  }

  window.IosIcons = { svg, hydrate, has: (name) => Boolean(PATHS[name]) };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hydrate());
  } else {
    hydrate();
  }
})();
