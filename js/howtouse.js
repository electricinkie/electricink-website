// ========================================
// HOW TO USE
// 1. Accordion (768px and down): each product name becomes a <button
//    aria-expanded>. Content is visible in the HTML; the script only collapses
//    it, and collapsed content gets `hidden` so its links leave the tab order.
// 2. Header offset: the header is injected later by the shared header
//    scripts, so its height is measured when it appears (CSS has fallbacks).
// 3. Phase index: marks the phase on screen with aria-current.
// ========================================

(function () {
  'use strict';

  const main = document.querySelector('.howtouse-main');
  if (!main) return;

  const MOBILE = window.matchMedia('(max-width: 768px)');
  const STRIP = window.matchMedia('(max-width: 1099px)');
  const products = Array.from(main.querySelectorAll('.howtouse-product'));

  // ────────── Accordion ──────────
  function partsOf(product) {
    const header = product.querySelector('.howtouse-product-header');
    return {
      header,
      title: header.querySelector('h3, h4'),
      content: product.querySelector('.howtouse-product-content')
    };
  }

  function setOpen(product, open) {
    const { content } = partsOf(product);
    const button = product.querySelector('.howtouse-toggle');
    content.hidden = !open;
    product.classList.toggle('is-open', open);
    if (button) button.setAttribute('aria-expanded', String(open));
  }

  function toggle(product) {
    const { header } = partsOf(product);
    const willOpen = !product.classList.contains('is-open');
    const topBefore = header.getBoundingClientRect().top;

    // one open at a time (as before)
    products.forEach(p => {
      if (p !== product && p.classList.contains('is-open')) setOpen(p, false);
    });
    setOpen(product, willOpen);

    // closing a product above would pull this one up: keep it where it was tapped
    const shift = header.getBoundingClientRect().top - topBefore;
    if (shift !== 0) window.scrollBy(0, shift);
  }

  function makeCollapsible(product) {
    const { title, content } = partsOf(product);
    if (!title || !content || title.querySelector('.howtouse-toggle')) return;
    if (!content.id) content.id = 'howtouse-' + product.dataset.product;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'howtouse-toggle';
    button.setAttribute('aria-controls', content.id);
    while (title.firstChild) button.appendChild(title.firstChild);
    title.appendChild(button);
    button.addEventListener('click', () => toggle(product));

    product.classList.add('is-collapsible');
    setOpen(product, false);
  }

  function makeStatic(product) {
    const { title, content } = partsOf(product);
    const button = title && title.querySelector('.howtouse-toggle');
    if (button) {
      while (button.firstChild) title.insertBefore(button.firstChild, button);
      button.remove();
    }
    product.classList.remove('is-collapsible', 'is-open');
    if (content) content.hidden = false;
  }

  function applyMode() {
    products.forEach(MOBILE.matches ? makeCollapsible : makeStatic);
  }

  applyMode();
  // only when crossing the breakpoint: the mobile toolbar resizing the
  // viewport while scrolling must not close what the user opened
  if (MOBILE.addEventListener) MOBILE.addEventListener('change', applyMode);
  else MOBILE.addListener(applyMode);

  // ────────── Header offset ──────────
  function headerHeight() {
    let h = 0;
    document.querySelectorAll('.site-header, .desktop-header').forEach(el => {
      h = Math.max(h, el.offsetHeight);
    });
    return h;
  }

  function syncHeader() {
    const h = headerHeight();
    if (h > 0) main.style.setProperty('--htu-header-h', h + 'px');
  }

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(syncHeader);
    const watch = () => {
      document.querySelectorAll('.site-header, .desktop-header').forEach(el => ro.observe(el));
    };
    watch();
    new MutationObserver(watch).observe(document.body, { childList: true });
  }
  syncHeader();

  // ────────── Phase index ──────────
  const nav = main.querySelector('.howtouse-index');
  if (!nav) return;

  const list = nav.querySelector('ol');
  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  const sections = links.map(a => document.getElementById(a.hash.slice(1)));
  let current = -2;
  let ticking = false;

  function updateActive() {
    ticking = false;
    const offset = STRIP.matches
      ? headerHeight() + nav.offsetHeight + 16
      : headerHeight() + 24;

    let index = -1;
    sections.forEach((section, i) => {
      if (section && section.getBoundingClientRect().top - offset <= 2) index = i;
    });
    if (index === current) return;
    current = index;

    links.forEach((a, i) => {
      if (i === index) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });

    // keep the active phase visible in the horizontal strip
    if (STRIP.matches && index >= 0 && list) {
      const item = links[index].parentElement;
      list.scrollLeft = item.offsetLeft - parseFloat(getComputedStyle(list).paddingLeft || '0');
    }
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateActive);
    }
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  updateActive();
})();
