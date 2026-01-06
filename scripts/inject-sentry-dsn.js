#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Usage: set SENTRY_DSN env var and run this script during build/deploy.
// It replaces the empty meta tag in index.html with the DSN value.

const DSN = process.env.SENTRY_DSN || '';
if (!DSN) {
  console.error('inject-sentry-dsn: SENTRY_DSN env var not set. Nothing to do.');
  process.exit(0);
}

const indexPath = path.join(__dirname, '..', 'index.html');
let html;
try {
  html = fs.readFileSync(indexPath, 'utf8');
} catch (err) {
  console.error('inject-sentry-dsn: failed to read index.html', err.message);
  process.exit(1);
}

const before = '<meta name="sentry-dsn" content="">';
const after = `<meta name="sentry-dsn" content="${DSN}">`;

if (!html.includes(before)) {
  console.warn('inject-sentry-dsn: meta tag not found or already populated. Skipping.');
  process.exit(0);
}

const updated = html.replace(before, after);
try {
  fs.writeFileSync(indexPath, updated, 'utf8');
  console.log('inject-sentry-dsn: index.html updated successfully');
} catch (err) {
  console.error('inject-sentry-dsn: failed to write index.html', err.message);
  process.exit(1);
}
