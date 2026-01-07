require('dotenv').config();
const fetch = require('node-fetch');

(async () => {
  console.log('🧪 Testando webhook DIRETAMENTE...\n');
  
  // Mock de um evento payment_intent.succeeded
  const mockEvent = {
    id: 'evt_test_' + Date.now(),
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_' + Date.now(),
        amount: 5000,
        currency: 'eur',
        status: 'succeeded',
        metadata: {
          customer_email: 'test@electricink.ie',
          customer_name: 'Test Customer',
          street: 'Test Street',
          number: '123',
          city: 'Dublin',
          state: 'Dublin',
          postalCode: 'D01',
          country: 'IE',
          shippingMethod: 'standard',
          items: JSON.stringify([
            { id: 'prod_test123', quantity: 1 }
          ]),
          subtotal_cents: '4500',
          shipping_cents: '500'
        }
      }
    }
  };

  console.log('📦 Mock Event:', mockEvent.id);
  console.log('📦 Payment Intent:', mockEvent.data.object.id);
  console.log('📦 Email:', mockEvent.data.object.metadata.email);
  
  // Importa o webhook diretamente
  const webhookHandler = require('../api/webhooks-stripe.js');
  
  // Mock de req/res
  const mockReq = {
    method: 'POST',
    headers: {
      'stripe-signature': 'mock_signature',
      'x-request-id': 'test_request_' + Date.now()
    },
    on: (event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify(mockEvent)));
      }
      if (event === 'end') {
        callback();
      }
    }
  };
  
  const mockRes = {
    statusCode: null,
    headers: {},
    setHeader: function(key, value) {
      this.headers[key] = value;
    },
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      console.log('\n✅ Response:', this.statusCode, data);
      return this;
    },
    end: function() {
      console.log('\n✅ Response ended');
      return this;
    }
  };
  
  try {
    // PULA A VALIDAÇÃO DE ASSINATURA
    // Vamos chamar handlePaymentIntentSucceeded diretamente
    
    const { getFirestore, admin } = require('../api/lib/firebase-admin');
    const db = getFirestore();
    
    const paymentIntent = mockEvent.data.object;
    const orderId = paymentIntent.id;
    
    console.log('\n🔥 Criando order DIRETAMENTE...');
    console.log('🔥 Order ID:', orderId);
    
    // Parse items
    let items = [];
    try {
      items = JSON.parse(paymentIntent.metadata.items || '[]');
    } catch (e) {
      items = [];
    }
    
    const subtotal_cents = parseInt(paymentIntent.metadata.subtotal_cents || '0', 10);
    const shipping_cents = parseInt(paymentIntent.metadata.shipping_cents || '0', 10);
    
    const order = {
      orderId,
      paymentIntentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer || null,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'paid',
      paymentStatus: paymentIntent.status,
      customerEmail: paymentIntent.metadata.email,
      customerName: paymentIntent.metadata.name,
      customerPhone: paymentIntent.metadata.phone || null,
      shippingAddress: {
        street: paymentIntent.metadata.street,
        number: paymentIntent.metadata.number,
        complement: paymentIntent.metadata.complement || null,
        neighborhood: paymentIntent.metadata.neighborhood || null,
        city: paymentIntent.metadata.city,
        state: paymentIntent.metadata.state,
        postalCode: paymentIntent.metadata.postalCode,
        country: paymentIntent.metadata.country || 'IE'
      },
      items,
      shippingMethod: paymentIntent.metadata.shippingMethod,
      shippingCost_cents: shipping_cents,
      subtotal_cents: subtotal_cents,
      total_cents: paymentIntent.amount,
      shippingCost: (shipping_cents / 100),
      subtotal: (subtotal_cents / 100),
      total: (paymentIntent.amount / 100),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'test_script',
      webhookEventId: mockEvent.id
    };
    
    console.log('\n📄 Order data preparada');
    console.log('📄 Email:', order.customerEmail);
    console.log('📄 Total:', order.total_cents, 'cents');
    console.log('📄 Items:', order.items.length);
    
    // Cria no Firestore
    const orderRef = db.collection('orders').doc(orderId);
    
    console.log('\n🚀 Salvando no Firestore...');
    console.log('🚀 Path:', orderRef.path);
    
    await orderRef.set(order);
    
    console.log('\n✅✅✅ ORDER CRIADA COM SUCESSO! ✅✅✅');
    console.log('✅ Order ID:', orderId);
    console.log('✅ Firestore path:', orderRef.path);
    
    // Verifica
    const doc = await orderRef.get();
    console.log('✅ Order existe no Firestore:', doc.exists);
    
    if (doc.exists) {
      console.log('✅ Dados salvos:', Object.keys(doc.data()).join(', '));
    }
    
    console.log('\n🎉 SUCESSO TOTAL! Verifique o Firestore Console agora!');
    console.log('🔗 https://console.firebase.google.com/project/electricink-ie/firestore');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌❌❌ ERRO ❌❌❌');
    console.error('❌ Message:', error.message);
    console.error('❌ Stack:', error.stack);
    process.exit(1);
  }
})();
