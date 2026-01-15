/* Test script: calls send-order-email handler for client and admin emails
   Usage: node scripts/email_handler_test.js
*/

require('dotenv').config();
const path = require('path');

(async () => {
  try {
    const sendHandler = require('../api/handlers/send-order-email');

    const sampleOrder = {
      orderNumber: 'TEST_' + Date.now(),
      email: 'test-recipient@example.com',
      customer_email: 'test-recipient@example.com',
      items: [{ id: 'prod_test123', name: 'Produto Teste', quantity: 1, price: 45.00 }],
      shipping: {
        firstName: 'Test',
        lastName: 'User',
        phone: '+35312345678',
        address: 'Test Street 1',
        address2: '',
        city: 'Dublin',
        postalCode: 'D01',
        country: 'IE'
      },
      totals: {
        subtotal: 45.00,
        shippingText: 'FREE',
        vat: 0.00,
        total: 45.00
      }
    };

    function makeFakeReq(type, data) {
      return {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { type, data }
      };
    }

    function makeFakeRes() {
      return {
        _status: 200,
        status(code) { this._status = code; return this; },
        json(obj) { console.log('RES JSON:', obj); return obj; },
        setHeader() {},
        end() {}
      };
    }

    console.log('\n--- Testing CLIENT email (order-confirmation) ---');
    const r1 = await sendHandler(makeFakeReq('order-confirmation', sampleOrder), makeFakeRes());
    console.log('Client result:', r1);

    console.log('\n--- Testing ADMIN email (order-notification-admin) ---');
    // Use data shape expected by admin handler
    const adminData = {
      orderNumber: sampleOrder.orderNumber,
      customer_email: sampleOrder.customer_email,
      shipping: sampleOrder.shipping,
      items: sampleOrder.items,
      totals: sampleOrder.totals
    };
    const r2 = await sendHandler(makeFakeReq('order-notification-admin', adminData), makeFakeRes());
    console.log('Admin result:', r2);

    console.log('\nTest script finished');
  } catch (e) {
    console.error('Test error:', e && e.message);
    console.error(e && e.stack);
    process.exit(1);
  }
})();
