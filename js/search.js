// ========================================
// PRODUCT SEARCH
// ES module. Loaded on demand by the header scripts (import('/js/search.js')).
// - Index: data/search/index.json (built by scripts/build-search-index.js),
//   fetched on the first open only, then kept in memory.
// - Results are built with createElement/textContent (never innerHTML).
// - Panel sits under the injected header (z-index 1100: above the header at
//   1000, under the mobile menu at 2000) and closes on Esc, outside click,
//   and when the cart drawer opens.
// Console test (no header needed):
//   import('/js/search.js').then(m => m.openSearch())
// ========================================

const INDEX_URL = '/data/search/index.json';
const CSS_URL = '/css/search.css';
const MIN_CHARS = 2;
const MAX_RESULTS = 8;

const TEXT = {
  placeholder: 'Search products',
  buttonLabel: 'Search products',
  noResults: 'No products found. Try a different word.',
  unavailable: 'Search is unavailable right now.'
};

const PANEL_ID = 'ei-search-panel';
const LIST_ID = 'ei-search-list';

let indexPromise = null;   // fetch once; reset on failure so a later open can retry
let panel = null;
let input = null;
let list = null;
let message = null;
let live = null;
let trigger = null;        // button that opened the panel (focus returns here)
let results = [];
let active = -1;
let cartObserver = null;
let headerObserver = null;
const buttons = [];

// ────────── Stylesheet (CSP: style-src 'self') ──────────
if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_URL;
  document.head.appendChild(link);
}

// ────────── Text matching ──────────

// lower case, no accents, letters and digits only
function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(value) {
  const n = normalize(value);
  return n ? n.split(' ') : [];
}

function prepare(entry) {
  return {
    entry,
    name: normalize(entry.name),
    nameWords: words(entry.name),
    keywordWords: entry.keywords.flatMap(words),
    categoryWords: words(entry.category).concat(words(entry.subcategory)),
    variantWords: entry.variants.flatMap(words)
  };
}

const hasPrefix = (list, term) => list.some((w) => w.startsWith(term));

// Every query word must prefix-match a word in some field. The name weighs
// most: "tattoo" sits in almost every keyword list, so keywords alone must
// never outrank a product named after the search.
function score(item, query, terms) {
  let total = item.name.startsWith(query) ? 100 : 0;
  for (const term of terms) {
    let best = 0;
    if (hasPrefix(item.nameWords, term)) best = 60;
    else if (hasPrefix(item.keywordWords, term)) best = 40;
    else if (hasPrefix(item.categoryWords, term)) best = 20;
    else if (hasPrefix(item.variantWords, term)) best = 15;
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

function search(items, raw) {
  const query = normalize(raw);
  if (query.length < MIN_CHARS) return [];
  const terms = query.split(' ');
  return items
    .map((item) => ({ item, s: score(item, query, terms) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.item.entry.name.localeCompare(b.item.entry.name))
    .slice(0, MAX_RESULTS)
    .map((r) => r.item.entry);
}

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Index is not an array');
        return data.map(prepare);
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

// ────────── Header offset ──────────

function visibleHeader() {
  return Array.from(document.querySelectorAll('.site-header, .desktop-header'))
    .find((el) => el.offsetHeight > 0) || null;
}

function syncTop() {
  if (!panel) return;
  const header = visibleHeader();
  if (header) panel.style.setProperty('--ei-search-top', Math.round(header.getBoundingClientRect().bottom) + 'px');
}

// ────────── Panel ──────────

function svgIcon(size) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '7');
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', '21');
  line.setAttribute('y1', '21');
  line.setAttribute('x2', '16.65');
  line.setAttribute('y2', '16.65');
  svg.append(circle, line);
  return svg;
}

function buildPanel() {
  if (panel) return;

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'ei-search-panel';
  panel.hidden = true;

  const bar = document.createElement('div');
  bar.className = 'ei-search-bar';
  bar.appendChild(svgIcon(20));

  input = document.createElement('input');
  input.type = 'search';
  input.className = 'ei-search-input';
  input.placeholder = TEXT.placeholder;
  input.setAttribute('aria-label', TEXT.placeholder);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', LIST_ID);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('enterkeyhint', 'go');
  bar.appendChild(input);

  list = document.createElement('ul');
  list.id = LIST_ID;
  list.className = 'ei-search-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', TEXT.placeholder);

  message = document.createElement('p');
  message.className = 'ei-search-message';
  message.hidden = true;

  live = document.createElement('div');
  live.className = 'ei-search-sr-only';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  panel.append(bar, list, message, live);
  document.body.appendChild(panel);

  input.addEventListener('input', update);
  input.addEventListener('keydown', onInputKey);
  list.addEventListener('mousemove', (e) => {
    const option = e.target.closest('[role="option"]');
    if (option) setActive(Number(option.dataset.index), false);
  });
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}

function render(entries) {
  results = entries;
  active = -1;
  list.replaceChildren();
  input.removeAttribute('aria-activedescendant');

  entries.forEach((entry, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');

    const a = document.createElement('a');
    a.id = `ei-search-opt-${i}`;
    a.className = 'ei-search-option';
    a.setAttribute('role', 'option');
    a.setAttribute('aria-selected', 'false');
    a.tabIndex = -1;
    a.dataset.index = String(i);
    a.href = `/products.html?id=${encodeURIComponent(entry.id)}`;

    const img = document.createElement('img');
    img.className = 'ei-search-thumb';
    img.src = entry.image;
    img.alt = '';
    img.width = 48;
    img.height = 48;
    img.decoding = 'async';

    const text = document.createElement('span');
    text.className = 'ei-search-text';
    const name = document.createElement('span');
    name.className = 'ei-search-name';
    name.textContent = entry.name;
    const category = document.createElement('span');
    category.className = 'ei-search-category';
    category.textContent = entry.category;
    text.append(name, category);

    a.append(img, text);
    li.appendChild(a);
    list.appendChild(li);
  });

  input.setAttribute('aria-expanded', entries.length > 0 ? 'true' : 'false');
}

function update() {
  const query = input.value;
  if (normalize(query).length < MIN_CHARS) {
    render([]);
    showMessage('');
    live.textContent = '';
    return;
  }
  loadIndex()
    .then((items) => {
      if (input.value !== query) return; // a newer keystroke will render
      const found = search(items, query);
      render(found);
      showMessage(found.length ? '' : TEXT.noResults);
      live.textContent = found.length
        ? `${found.length} result${found.length === 1 ? '' : 's'}`
        : TEXT.noResults;
    })
    .catch(() => {
      render([]);
      showMessage(TEXT.unavailable);
      live.textContent = TEXT.unavailable;
    });
}

function setActive(index, scroll = true) {
  const options = list.querySelectorAll('[role="option"]');
  if (!options.length) return;
  active = (index + options.length) % options.length;
  options.forEach((o, i) => o.setAttribute('aria-selected', i === active ? 'true' : 'false'));
  const current = options[active];
  input.setAttribute('aria-activedescendant', current.id);
  if (scroll) current.scrollIntoView({ block: 'nearest' });
}

function onInputKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActive(active + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActive(active - 1);
  } else if (e.key === 'Enter') {
    if (!results.length) return;
    e.preventDefault();
    const entry = results[active >= 0 ? active : 0];
    window.location.href = `/products.html?id=${encodeURIComponent(entry.id)}`;
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSearch();
  }
}

// ────────── Open / close ──────────

function onOutsidePointer(e) {
  if (panel.contains(e.target)) return;
  if (buttons.some((b) => b.contains(e.target))) return; // the button toggles itself
  closeSearch({ restoreFocus: false });
}

function onDocumentKey(e) {
  if (e.key === 'Escape') closeSearch();
}

function watchCart() {
  // cart-drawer.js has no open event: it adds .open to #cart-drawer-overlay
  cartObserver = new MutationObserver(() => {
    const overlay = document.getElementById('cart-drawer-overlay');
    if (overlay && overlay.classList.contains('open')) closeSearch({ restoreFocus: false });
  });
  cartObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

function watchHeader() {
  syncTop();
  if (!('ResizeObserver' in window)) return;
  headerObserver = new ResizeObserver(syncTop);
  document.querySelectorAll('.site-header, .desktop-header').forEach((el) => headerObserver.observe(el));
}

export function openSearch(opener) {
  buildPanel();
  trigger = opener || trigger;
  if (!panel.hidden) {
    input.focus();
    return;
  }
  panel.hidden = false;
  buttons.forEach((b) => b.setAttribute('aria-expanded', 'true'));
  watchHeader();
  watchCart();
  window.addEventListener('resize', syncTop);
  document.addEventListener('pointerdown', onOutsidePointer, true);
  document.addEventListener('keydown', onDocumentKey);
  input.focus();
  loadIndex().catch(() => {}); // start fetching while the user types
  if (input.value) update();
}

export function closeSearch({ restoreFocus = true } = {}) {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  buttons.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (cartObserver) cartObserver.disconnect();
  if (headerObserver) headerObserver.disconnect();
  window.removeEventListener('resize', syncTop);
  document.removeEventListener('pointerdown', onOutsidePointer, true);
  document.removeEventListener('keydown', onDocumentKey);
  if (restoreFocus && trigger && trigger.isConnected) trigger.focus();
}

// ────────── Header button ──────────

export function mountSearchButton(container, { before = null } = {}) {
  if (!container || container.querySelector('.ei-search-btn')) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ei-search-btn';
  button.setAttribute('aria-label', TEXT.buttonLabel);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', PANEL_ID);
  button.appendChild(svgIcon(24));
  button.addEventListener('click', () => {
    if (panel && !panel.hidden) closeSearch();
    else openSearch(button);
  });
  container.insertBefore(button, before && before.parentNode === container ? before : null);
  buttons.push(button);
  return button;
}

// "/" opens the search on desktop, unless the user is typing somewhere
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!window.matchMedia('(min-width: 769px)').matches) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  openSearch(buttons.find((b) => b.offsetParent !== null) || null);
});
