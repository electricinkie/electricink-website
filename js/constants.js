export const SHIPPING_METHODS = {
  STANDARD: 'standard',
  SAME_DAY: 'same-day',
  PICKUP: 'pickup'
};

// Must match backend `api/lib/constants.js` value
// This controls UI displays and client-side shipping calculations
export const FREE_SHIPPING_THRESHOLD = 120;

export const PRODUCT_FIELDS = {
  ID: 'id',
  STRIPE_PRICE_ID: 'stripe_price_id',
  VARIANT: 'variant'
};
