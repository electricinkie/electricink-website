module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
  
  const stripeKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  if (!stripeKey) {
    console.error('[config] STRIPE_PUBLISHABLE_KEY is not set');
  }

  res.send(`window.STRIPE_PUBLISHABLE_KEY = ${JSON.stringify(stripeKey)};`);
};
