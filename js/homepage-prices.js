async function fetchPrice(productId) {
  try {
    const res = await fetch(`/api/catalog?type=product&id=${encodeURIComponent(productId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    const variants = Array.isArray(data) ? data : [];
    if (variants.length === 0) return null;
    const prices = variants
      .map(v => parseFloat(v.price_ex))
      .filter(p => !isNaN(p) && p > 0)
      .map(p => parseFloat((p * 1.23).toFixed(2)));
    if (prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `€${min.toFixed(2)}` : `from €${min.toFixed(2)}`;
  } catch {
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const cards = document.querySelectorAll('[data-product-id]');
  await Promise.all(Array.from(cards).map(async card => {
    const id = card.dataset.productId;
    const priceEl = card.querySelector('.new-product-price, .bestseller-price');
    if (!priceEl) return;
    const price = await fetchPrice(id);
    if (price) priceEl.textContent = price;
  }));
});
