/**
 * Black Cat Friday page (/black-cat-friday)
 *
 * Fills the "how it works" cards, the Vault, "add one of these to unlock 60%",
 * the Sumi Set (with its add-to-cart button), machines and power, "more on sale",
 * the shop links and the small print. Classic script, no imports, no globals.
 * Each product appears in ONE section only (priority: Vault, Machines & power,
 * Unlock 60%, More on sale).
 *
 * Display only: the server decides the price, never this file. Numbers come
 * from /campaign.config.json, prices from /api/catalog.
 *
 * Every section below the hero appears only in the live phase. With enabled === true the phase is
 * read from the hero's [data-bcf-phase], which js/bcf-countdown.js writes
 * asynchronously, so the attribute is observed. With enabled !== true (Plan B:
 * only the Vault, at 50% from the CRM) the countdown writes nothing, so this
 * file works the phase out from startsAt / endsAt (and ?phase=) and re-checks it
 * every 30 s, paused while the tab is hidden. Plan B shows no Boost card, no
 * kit card, no Sumi section and no 60% line. The catalog is fetched at most once
 * per page, and never in before / ended. Every string that comes from the catalog
 * or the config goes in with textContent, never innerHTML.
 *
 * Any failure hides the section it affects, without an error on screen.
 */

(function () {
  'use strict';

  // Same list and same exact paths as js/promotions-section.js:26-35.
  const PRODUCT_FILES = [
    '/data/product-accessories.json',
    '/data/products-cosmetics.json',
    '/data/products-power-supplies.json',
    '/data/products-artistic-inks.json',
    '/data/products-needles-022.json',
    '/data/products-needles-025.json',
    '/data/products-needles-030.json',
    '/data/product-tattoo-machines.json'
  ];

  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

  const els = {};
  let hero = null;
  let configPromise = null;
  let contentPromise = null;
  let contentDone = false; // the catalog step has finished (with or without products)
  let howCards = { vault: false, boost: false, kit: false }; // cards that have text; applyPhase shows them
  let content = { vault: 0, kit: false, unlock: 0, machines: 0, more: 0 };
  let heroTexts = null; // Plan B: the hero's original dates text, to restore it
  let kitState = null; // { items, ids, productId, cap } once the Sumi Set can be added in one click
  let kitBusy = false;
  // The catalog's own category names for machines and power supplies.
  const MACHINE_CATEGORIES = ['Tattoo Machines', 'Power Supplies'];
  let planBDates = null; // { start, end } in ms, only when enabled !== true and the dates are valid
  let clock = null;
  const PHASES = ['before', 'live', 'ended'];
  const CLOCK_MS = 30000;

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────

  // Same rounding used everywhere (js/promotions-section.js:42-45).
  const toGross = (priceEx) => {
    const p = parseFloat(priceEx);
    return isFinite(p) ? parseFloat((p * 1.23).toFixed(2)) : null;
  };

  // Same as js/cart-drawer.js: 1000 -> "10", 1050 -> "10.50".
  const euros = (cents) => (cents / 100).toFixed(2).replace(/\.00$/, '');

  const isPercent = (n) => typeof n === 'number' && isFinite(n) && n > 0 && n <= 100;
  const isCents = (n) => Number.isInteger(n) && n > 0;

  const numberWord = (n) => NUMBER_WORDS[n] || String(n);

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  // Same rule as js/bcf-countdown.js: before < start <= live <= end < ended.
  function phaseAt(now, start, end) {
    if (now < start) return 'before';
    if (now <= end) return 'live';
    return 'ended';
  }

  // Same validation as js/bcf-countdown.js parseConfig: null when not usable.
  function parseDates(config) {
    const start = Date.parse(config.startsAt);
    const end = Date.parse(config.endsAt);
    if (isNaN(start) || isNaN(end) || start > end) return null;
    return { start, end };
  }

  // ?phase= only changes what is shown (preview); any other value is ignored.
  function readForcedPhase() {
    try {
      const value = new URLSearchParams(window.location.search).get('phase');
      return PHASES.indexOf(value) !== -1 ? value : null;
    } catch (e) {
      return null;
    }
  }

  function currentPhase() {
    if (planBDates) return readForcedPhase() || phaseAt(Date.now(), planBDates.start, planBDates.end);
    return hero ? hero.getAttribute('data-bcf-phase') : null;
  }

  // ──────────────────────────────────────────────────────────────
  // Config
  // ──────────────────────────────────────────────────────────────

  // Same loader as js/cart-drawer.js: the server's own config check, so the page never
  // promises a discount that the server would switch off.
  function loadCampaignLib() {
    if (window.EI_CAMPAIGN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/lib/campaign.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // One fetch per page. Resolves to the config object, or null on any failure.
  function loadConfig() {
    return fetch('/campaign.config.json')
      .then(r => { if (!r.ok) throw new Error('config'); return r.json(); })
      .then(async config => {
        if (!config || typeof config !== 'object') return null;
        if (config.enabled === true) {
          await loadCampaignLib();
          const lib = window.EI_CAMPAIGN;
          if (!lib || !lib.validateConfig(config).ok) throw new Error('config invalid');
        }
        if (config.enabled !== true) {
          // Plan B: invalid dates count as a failed config.
          planBDates = parseDates(config);
          if (!planBDates) return null;
        }
        return config;
      })
      .catch(() => {
        console.warn('BCF page: config unavailable');
        return null;
      });
  }

  // ──────────────────────────────────────────────────────────────
  // How it works
  // ──────────────────────────────────────────────────────────────

  function showCard(name, num, title, text) {
    const card = document.querySelector('[data-bcf-card="' + name + '"]');
    if (!card) return false;
    setText(document.getElementById('bcf-how-' + name + '-num'), num);
    if (title) setText(document.getElementById('bcf-how-' + name + '-title'), title);
    setText(document.getElementById('bcf-how-' + name + '-text'), text);
    howCards[name] = true;
    return true;
  }

  function renderHow(config) {
    if (!els.how || !config) return;
    let shown = false; // kept for the readability of the three blocks below

    const vault = config.vault;
    if (vault && isPercent(vault.discountPercent) && Array.isArray(vault.items) && vault.items.length > 0) {
      const price = vault.discountPercent === 50 ? 'half price' : vault.discountPercent + '% off';
      const count = numberWord(vault.items.length);
      shown = showCard('vault', vault.discountPercent + '%', null,
        count.charAt(0).toUpperCase() + count.slice(1) + ' products at ' + price + '.') || shown;
    }

    // Boost and kit only exist while the campaign is enabled.
    if (config.enabled === true) {
      const boost = config.boost;
      if (boost && isPercent(boost.discountPercent) && isCents(boost.minLineCents)) {
        shown = showCard('boost', boost.discountPercent + '%',
          'Add one more thing',
          'Put any other item of €' + euros(boost.minLineCents) + ' or more in your cart and ' + vaultUnits(boost) + ' drop to ' + boost.discountPercent + '% off.') || shown;
      }

      const bundle = Array.isArray(config.bundles) ? config.bundles[0] : null;
      if (bundle && isCents(bundle.priceCents) && Array.isArray(bundle.variantIds) && bundle.variantIds.length > 0) {
        // The text needs the old price (the sum from the catalog), so renderKit fills it.
        shown = showCard('kit', '€' + euros(bundle.priceCents), 'Or take the Sumi Set', '') || shown;
      }
    }

    applyPhase();
  }

  // ──────────────────────────────────────────────────────────────
  // Vault data
  // ──────────────────────────────────────────────────────────────

  /**
   * Fetch the local product JSON files. Used only to resolve a name and an
   * image per product (js/promotions-section.js:89-108). A file that fails to
   * load is skipped.
   */
  async function loadLocalCatalog() {
    const catalog = {};
    let failed = 0;
    const responses = await Promise.all(
      PRODUCT_FILES.map(p => fetch(p).catch(() => null))
    );
    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      if (!res || !res.ok) { failed++; continue; }
      try {
        Object.assign(catalog, await res.json());
      } catch (e) {
        failed++;
      }
    }
    if (failed > 0) console.warn('BCF page: ' + failed + ' product file(s) not loaded');
    return catalog;
  }

  /** Name, tolerating both the old flat and the newer `basic` shape (promotions-section.js:111-117). */
  function resolveName(data) {
    return data.basic?.name || data.name || '';
  }

  /** First usable image across every shape present in the local JSON files (promotions-section.js:120-127). */
  function resolveImage(data) {
    if (data.images?.cover) return data.images.cover;
    if (data.media?.main_image) return data.media.main_image;
    if (data.image) return data.image;
    if (Array.isArray(data.images) && data.images[0]) return data.images[0];
    if (data.media?.gallery?.[0]) return data.media.gallery[0];
    return null;
  }

  /**
   * For each vault item, in order, the catalog row that is currently on
   * promotion. Items with no matching or no usable row are skipped.
   */
  function matchVaultRows(items, rows) {
    const matches = [];
    items.forEach(item => {
      if (!item) return;
      const row = rows.find(r => r && r.id === item.productId && r.variant_id === item.variantId && r.promo_active === true);
      if (!row) return;
      const ex = parseFloat(row.price_ex);
      const eff = parseFloat(row.effective_price_ex);
      if (!(ex > 0) || !(eff > 0) || !(eff < ex)) return;
      const was = toGross(row.price_ex);
      const now = toGross(row.effective_price_ex);
      const percent = Math.round((parseFloat(row.price_ex) - parseFloat(row.effective_price_ex)) / parseFloat(row.price_ex) * 100);
      if (was === null || now === null || !(percent > 0)) return;
      matches.push({ productId: item.productId, variantId: item.variantId, was, now, percent });
    });
    return matches;
  }

  // ──────────────────────────────────────────────────────────────
  // Rendering — createElement and textContent only
  // ──────────────────────────────────────────────────────────────

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Old price. The orange scratch is drawn by CSS (.bcf-was::after); the hidden
  // "Was" is for screen readers.
  function wasNode(text) {
    const node = el('span', 'bcf-was');
    node.appendChild(el('span', 'bcf-sr', 'Was '));
    node.appendChild(document.createTextNode(text));
    return node;
  }

  /**
   * One product card. item = { productId, variantId, was, now, percent,
   * from?, unlocksText? }. compact: the small card (no size line).
   */
  function buildCard(item, catalog, compact) {
    const local = catalog[item.productId];
    if (!local) return null;

    const variant = Array.isArray(local.variants) ? local.variants.find(v => v && v.id === item.variantId) : null;
    const image = (variant && variant.image) || resolveImage(local);
    const name = resolveName(local);
    // No name or no image would render broken: the site has no placeholder image.
    if (!image || !name) return null;

    const card = document.createElement('a');
    card.className = compact ? 'bcf-card bcf-card--compact' : 'bcf-card';
    card.href = '/products.html?id=' + encodeURIComponent(item.productId) + '&variant=' + encodeURIComponent(item.variantId);
    card.dataset.productId = item.productId;
    card.dataset.variantId = item.variantId;

    const media = el('div', 'bcf-card-media');
    const img = document.createElement('img');
    img.className = 'bcf-card-img';
    img.src = image;
    img.alt = name;
    img.loading = 'lazy';
    media.appendChild(img);
    media.appendChild(el('span', 'bcf-badge', '−' + item.percent + '%'));
    if (item.unlocksText) media.appendChild(el('span', 'bcf-tag', item.unlocksText));

    const body = el('div', 'bcf-card-body');
    body.appendChild(el('div', 'bcf-card-name', name));
    const size = !compact && variant ? (variant.label || variant.size || '') : '';
    if (size) body.appendChild(el('div', 'bcf-card-size', size));

    const prices = el('div', 'bcf-card-prices');
    if (item.from) prices.appendChild(el('span', 'bcf-from', 'from'));
    prices.appendChild(el('span', 'bcf-now', '€' + item.now.toFixed(2)));
    prices.appendChild(wasNode('€' + item.was.toFixed(2)));
    body.appendChild(prices);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function wordCapital(n) {
    const word = numberWord(n);
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  // "your first 4 Vault units" (boost.maxUnitsPerOrder); without a valid number, "your Vault items".
  function vaultUnits(boost) {
    return Number.isInteger(boost.maxUnitsPerOrder) && boost.maxUnitsPerOrder > 0
      ? 'your first ' + boost.maxUnitsPerOrder + ' Vault units' : 'your Vault items';
  }

  function boostOf(config) {
    const boost = config.boost;
    // maxUnitsPerOrder 0 is valid for the server but gives no 60% unit: then nothing may promise it.
    return config.enabled === true && boost && isPercent(boost.discountPercent) && isCents(boost.minLineCents) &&
      Number.isInteger(boost.maxUnitsPerOrder) && boost.maxUnitsPerOrder > 0 ? boost : null;
  }

  /** Vault grid. Returns the number of cards rendered. */
  function renderVault(config, rows, catalog) {
    if (!config.vault || !Array.isArray(config.vault.items)) return 0;
    const matches = matchVaultRows(config.vault.items, rows);
    const cards = matches.map(match => buildCard(match, catalog, false)).filter(Boolean);
    if (cards.length === 0) return 0;
    cards.forEach(card => els.grid.appendChild(card));
    // The per-order limits belong to the enabled campaign; in Plan B they do not apply.
    const note = document.getElementById('bcf-vault-note');
    if (note) note.hidden = config.enabled !== true;

    const pct = config.vault.discountPercent;
    // The "how it works" card says the same number as the section.
    if (isPercent(pct)) {
      setText(document.getElementById('bcf-how-vault-text'), wordCapital(cards.length) + ' ' + (cards.length === 1 ? 'product' : 'products') +
        ' at ' + (pct === 50 ? 'half price' : pct + '% off') + '.');
    }
    if (els.vaultSub && isPercent(pct)) {
      const boost = boostOf(config);
      setText(els.vaultSub, wordCapital(cards.length) + ' ' + (cards.length === 1 ? 'product' : 'products') + ' at ' + pct + '% off.' +
        (boost ? ' Add any other item of €' + euros(boost.minLineCents) + ' or more and ' + vaultUnits(boost) + ' drop to ' + boost.discountPercent + '%.' : ''));
      els.vaultSub.hidden = false;
    }
    return cards.length;
  }

  // ──────────────────────────────────────────────────────────────
  // Sumi Set
  // ──────────────────────────────────────────────────────────────

  function kitSetsInCart() {
    if (!kitState || !window.cart || typeof window.cart.getCart !== 'function') return 0;
    const cart = window.cart.getCart();
    if (!Array.isArray(cart)) return 0;
    let sets = Infinity;
    kitState.ids.forEach(id => {
      const line = cart.find(i => i && i.id === id);
      sets = Math.min(sets, line && Number.isInteger(line.quantity) ? line.quantity : 0);
    });
    return isFinite(sets) ? sets : 0;
  }

  // Button label, disabled state and the "maximum" note. Skipped while an add is running.
  function updateKitButton() {
    if (!els.kitAdd || kitBusy) return;
    if (!kitState) { els.kitAdd.hidden = true; els.kitNote.hidden = true; return; }
    els.kitAdd.hidden = false;
    const full = kitSetsInCart() >= kitState.cap;
    els.kitAdd.disabled = full;
    els.kitAdd.textContent = 'Add the whole Sumi Set to cart';
    if (full) {
      setText(els.kitNote, 'You already have the maximum of ' + kitState.cap + (kitState.cap === 1 ? ' set.' : ' sets.'));
      els.kitNote.hidden = false;
    } else {
      els.kitNote.hidden = true;
    }
  }

  function onKitAdd() {
    if (kitBusy || !kitState || !window.cart || typeof window.cart.addItem !== 'function') return;
    if (kitSetsInCart() >= kitState.cap) { updateKitButton(); return; }
    kitBusy = true;
    els.kitAdd.disabled = true;
    els.kitNote.hidden = true;
    let ok = true;
    try {
      for (let i = 0; i < kitState.items.length && ok; i++) {
        ok = window.cart.addItem(Object.assign({}, kitState.items[i])) === true;
      }
    } catch (e) {
      ok = false; // a damaged cart in localStorage must not leave the button stuck
    }
    if (ok) {
      els.kitAdd.textContent = 'Added';
      setText(els.kitNote, 'Added to your cart.'); // role="status": screen readers hear it
      els.kitNote.hidden = false;
      setTimeout(() => { kitBusy = false; updateKitButton(); }, 2000);
    } else {
      kitBusy = false;
      updateKitButton();
      setText(els.kitNote, "We couldn't add the whole set. Some bottles may already be in your cart, so please check it.");
      els.kitNote.hidden = false;
    }
  }

  /**
   * The six cart items of the kit, from the config ids, the catalog (price,
   * stock) and the local product file (name, image, Stripe price id). null
   * when anything is missing: the button then stays hidden and only the link shows.
   */
  function buildKitItems(bundle, rows, local) {
    if (!Number.isInteger(bundle.capPerOrder) || bundle.capPerOrder < 1) return null;
    if (!window.cart || typeof window.cart.addItem !== 'function' || typeof window.cart.getCart !== 'function') return null;
    const name = resolveName(local);
    const items = [];
    for (const id of bundle.variantIds) {
      const row = rows.find(r => r && r.id === bundle.productId && r.variant_id === id);
      const variant = Array.isArray(local.variants) ? local.variants.find(v => v && v.id === id) : null;
      const price = row ? toGross(row.effective_price_ex) : null;
      const priceId = variant && (variant.stripe_price_id || variant.priceId);
      if (!row || !variant || !(price > 0) || !priceId || !variant.label || !name) return null;
      // Same as the product page: in stock, or order on request.
      if (!(Number(row.stock) > 0) && local.orderOnRequest !== true) return null;
      items.push({
        id: bundle.productId + '-' + variant.id,
        name: name + ' - ' + variant.label,
        price,
        stripe_price_id: priceId,
        image: variant.image || resolveImage(local),
        variant: variant.id,
        available_on_request: local.orderOnRequest === true
      });
    }
    return items;
  }

  /**
   * Sumi Set. The old price is the sum of the six normal prices from the
   * catalog, never typed by hand. Only with enabled === true. Returns true when shown.
   */
  function renderKit(config, rows, catalog) {
    if (config.enabled !== true || !els.kit) return false;
    const bundle = Array.isArray(config.bundles) ? config.bundles[0] : null;
    if (!bundle || !isCents(bundle.priceCents) || typeof bundle.productId !== 'string' ||
        !Array.isArray(bundle.variantIds) || bundle.variantIds.length === 0) return false;

    let wasCents = 0;
    for (const id of bundle.variantIds) {
      const row = rows.find(r => r && r.id === bundle.productId && r.variant_id === id);
      const gross = row ? toGross(row.price_ex) : null;
      if (gross === null) return false;
      wasCents += Math.round(gross * 100);
    }

    const local = catalog[bundle.productId];
    if (!local) return false;
    const image = resolveImage(local);
    const name = resolveName(local);
    if (!image || !name) return false;

    els.kitImg.loading = 'lazy';
    els.kitImg.src = image;
    els.kitImg.alt = name;
    els.kitLink.href = '/products.html?id=' + encodeURIComponent(bundle.productId);

    els.kitPrices.textContent = '';
    els.kitPrices.appendChild(el('span', 'bcf-kit-now', '€' + euros(bundle.priceCents)));
    const saving = wasCents > bundle.priceCents;
    if (saving) els.kitPrices.appendChild(wasNode('€' + euros(wasCents)));
    setText(els.kitCaption, 'All ' + numberWord(bundle.variantIds.length) + ' bottles. €' + euros(bundle.priceCents) +
      (saving ? ' instead of €' + euros(wasCents) : '') + '.');
    setText(document.getElementById('bcf-how-kit-text'), 'All ' + numberWord(bundle.variantIds.length) + ' Sumi greys for €' +
      euros(bundle.priceCents) + (saving ? ' instead of €' + euros(wasCents) : '') + '.');

    els.kitGreys.textContent = '';
    bundle.variantIds.forEach(id => {
      const variant = Array.isArray(local.variants) ? local.variants.find(v => v && v.id === id) : null;
      if (!variant || !variant.image || !variant.label) return;
      const li = el('li', 'bcf-kit-grey');
      const img = document.createElement('img');
      img.className = 'bcf-kit-grey-img';
      img.src = variant.image;
      img.alt = '';
      img.loading = 'lazy';
      li.appendChild(img);
      li.appendChild(el('span', 'bcf-kit-grey-label', variant.label));
      els.kitGreys.appendChild(li);
    });

    // The button only works inside the campaign window, whatever ?phase= says (the server would charge full price).
    const dates = parseDates(config);
    const inWindow = dates && Date.now() >= dates.start && Date.now() <= dates.end;
    const items = els.kitAdd && inWindow ? buildKitItems(bundle, rows, local) : null;
    kitState = items ? { items, ids: items.map(i => i.id), cap: bundle.capPerOrder } : null;
    updateKitButton();
    return true;
  }

  // ──────────────────────────────────────────────────────────────
  // Promoted products outside the Vault: machines, unlock 60%, more
  // ──────────────────────────────────────────────────────────────

  /**
   * One entry per promoted product that is not in the Vault and not the kit:
   * its best variant (biggest discount, then lowest price). "from" only when the
   * shown price really is the lowest of several different promoted prices.
   */
  function collectPromoted(config, rows) {
    const skip = new Set();
    if (config.vault && Array.isArray(config.vault.items)) {
      config.vault.items.forEach(i => { if (i) skip.add(i.productId); });
    }
    if (config.enabled === true && Array.isArray(config.bundles)) {
      config.bundles.forEach(b => { if (b) skip.add(b.productId); });
    }

    const byProduct = {};
    rows.forEach(r => {
      if (!r || r.promo_active !== true || typeof r.id !== 'string' || skip.has(r.id)) return;
      const ex = parseFloat(r.price_ex);
      const eff = parseFloat(r.effective_price_ex);
      if (!(ex > 0) || !(eff > 0) || !(eff < ex)) return;
      const pct = (ex - eff) / ex * 100;
      const was = toGross(r.price_ex);
      const now = toGross(r.effective_price_ex);
      if (Math.round(pct) < 1 || was === null || now === null) return;
      (byProduct[r.id] = byProduct[r.id] || []).push({ row: r, pct, was, now });
    });

    return Object.keys(byProduct).map(id => {
      const list = byProduct[id].sort((a, b) => (b.pct - a.pct) || (a.now - b.now));
      const best = list[0];
      const lowest = Math.min.apply(null, list.map(v => v.now));
      return {
        productId: id,
        variantId: best.row.variant_id,
        category: best.row.category,
        was: best.was,
        now: best.now,
        pct: best.pct,
        percent: Math.round(best.pct),
        from: list.some(v => v.now !== best.now) && best.now === lowest
      };
    });
  }

  function fillGrid(grid, products, catalog, nameOf) {
    if (!grid) return 0;
    const sorted = products.slice().sort((a, b) => (b.pct - a.pct) || nameOf(a.productId).localeCompare(nameOf(b.productId)));
    const cards = sorted.map(p => buildCard(p, catalog, true)).filter(Boolean);
    cards.forEach(card => grid.appendChild(card));
    return cards.length;
  }

  /** Returns { unlock, machines, more }: the number of cards in each section. */
  function renderPromoted(config, rows, catalog, hasVault) {
    const boost = hasVault ? boostOf(config) : null;
    const minCents = boost ? boost.minLineCents : null;
    const nameOf = id => (catalog[id] ? resolveName(catalog[id]) : '') || '';

    // "Unlocks": same rule as the server (lib/campaign.js: line >= minLineCents), so €10.00 exactly unlocks.
    const unlocks = p => minCents !== null && Math.round(p.now * 100) >= minCents;
    const products = collectPromoted(config, rows);
    products.forEach(p => { if (unlocks(p)) p.unlocksText = 'Unlocks ' + boost.discountPercent + '%'; });

    const isMachine = p => MACHINE_CATEGORIES.indexOf(p.category) !== -1;
    const machines = products.filter(isMachine);
    const others = products.filter(p => !isMachine(p));
    // Section: same rule as the tag.
    const inUnlock = p => minCents !== null && Math.round(p.now * 100) >= minCents;
    const unlockList = others.filter(inUnlock);
    const moreList = others.filter(p => !inUnlock(p));

    const out = {
      machines: fillGrid(els.machinesGrid, machines, catalog, nameOf),
      unlock: fillGrid(els.unlockGrid, unlockList, catalog, nameOf),
      more: fillGrid(els.moreGrid, moreList, catalog, nameOf)
    };
    if (out.unlock > 0) {
      setText(els.unlockTitle, 'Add one of these to unlock ' + boost.discountPercent + '%');
      setText(els.unlockSub, 'Any item of €' + euros(boost.minLineCents) + ' or more works, and these are on sale too. ' + vaultUnits(boost).charAt(0).toUpperCase() + vaultUnits(boost).slice(1) + ' drop to ' + boost.discountPercent + '% off.');
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────
  // Small print and hero line
  // ──────────────────────────────────────────────────────────────

  // Irish time. Throws if Intl is missing: the callers catch.
  function irishParts(ms) {
    const parts = new Intl.DateTimeFormat('en-IE', {
      timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(ms));
    const get = type => (parts.find(p => p.type === type) || {}).value;
    return { weekday: get('weekday'), day: get('day'), month: get('month'), time: get('hour') + ':' + get('minute') };
  }

  const irishStamp = ms => { const p = irishParts(ms); return p.weekday + ' ' + p.day + ' ' + p.month + ', ' + p.time; };

  function showLine(node, text) {
    if (!node) return;
    setText(node, text);
    node.hidden = false;
  }

  // Hero line under the dates: "Up to 60% off, until Monday 23:59." (shown only in live, by CSS).
  function renderHeroSub(config) {
    if (!els.heroSub) return;
    try {
      const dates = parseDates(config);
      const boost = boostOf(config);
      const pct = boost ? boost.discountPercent : (config.vault && config.vault.discountPercent);
      if (!dates || !isPercent(pct)) return;
      const end = irishParts(dates.end);
      setText(els.heroSub, 'Up to ' + pct + '% off, until ' + end.weekday + ' ' + end.time + '.');
    } catch (e) {
      console.warn('BCF page: hero line not written');
    }
  }

  // Small print: dates, limits and the 60% rule come from the config.
  function renderPrint(config, shown) {
    try {
      const dates = parseDates(config);
      if (dates) showLine(els.printDates, 'Black Cat Friday runs from ' + irishStamp(dates.start) + ', to ' + irishStamp(dates.end) + ', Irish time.');
    } catch (e) {
      console.warn('BCF page: dates not formatted');
    }

    // Caps, the 60% rule and "no codes" belong to the enabled campaign: with it off (Plan B) none of them applies.
    if (config.enabled === true) showLine(els.printCodes, "Discount codes can't be used during Black Cat Friday. Free shipping over €150 still applies, based on your cart before discounts.");

    if (config.enabled === true && shown.vault > 0 && config.vault && Array.isArray(config.vault.items)) {
      const caps = config.vault.items.map(i => i && i.capPerOrder).filter(c => Number.isInteger(c) && c > 0);
      if (caps.length > 0) {
        const low = Math.min.apply(null, caps);
        const high = Math.max.apply(null, caps);
        showLine(els.printCap, (low === high ? 'Vault items are limited to ' + low + ' per order.' : 'Vault items are limited per order, between ' + low + ' and ' + high + '.') +
          " When they're gone, they're gone.");
      }
      const boost = boostOf(config);
      if (boost && Number.isInteger(boost.maxUnitsPerOrder) && boost.maxUnitsPerOrder > 0) {
        showLine(els.printBoost, 'The ' + boost.discountPercent + '% applies to up to ' + boost.maxUnitsPerOrder +
          " Vault units per order, when your cart has another item of €" + euros(boost.minLineCents) + " or more that isn't from the Vault.");
      }
    }

    const bundle = Array.isArray(config.bundles) ? config.bundles[0] : null;
    if (shown.kit && bundle && Number.isInteger(bundle.capPerOrder) && bundle.capPerOrder > 0) {
      showLine(els.printKit, 'The Sumi Set is limited to ' + bundle.capPerOrder + ' per order.');
    }
    if (shown.machines > 0) showLine(els.printMachines, 'Machines and power supplies are made to order.');
  }

  // One failing section never takes the others down.
  function attempt(fn, fallback) {
    try { return fn(); } catch (e) {
      console.warn('BCF page: section unavailable');
      return fallback;
    }
  }

  /**
   * Fetch the catalog once and render every section into the DOM (still
   * hidden: applyPhase decides what is visible). Resolves to the counts,
   * zeros on any failure. Never rejects.
   */
  function getContent() {
    if (contentPromise) return contentPromise;
    contentPromise = configPromise.then(async config => {
      if (!config) return content;

      const res = await fetch('/api/catalog?type=products');
      if (!res.ok) return content; // 429 included
      const rows = await res.json();
      if (!Array.isArray(rows)) return content;

      const catalog = await loadLocalCatalog();
      // Vault first: without Vault cards nothing on the page may promise the 60% (no Unlock section, no "unlocks" line).
      const vault = attempt(() => renderVault(config, rows, catalog), 0);
      const promoted = attempt(() => renderPromoted(config, rows, catalog, vault > 0), { unlock: 0, machines: 0, more: 0 });
      const next = {
        vault,
        kit: attempt(() => renderKit(config, rows, catalog), false),
        unlock: promoted.unlock,
        machines: promoted.machines,
        more: promoted.more,
        catalogOk: true // the catalog answered; zero promotions is then a real state, not a failure
      };
      if (anyContent(next)) attempt(() => renderPrint(config, next), null);
      const boost = next.vault > 0 ? boostOf(config) : null;
      setText(els.restText, 'Every other product is still in the shop.' +
        (boost ? ' Anything of €' + euros(boost.minLineCents) + ' or more also unlocks your ' + boost.discountPercent + '%.' : ''));
      content = next;
      return content;
    }).catch(() => {
      console.warn('BCF page: content unavailable');
      return content;
    }).then(c => { contentDone = true; return c; });
    return contentPromise;
  }

  function anyContent(c) {
    return c.vault > 0 || c.kit || c.unlock > 0 || c.machines > 0 || c.more > 0;
  }

  // ──────────────────────────────────────────────────────────────
  // Phase
  // ──────────────────────────────────────────────────────────────

  // Everything below the hero is for the live phase only, in every mode.
  function applyPhase() {
    const live = currentPhase() === 'live';
    // A card only shows when what it promises is on the page.
    const cardOn = { vault: content.vault > 0, boost: content.vault > 0, kit: content.kit };
    let anyCard = false;
    let onCount = 0;
    Object.keys(cardOn).forEach(name => {
      const card = document.querySelector('[data-bcf-card="' + name + '"]');
      const on = live && howCards[name] && cardOn[name];
      if (card) card.hidden = !on;
      anyCard = anyCard || on;
      if (on) onCount++;
    });
    // Live with zero promotions in the catalog (e.g. the first minutes of Friday, before the
    // CRM has them): no "how it works" promising a Vault that is not there, and a calm line instead.
    const promos = content.vault > 0 || content.unlock > 0 || content.machines > 0 || content.more > 0;
    els.how.hidden = !anyCard || !promos;
    // Live and the catalog step is over, but no promoted product (CRM not ready yet, empty
    // catalog, 429 or network): the calm line, no "up to 60%" line, and the shop links.
    const waiting = live && contentDone && !promos;
    if (els.wait) els.wait.hidden = !waiting;
    if (els.heroSub) els.heroSub.hidden = waiting;
    if (els.howEyebrow) setText(els.howEyebrow, onCount === 3 ? 'three ways to save' : 'ways to save');
    // The hero buttons point at #vault and #how: only useful when those are shown.
    if (els.actions) els.actions.hidden = !(live && content.vault > 0);
    els.vault.hidden = !(live && content.vault > 0);
    if (els.kit) els.kit.hidden = !(live && content.kit);
    if (els.unlock) els.unlock.hidden = !(live && content.unlock > 0);
    if (els.machines) els.machines.hidden = !(live && content.machines > 0);
    if (els.more) els.more.hidden = !(live && content.more > 0);
    const any = live && anyContent(content);
    if (els.rest) els.rest.hidden = !(any || waiting);
    if (els.print) els.print.hidden = !any;
  }

  // Plan B: the countdown writes nothing, so this file keeps the hero in step
  // with the dates (phase, small line and dates text).
  function syncHeroPhase() {
    if (!planBDates || !hero) return;
    const phase = currentPhase();
    if (hero.getAttribute('data-bcf-phase') === phase) return;
    hero.setAttribute('data-bcf-phase', phase);
    const small = hero.querySelector('[data-bcf-small]');
    const dates = hero.querySelector('[data-bcf-dates]');
    if (small) setText(small, phase === 'before' ? "something's coming" : phase === 'ended' ? 'see you next year' : '');
    if (dates) setText(dates, phase === 'ended' ? 'THANKS FOR SHOPPING' : heroTexts);
  }

  function evaluate() {
    syncHeroPhase();
    applyPhase();
    if (currentPhase() !== 'live') return;
    // The phase may have changed while the fetch was running: applyPhase re-reads it.
    getContent().then(applyPhase);
  }

  // Plan B only: one interval re-checks the phase, stopped while the tab is hidden.
  function syncClock() {
    if (document.hidden) {
      if (clock !== null) { clearInterval(clock); clock = null; }
      return;
    }
    if (clock === null) clock = setInterval(evaluate, CLOCK_MS);
    evaluate();
  }

  // ──────────────────────────────────────────────────────────────
  // Entry point
  // ──────────────────────────────────────────────────────────────

  function init() {
    hero = document.querySelector('.bcf-hero[data-bcf-phase]');
    els.how = document.getElementById('how');
    els.vault = document.getElementById('vault');
    els.grid = document.getElementById('bcf-vault-grid');
    els.vaultSub = document.getElementById('bcf-vault-sub');
    els.heroSub = hero ? hero.querySelector('[data-bcf-sub]') : null;
    els.actions = hero ? hero.querySelector('[data-bcf-for="live"]') : null;
    els.kit = document.getElementById('sumi');
    els.kitImg = document.getElementById('bcf-kit-img');
    els.kitLink = document.getElementById('bcf-kit-link');
    els.kitPrices = document.getElementById('bcf-kit-prices');
    els.kitGreys = document.getElementById('bcf-kit-greys');
    els.kitCaption = document.getElementById('bcf-kit-caption');
    els.kitAdd = document.getElementById('bcf-kit-add');
    els.kitNote = document.getElementById('bcf-kit-note');
    els.unlock = document.getElementById('unlock');
    els.unlockGrid = document.getElementById('bcf-unlock-grid');
    els.unlockTitle = document.getElementById('bcf-unlock-title');
    els.unlockSub = document.getElementById('bcf-unlock-sub');
    els.machines = document.getElementById('machines');
    els.machinesGrid = document.getElementById('bcf-machines-grid');
    els.more = document.getElementById('more');
    els.moreGrid = document.getElementById('bcf-more-grid');
    els.rest = document.getElementById('rest');
    els.print = document.getElementById('small-print');
    els.printDates = document.getElementById('bcf-print-dates');
    els.printCap = document.getElementById('bcf-print-cap');
    els.printBoost = document.getElementById('bcf-print-boost');
    els.printKit = document.getElementById('bcf-print-kit');
    els.printCodes = document.getElementById('bcf-print-codes');
    els.restText = document.getElementById('bcf-rest-text');
    els.howEyebrow = document.getElementById('bcf-how-eyebrow');
    els.wait = document.getElementById('bcf-wait');
    els.printMachines = document.getElementById('bcf-print-machines');
    if (!hero || !els.how || !els.vault || !els.grid) return;
    if (!els.kitImg || !els.kitLink || !els.kitPrices || !els.kitGreys || !els.kitCaption) els.kit = null;
    if (!els.unlockGrid) els.unlock = null;
    if (!els.machinesGrid) els.machines = null;
    if (!els.moreGrid) els.more = null;
    if (els.kitAdd && els.kitNote) {
      els.kitAdd.addEventListener('click', onKitAdd);
      window.addEventListener('cart-updated', updateKitButton);
    } else {
      els.kitAdd = null;
    }
    const heroDates = hero.querySelector('[data-bcf-dates]');
    heroTexts = heroDates ? heroDates.textContent : '';

    configPromise = loadConfig();
    configPromise.then(config => {
      renderHow(config);
      renderHeroSub(config);
      if (planBDates) {
        document.addEventListener('visibilitychange', syncClock);
        syncClock();
      }
    });

    evaluate();
    if (typeof MutationObserver === 'function') {
      new MutationObserver(evaluate).observe(hero, { attributes: true, attributeFilter: ['data-bcf-phase'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
