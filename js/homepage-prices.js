function toGross(priceEx) {
  const p = parseFloat(priceEx);
  if (isNaN(p) || p <= 0) return null;
  return parseFloat((p * 1.23).toFixed(2));
}

// Several variants: when the CHEAPEST one (by effective price) is on promotion, its own normal and promo
// prices, like variantPromoDisplay in js/category-page.js; otherwise null (the card keeps "from").
function cheapestPromoPair(rows) {
  let best = null;
  for (const v of rows) {
    const eff = toGross(v.effective_price_ex) !== null ? toGross(v.effective_price_ex) : toGross(v.price_ex);
    if (best === null || eff < best.eff) best = { v, eff };
  }
  if (!best || best.v.promo_active !== true) return null;
  const was = toGross(best.v.price_ex);
  return (was !== null && was > best.eff) ? { was, now: best.eff } : null;
}

async function fetchPrice(productId) {
  try {
    const res = await fetch(`/api/catalog?type=product&id=${encodeURIComponent(productId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    const variants = Array.isArray(data) ? data : [];
    if (variants.length === 0) return null;
    const rows = variants.filter(v => toGross(v.price_ex) !== null);
    if (rows.length === 0) return null;
    const prices = rows.map(v => toGross(v.price_ex));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    // Effective price is what the customer pays: the promo price when a
    // promotion is running, the normal price otherwise. Falls back to price_ex
    // when effective_price_ex is absent, so an older payload behaves as before.
    const effectiveOf = (v) => {
      const eff = toGross(v.effective_price_ex);
      return eff !== null ? eff : toGross(v.price_ex);
    };
    // Multiple distinct prices: "from €X" at the effective price, so the home
    // never shows a higher "from" than category-page.js for the same product.
    // min/max stay on the normal prices, because they also decide the branch
    // below and carry the pre-promo "was".
    if (min !== max) {
      const pair = cheapestPromoPair(rows);
      if (pair) return { was: pair.was, now: pair.now, from: true };
      return { text: `from €${Math.min(...rows.map(effectiveOf)).toFixed(2)}` };
    }
    // Single price with an active promotion: was/now pair. Any missing or
    // non-cheaper promo price falls back to the plain single-price string.
    const promoRow = rows.find(v => v.promo_active === true);
    if (promoRow) {
      const now = toGross(promoRow.effective_price_ex);
      if (now !== null && now < min) return { was: min, now };
    }
    return { text: `€${min.toFixed(2)}` };
  } catch {
    return null;
  }
}

function renderPrice(priceEl, price) {
  if (price.text) {
    priceEl.textContent = price.text;
    return;
  }
  const was = document.createElement('span');
  was.className = 'price-was';
  was.textContent = `€${price.was.toFixed(2)}`;
  const now = document.createElement('span');
  now.className = 'price-now';
  now.textContent = `€${price.now.toFixed(2)}`;
  priceEl.textContent = '';
  if (price.from) priceEl.appendChild(document.createTextNode('from '));
  priceEl.appendChild(was);
  priceEl.appendChild(now);
  // Discount badge, calculated from the two prices shown.
  const off = Math.round((1 - price.now / price.was) * 100);
  if (off > 0 && off < 100) {
    const badge = document.createElement('span');
    badge.textContent = `−${off}%`;
    badge.style.cssText = 'margin-left:8px;padding:2px 6px;border-radius:3px;background:#FFA300;color:#111;font-size:11px;font-weight:700;';
    priceEl.appendChild(badge);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const cards = document.querySelectorAll('[data-product-id]');
  await Promise.all(Array.from(cards).map(async card => {
    const id = card.dataset.productId;
    const priceEl = card.querySelector('.new-product-price, .bestseller-price');
    if (!priceEl) return;
    const price = await fetchPrice(id);
    if (price) renderPrice(priceEl, price);
  }));
});
