module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
  
  const config = {
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || ''
  };
  
  res.send(`window.STRIPE_PUBLISHABLE_KEY = "${config.STRIPE_PUBLISHABLE_KEY}";`);
};