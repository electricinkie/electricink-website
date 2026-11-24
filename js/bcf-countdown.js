/**
 * Black Cat Friday countdown
 *
 * Drives every [data-bcf-phase] block in the document (hero slide and the
 * /black-cat-friday page). Classic script, no imports, no globals.
 *
 * Display only: dates come from /campaign.config.json and are compared with
 * the browser clock. The server decides the price, never this file.
 *
 * Any failure (fetch, JSON, invalid dates) hides the countdown and leaves the
 * rest of the block exactly as the HTML has it. enabled !== true does the same.
 *
 * ?phase=before|live|ended only changes what is shown (preview); any other
 * value is ignored.
 */

(function () {
  'use strict';

  const TICK_MS = 1000;
  const PHASES = ['before', 'live', 'ended'];

  const TEXTS = {
    before: { small: "something's coming", label: 'Starts in' },
    live: { small: '', label: 'Ends in' },
    ended: { small: 'see you next year', label: '', dates: 'THANKS FOR SHOPPING' }
  };

  let blocks = [];
  let dates = null; // { start, end } in ms, only when the config is valid and enabled
  let forced = null;
  let timer = null;

  // ──────────────────────────────────────────────────────────────
  // Pure logic
  // ──────────────────────────────────────────────────────────────

  /** now < start = before; start <= now <= end = live; now > end = ended. */
  function phaseAt(now, start, end) {
    if (now < start) return 'before';
    if (now <= end) return 'live';
    return 'ended';
  }

  /** Whole seconds left until target, split in d/h/m/s; 0 once passed. */
  function splitRemaining(target, now) {
    const total = Math.max(0, Math.floor((target - now) / 1000));
    return {
      d: Math.floor(total / 86400),
      h: Math.floor((total % 86400) / 3600),
      m: Math.floor((total % 3600) / 60),
      s: total % 60
    };
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /** Returns { enabled, start, end } or null when the dates are not usable. */
  function parseConfig(config) {
    if (!config || typeof config !== 'object') return null;
    const start = Date.parse(config.startsAt);
    const end = Date.parse(config.endsAt);
    if (isNaN(start) || isNaN(end) || start > end) return null;
    return { enabled: config.enabled === true, start, end };
  }

  function readForcedPhase() {
    try {
      const value = new URLSearchParams(window.location.search).get('phase');
      return PHASES.indexOf(value) !== -1 ? value : null;
    } catch (e) {
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Rendering — textContent and hidden only
  // ──────────────────────────────────────────────────────────────

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function hideCountdown(block) {
    if (block.countdown) block.countdown.hidden = true;
  }

  // Static pieces of the page that must disappear once the campaign is over
  // (e.g. the benefits card on the home). Untouched if this script never runs.
  function hideWhenEnded(phase) {
    document.querySelectorAll('[data-bcf-hide-when-ended]').forEach(node => {
      node.hidden = phase === 'ended';
    });
  }

  function render(block, now) {
    const phase = forced || phaseAt(now, dates.start, dates.end);

    if (phase !== block.phase) {
      block.phase = phase;
      block.root.setAttribute('data-bcf-phase', phase);
      setText(block.small, TEXTS[phase].small);
      setText(block.label, TEXTS[phase].label);
      if (TEXTS[phase].dates) setText(block.dates, TEXTS[phase].dates);
      if (block.countdown) block.countdown.hidden = phase === 'ended';
      hideWhenEnded(phase);
    }

    if (phase === 'ended') return;
    const left = splitRemaining(phase === 'before' ? dates.start : dates.end, now);
    setText(block.d, pad(left.d));
    setText(block.h, pad(left.h));
    setText(block.m, pad(left.m));
    setText(block.s, pad(left.s));
  }

  function tick() {
    const now = Date.now();
    blocks.forEach(block => render(block, now));
    sync();
  }

  // ──────────────────────────────────────────────────────────────
  // One timer per page, stopped while nothing is visible
  // ──────────────────────────────────────────────────────────────

  function isVisible(block) {
    return !block.slide || block.slide.classList.contains('is-active');
  }

  function shouldRun() {
    if (!dates || document.hidden) return false;
    return blocks.some(block => isVisible(block) && block.phase !== 'ended');
  }

  /** Start or stop the single interval. Starting renders immediately. */
  function sync() {
    const run = shouldRun();
    if (run && timer === null) {
      timer = setInterval(tick, TICK_MS);
      tick();
    } else if (!run && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Entry point
  // ──────────────────────────────────────────────────────────────

  function collect() {
    return Array.from(document.querySelectorAll('[data-bcf-phase]')).map(root => ({
      root,
      slide: root.closest('.hx-slide'),
      countdown: root.querySelector('[data-bcf-countdown]'),
      label: root.querySelector('[data-bcf-label]'),
      d: root.querySelector('[data-bcf-d]'),
      h: root.querySelector('[data-bcf-h]'),
      m: root.querySelector('[data-bcf-m]'),
      s: root.querySelector('[data-bcf-s]'),
      small: root.querySelector('[data-bcf-small]'),
      dates: root.querySelector('[data-bcf-dates]'),
      phase: null
    }));
  }

  function fail(reason) {
    console.warn('BCF countdown: hidden (' + reason + ')');
    blocks.forEach(hideCountdown);
  }

  function start() {
    blocks = collect();
    if (blocks.length === 0) return;
    forced = readForcedPhase();

    // No aria-live anywhere: role="timer" is implicitly aria-live="off".
    blocks.forEach(block => {
      if (block.countdown) block.countdown.setAttribute('role', 'timer');
    });

    fetch('/campaign.config.json')
      .then(r => { if (!r.ok) throw new Error('config'); return r.json(); })
      .then(config => {
        const parsed = parseConfig(config);
        if (!parsed) return fail('invalid config');
        if (!parsed.enabled) {
          blocks.forEach(hideCountdown);
          return;
        }
        dates = { start: parsed.start, end: parsed.end };

        blocks.forEach(block => render(block, Date.now()));

        // Re-evaluate when a hero slide changes (is-active) or the tab hides/shows.
        if (typeof MutationObserver === 'function') {
          const observer = new MutationObserver(sync);
          const seen = [];
          blocks.forEach(block => {
            if (block.slide && seen.indexOf(block.slide) === -1) {
              seen.push(block.slide);
              observer.observe(block.slide, { attributes: true, attributeFilter: ['class'] });
            }
          });
        }
        document.addEventListener('visibilitychange', sync);
        sync();
      })
      .catch(e => fail(e && e.message === 'config' ? 'config unavailable' : 'config error'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
