function toGross(priceEx) {
  const p = parseFloat(priceEx);
  if (isNaN(p) || p <= 0) return null;
  return parseFloat((p * 1.23).toFixed(2));
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
    // Multiple distinct prices: unchanged "from €X", no promo handling for now.
    if (min !== max) return { text: `from €${min.toFixed(2)}` };
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
  priceEl.appendChild(was);
  priceEl.appendChild(now);
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
