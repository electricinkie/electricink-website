# Electric Ink — Important Notes

- Orders are created exclusively by the server-side Stripe webhook (`/api/webhooks-stripe.js`).
- The client helper `js/orders.js::createOrder()` is deprecated and will throw an error in production and most client environments.
  - For local development/testing only you may enable client-side order creation by setting `window.__ALLOW_CLIENT_ORDER_CREATION = true` in the browser console before invoking the function.
- This policy protects against accidental or malicious client-side writes and ensures consistent order enrichment, sequencing, and integration with the OMS.

If you need to create or modify orders programmatically, implement a secure server-side endpoint and ensure only authenticated server processes can call it (do not re-enable client writes in production).

Indexes:
- Recommended Firestore composite indexes are provided in `firestore.indexes.json`.
  - `orders` by `userId (ASC), createdAt (DESC)` for efficient UID queries
  - `orders` by `customerEmail (ASC), createdAt (DESC)` for legacy email lookups
  - `orders` by `status (ASC), createdAt (DESC)` for admin filtering

Firebase & CSP notes:
- Firebase client SDK is loaded from Google's CDN (`www.gstatic.com`). If your hosting
  environment applies a strict Content Security Policy ensure these sources are allowed.
- Minimal required `script-src` / `connect-src` entries (already present in `vercel.json`):
  - script-src: `https://www.gstatic.com`
  - connect-src: `https://firestore.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.googleapis.com`
- If Firebase fails to load (CDN blocked or network issues), the client initializes in
  graceful-fallback mode which hides Firebase-dependent UI elements. Use `data-firebase-required`
  on elements that should be hidden when Firebase is unavailable and `data-firebase-fallback`
  for fallback placeholders. A generic fallback container with id `firebase-fallback` will
  also be populated with a short message automatically.
