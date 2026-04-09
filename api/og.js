const https = require('https');

const FALLBACK_IMAGE = 'https://electricink.ie/images/logos/logo-white.png';
const FALLBACK_TITLE = 'Electric Ink IE - Professional Tattoo Supplies';
const FALLBACK_DESC  = 'Official Electric Ink distributor. Professional supplies, same-day delivery Dublin.';

function fetchProduct(id, apiKey) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'ei-internal-production.up.railway.app',
      port: 443,
      path: `/api/products/${encodeURIComponent(id)}`,
      method: 'GET',
      headers: { 'x-crm-secret': apiKey, 'Accept': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = async (req, res) => {
  let url;
  try { url = new URL(req.url, 'https://electricink.ie'); }
  catch (e) { url = new URL('/', 'https://electricink.ie'); }

  const id = url.searchParams.get('id');
  const apiKey = process.env.CRM_SECRET || '';

  let title = FALLBACK_TITLE;
  let desc  = FALLBACK_DESC;
  let image = FALLBACK_IMAGE;
  let canonical = 'https://electricink.ie/products?id=' + encodeURIComponent(id || '');

  if (id && apiKey) {
    const product = await fetchProduct(id, apiKey);
    if (product && product.name) {
      title = `${product.name} — Electric Ink IE`;
      desc  = product.description || product.short_description || FALLBACK_DESC;
      const img = (product.images && product.images[0]) || product.image || null;
      if (img) image = img.startsWith('http') ? img : `https://electricink.ie${img}`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">
<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="product">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${canonical}">
</head>
<body></body>
</html>`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.end(html);
};
