const puppeteer = require('puppeteer');

(async () => {
  const url = process.env.TEST_URL || 'http://localhost:9000/profile.html';
  console.log('Visiting', url);
  const browser = await puppeteer.launch({args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    // allow page scripts to run (compat fallback for older puppeteer)
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(1000);
    } else {
      await new Promise(r => setTimeout(r, 1000));
    }

    const result = await page.evaluate(() => {
      const pick = (sel) => document.querySelector(sel);
      const signIn = pick('#signInCta');
      const ordersList = pick('#ordersList') || pick('#orders-list') || pick('#orders-list');
      const ordersText = ordersList ? ordersList.innerText : document.body.innerText || '';
      const hasSignText = /Sign in to view your orders|Sign in/i.test(ordersText) || (signIn && getComputedStyle(signIn).display !== 'none');
      return {
        signInVisible: !!signIn && getComputedStyle(signIn).display !== 'none',
        ordersTextSnippet: ordersText.slice(0,200),
        hasSignText
      };
    });

    console.log('Result:', result);
    await browser.close();

    if (result.signInVisible || result.hasSignText) {
      console.log('SMOKE TEST: PASS — unauthenticated UI present');
      process.exit(0);
    } else {
      console.error('SMOKE TEST: FAIL — unauthenticated UI not detected');
      process.exit(2);
    }
  } catch (e) {
    console.error('SMOKE TEST: ERROR', e);
    try { await browser.close(); } catch (_) {}
    process.exit(3);
  }
})();
