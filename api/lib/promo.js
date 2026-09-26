// Shared promotion helpers — extracted verbatim from create-payment-intent.js.
// Active promotion: promo_price_ex present and either no expiry or an
// expiry still in the future. Anything else falls back to price_ex.
// nowMs is a parameter (with a default) so callers inside a loop can capture
// Date.now() once and reuse it for every row, preserving existing behaviour.
function isPromoActive(promo_price_ex, promo_ends_at, nowMs = Date.now()) {
  return (
    promo_price_ex !== null &&
    promo_price_ex !== undefined &&
    (promo_ends_at === null ||
      promo_ends_at === undefined ||
      new Date(promo_ends_at).getTime() > nowMs)
  );
}

function getEffectivePriceEx(price_ex, promo_price_ex, promo_ends_at, nowMs = Date.now()) {
  return isPromoActive(promo_price_ex, promo_ends_at, nowMs) ? promo_price_ex : price_ex;
}

module.exports = { isPromoActive, getEffectivePriceEx };
