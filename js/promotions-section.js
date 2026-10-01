/**
 * Promotions Section
 *
 * Populates #promotions with the products that currently have an active
 * promotion, then wires the same hand-written swiper used by
 * js/new-arrivals.js (no external library anywhere on this page).
 *
 * Two deliberate differences from js/new-arrivals.js:
 *  - the dots are generated one per rendered card, so they can never drift
 *    out of sync with the card count;
 *  - the scroll affordances are decided by measuring the real overflow,
 *    not by assuming a card count, and re-measured on resize.
 */

(function () {
  'use strict';

  // Never render more than this, however many promotions are running.
  const MAX_PRODUCTS = 12;

  // Resize re-measure debounce.
  const RESIZE_DEBOUNCE_MS = 180;

  // Same list and same exact paths as js/category-page.js:204-211. Note the
  // inconsistent product-/products- prefixes — they are literal filenames.
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

  // ──────────────────────────────────────────────────────────────
  // Pricing — copied from js/category-page.js:264-283, unchanged
  // ──────────────────────────────────────────────────────────────

  // Gross price (VAT incl.) from an ex-VAT value, same rounding used everywhere.
  const toGross = (priceEx) => {
    const p = parseFloat(priceEx);
    return isNaN(p) ? null : parseFloat((p * 1.23).toFixed(2));
  };

  // Effective price is what the customer pays: the promo price when a
  // promotion is running, the normal price otherwise. effective_price_ex is
  // added by /api/catalog; fall back to price_ex when it is absent so an
  // older payload keeps behaving exactly as before.
  const resolveRowPrices = (row) => {
    const normal = toGross(row.price_ex);
    const effective = toGross(row.effective_price_ex);
    return {
      price: effective !== null ? effective : normal,
      wasPrice: (row.promo_active === true && normal !== null && effective !== null && normal > effective)
        ? normal
        : undefined
    };
  };

  // ──────────────────────────────────────────────────────────────
  // Data
  // ──────────────────────────────────────────────────────────────

  /**
   * Group the flat catalog rows by product id and keep only the products with
   * at least one promoted variant. Same grouping shape as
   * js/category-page.js:255-262.
   */
  function collectPromotedProducts(rows) {
    const byProduct = rows.reduce((acc, item) => {
      if (!item || !item.id) return acc;
      acc[item.id] = acc[item.id] || [];
      acc[item.id].push(item);
      return acc;
    }, {});

    return Object.keys(byProduct)
      .filter(id => byProduct[id].some(row => row.promo_active === true))
      .map(id => ({ id, entries: byProduct[id] }));
  }

  /**
   * Fetch the local product JSON files. Used only to resolve a name and an
   * image per product; a file that fails to load is skipped, exactly as
   * js/category-page.js does.
   */
  async function loadLocalCatalog() {
    const catalog = {};
    const responses = await Promise.all(
      PRODUCT_FILES.map(p => fetch(p).catch(e => ({ ok: false, error: e })))
    );

    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      if (!res || !res.ok) {
        console.warn('Could not load', PRODUCT_FILES[i], (res && res.error) || 'Unknown error');
        continue;
      }
      try {
        Object.assign(catalog, await res.json());
      } catch (e) {
        console.warn('Could not parse', PRODUCT_FILES[i], e);
      }
    }
    return catalog;
  }

  /** Name/category/description, tolerating both the old flat and the newer `basic` shape. */
  function resolveMeta(data) {
    return {
      name: data.basic?.name || data.name || '',
      category: data.basic?.category || data.category || '',
      description: data.basic?.description || data.description || ''
    };
  }

  /** First usable image across every shape present in the local JSON files. */
  function resolveImage(data) {
    if (data.images?.cover) return data.images.cover;
    if (data.media?.main_image) return data.media.main_image;
    if (data.image) return data.image;
    if (Array.isArray(data.images) && data.images[0]) return data.images[0];
    if (data.media?.gallery?.[0]) return data.media.gallery[0];
    return null;
  }

  /**
   * Price for one card, following js/category-page.js:400-423.
   *
   * Multi-variant products show "from €X" at the lowest effective price — the
   * minimum, not variants[0], for the reason documented in category-page.js:
   * a discount deep enough to reorder the variants would otherwise show the
   * wrong "from". Single-price products show the was/now pair.
   *
   * price_range.display is deliberately ignored here (category-page.js prefers
   * it when present): it is a static string in the local JSON and would mask
   * the very promo price this section exists to advertise.
   */
  function resolvePriceDisplay(local, entries) {
    if (Array.isArray(local.variants) && local.variants.length > 0) {
      const prices = [];
      local.variants.forEach(variant => {
        if (!variant) return;
        let found = entries.find(e => e.variant_id === variant.id);
        if (!found) found = entries.find(e => e.variant_id === `${local.id || ''}-${variant.id}`);
        if (!found) found = entries.find(e => variant.id && e.variant_id && e.variant_id.endsWith(variant.id));
        if (!found) return;
        const resolved = resolveRowPrices(found);
        if (typeof resolved.price === 'number' && !isNaN(resolved.price)) prices.push(resolved.price);
      });

      // No variant matched a catalog row: fall back to every promoted row we
      // have for this product, so the card still shows a real price.
      if (prices.length === 0) {
        entries.forEach(row => {
          const resolved = resolveRowPrices(row);
          if (typeof resolved.price === 'number' && !isNaN(resolved.price)) prices.push(resolved.price);
        });
      }
      if (prices.length === 0) return null;
      return { text: `from €${Math.min(...prices).toFixed(2)}` };
    }

    const resolved = resolveRowPrices(entries[0]);
    if (typeof resolved.price !== 'number' || isNaN(resolved.price)) return null;
    if (typeof resolved.wasPrice === 'number' && !isNaN(resolved.wasPrice) && resolved.wasPrice > resolved.price) {
      return { was: `€${resolved.wasPrice.toFixed(2)}`, now: `€${resolved.price.toFixed(2)}` };
    }
    return { text: `€${resolved.price.toFixed(2)}` };
  }

  // ──────────────────────────────────────────────────────────────
  // Rendering — createElement only, never innerHTML with remote data
  // ──────────────────────────────────────────────────────────────

  function buildCard(product, catalog) {
    const local = catalog[product.id];
    if (!local) return null;

    const image = resolveImage(local);
    const meta = resolveMeta(local);
    const price = resolvePriceDisplay({ ...local, id: product.id }, product.entries);
    // A card with no name, no image or no price would render broken — the site
    // has no placeholder image to fall back on.
    if (!image || !meta.name || !price) return null;

    const card = document.createElement('a');
    card.className = 'promotions-card';
    card.href = `/products.html?id=${encodeURIComponent(product.id)}`;
    card.dataset.productId = product.id;

    const imageWrap = document.createElement('div');
    imageWrap.className = 'promotions-card-image';
    const img = document.createElement('img');
    img.src = image;
    img.alt = meta.name;
    img.loading = 'lazy';
    imageWrap.appendChild(img);

    const info = document.createElement('div');
    info.className = 'promotions-card-info';

    const categoryEl = document.createElement('div');
    categoryEl.className = 'promotions-card-category';
    categoryEl.textContent = meta.category;

    const titleEl = document.createElement('h3');
    titleEl.className = 'promotions-card-title';
    titleEl.textContent = meta.name;

    const descriptionEl = document.createElement('p');
    descriptionEl.className = 'promotions-card-description';
    descriptionEl.textContent = meta.description;

    const footer = document.createElement('div');
    footer.className = 'promotions-card-footer';

    const priceEl = document.createElement('div');
    priceEl.className = 'promotions-card-price';
    if (price.text) {
      priceEl.textContent = price.text;
    } else {
      // Reuses the global .price-was/.price-now pair from css/main.css.
      const was = document.createElement('span');
      was.className = 'price-was';
      was.textContent = price.was;
      const now = document.createElement('span');
      now.className = 'price-now';
      now.textContent = price.now;
      priceEl.appendChild(was);
      priceEl.appendChild(now);
    }

    const cta = document.createElement('div');
    cta.className = 'promotions-card-cta';
    cta.textContent = 'Shop Now →';

    footer.appendChild(priceEl);
    footer.appendChild(cta);

    info.appendChild(categoryEl);
    info.appendChild(titleEl);
    info.appendChild(descriptionEl);
    info.appendChild(footer);

    card.appendChild(imageWrap);
    card.appendChild(info);

    return card;
  }

  /** One dot per card, always — this is what keeps them from drifting apart. */
  function buildDots(dotsEl, count) {
    dotsEl.textContent = '';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.className = i === 0 ? 'promotions-dot active' : 'promotions-dot';
      dot.setAttribute('aria-label', `Go to promotion ${i + 1}`);
      dotsEl.appendChild(dot);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Swiper
  // ──────────────────────────────────────────────────────────────

  function initSwiper(refs) {
    const { track, dots, cards, prevBtn, nextBtn } = refs;

    function hasOverflow() {
      return track.scrollWidth > track.clientWidth;
    }

    function updateArrows() {
      if (!prevBtn || !nextBtn) return;
      const atStart = track.scrollLeft <= 1;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
      prevBtn.classList.toggle('disabled', atStart);
      nextBtn.classList.toggle('disabled', atEnd);
    }

    /**
     * Measure the real overflow and mark the track accordingly. The CSS hides
     * the arrows and dots while .no-overflow is present, so nothing here has
     * to know how many cards there are.
     */
    function applyOverflowState() {
      const overflowing = hasOverflow();
      track.classList.toggle('no-overflow', !overflowing);
      if (overflowing) updateArrows();
    }

    function setActiveDot(index) {
      dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    }

    function scrollToCard(index) {
      const card = cards[index];
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }

    function scrollByCard(direction) {
      if (!cards[0]) return;
      const cardWidth = cards[0].offsetWidth + 20; // Including gap
      track.scrollBy({
        left: direction === 'next' ? cardWidth : -cardWidth,
        behavior: 'smooth'
      });
    }

    // Prevent scroll propagation to page
    track.addEventListener('wheel', (e) => {
      const atStart = track.scrollLeft === 0;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
      if ((e.deltaX > 0 && !atEnd) || (e.deltaX < 0 && !atStart)) {
        e.stopPropagation();
      }
    }, { passive: false });

    dots.forEach((dot, index) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToCard(index);
      });
    });

    if (prevBtn) prevBtn.addEventListener('click', () => scrollByCard('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => scrollByCard('next'));

    track.addEventListener('scroll', updateArrows);

    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = cards.indexOf(entry.target);
            if (index !== -1) setActiveDot(index);
          }
        });
      }, { root: track, threshold: 0.6, rootMargin: '0px' });

      cards.forEach(card => observer.observe(card));
    }

    // Overflow depends on the viewport, so re-measure when it changes.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyOverflowState, RESIZE_DEBOUNCE_MS);
    });

    applyOverflowState();
  }

  // ──────────────────────────────────────────────────────────────
  // Entry point
  // ──────────────────────────────────────────────────────────────

  async function init() {
    const section = document.getElementById('promotions');
    const track = document.getElementById('promotionsTrack');
    const dotsEl = document.getElementById('promotionsDots');
    if (!section || !track || !dotsEl) return;

    // 1. Is anything on promotion at all? Nothing else happens until this
    //    says yes — in particular the local JSON files are never fetched.
    let rows;
    try {
      const res = await fetch('/api/catalog?type=products');
      if (!res.ok) return;
      rows = await res.json();
    } catch (e) {
      console.warn('Promotions: could not fetch catalog', e);
      return;
    }
    if (!Array.isArray(rows)) return;

    const promoted = collectPromotedProducts(rows);
    if (promoted.length === 0) return;

    // 2. Only now resolve names and images.
    const catalog = await loadLocalCatalog();

    const cards = promoted
      .slice(0, MAX_PRODUCTS)
      .map(product => buildCard(product, catalog))
      .filter(Boolean);
    if (cards.length === 0) return;

    cards.forEach(card => track.appendChild(card));
    buildDots(dotsEl, cards.length);

    // 3. Reveal, then measure — the track has no layout while hidden.
    section.style.display = '';

    const refs = {
      track,
      dots: Array.from(dotsEl.querySelectorAll('.promotions-dot')),
      cards,
      prevBtn: section.querySelector('.promotions-nav-prev'),
      nextBtn: section.querySelector('.promotions-nav-next')
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => initSwiper(refs));
    } else {
      initSwiper(refs);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
