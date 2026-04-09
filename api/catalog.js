const https = require('https');

const ALLOWED_ORIGINS = new Set([
  'https://electricink.ie',
  'https://www.electricink.ie'
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function forwardGet(path, apiKey) {
  const options = {
    hostname: 'ei-internal-production.up.railway.app',
    port: 443,
    path,
    method: 'GET',
    headers: {
      'x-crm-secret': apiKey,
      'Accept': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data, headers: res.headers });
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  // Respond to CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const INTERNAL_API_KEY = process.env.CRM_SECRET || '';
  if (!INTERNAL_API_KEY) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'INTERNAL_API_KEY not configured on server' }));
    return;
  }

  // Parse query params
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid request URL' }));
    return;
  }

  const type = url.searchParams.get('type');
  if (!type) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid type' }));
    return;
  }

  let targetPath;
  if (type === 'products') {
    targetPath = '/api/products';
  } else if (type === 'product') {
    const id = url.searchParams.get('id');
    if (!id) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid type' }));
      return;
    }
    targetPath = `/api/products/${encodeURIComponent(id)}`;
  } else {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid type' }));
    return;
  }

  try {
    const result = await forwardGet(targetPath, INTERNAL_API_KEY);

    // Mirror status from internal service
    res.statusCode = result.statusCode || 502;
    // Successful responses can be cached briefly
    if (res.statusCode >= 200 && res.statusCode < 300) {
      res.setHeader('Cache-Control', 'public, max-age=60');
    }
    res.setHeader('Content-Type', 'application/json');

    // Try to forward body as-is. If it's already a stringified JSON, send it.
    try {
      // If body is empty, send empty JSON
      const body = result.body && result.body.length ? result.body : '{}';
      res.end(body);
    } catch (e) {
      res.end(JSON.stringify({ error: 'Failed to parse upstream response' }));
    }
  } catch (err) {
    // Network or other error contacting internal API
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Error contacting internal API' }));
  }
};
