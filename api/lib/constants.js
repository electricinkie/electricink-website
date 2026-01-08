const SHIPPING_METHODS = {
  STANDARD: 'standard',
  SAME_DAY: 'same-day',
  PICKUP: 'pickup'
};

// Authoritative threshold for free shipping - used by billing logic
// DO NOT change without updating js/constants.js and all HTML content
const FREE_SHIPPING_THRESHOLD = 120;

const PRODUCT_FIELDS = {
  ID: 'id',
  STRIPE_PRICE_ID: 'stripe_price_id',
  VARIANT: 'variant'
};

module.exports = {
  SHIPPING_METHODS,
  FREE_SHIPPING_THRESHOLD,
  PRODUCT_FIELDS
};
