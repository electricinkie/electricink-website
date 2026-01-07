
const admin = require('firebase-admin');

// Usa credenciais de ambiente ou application default
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'electricink-ie'
  });
}

const db = admin.firestore();
const OrderManager = require('../api/oms/order-manager.js');

async function test() {
  const oms = new OrderManager(db);
  
  console.log('🧪 Teste 1: Gerar número de pedido');
  const orderNumber = await oms.generateOrderNumber();
  console.log('✅', orderNumber);
  
  console.log('\n🧪 Teste 2: Buscar order existente');
  // COLOQUE UM paymentIntentId REAL DO SEU FIRESTORE AQUI
  const testOrderId = 'pi_xxxxx';
  
  try {
    const enrichedNumber = await oms.enrichOrder(testOrderId);
    console.log('✅ Order enriquecida:', enrichedNumber);
  } catch (err) {
    console.log('⚠️ Order não encontrada (normal se ID inválido)');
  }
  
  process.exit(0);
}

test();
