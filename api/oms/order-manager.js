const admin = require('firebase-admin');

class OrderManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Gera número de pedido único e sequencial
   * Formato: ORD-YYYYMMDD-NNNN
   */
  async generateOrderNumber() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const counterRef = this.db.collection('counters').doc('orders');
    
    const result = await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef);
      const currentCount = doc.exists ? (doc.data().count || 0) : 0;
      const nextCount = currentCount + 1;
      
      transaction.set(counterRef, { 
        count: nextCount, 
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      return nextCount;
    });
    
    return `ORD-${today}-${String(result).padStart(4, '0')}`;
  }

  /**
   * Enriquece order existente com dados OMS
   * NÃO cria order nova, apenas adiciona campos
   * 
   * 🔧 CORREÇÃO: Preserva userId que já foi setado pelo webhook (authUid)
   */
  async enrichOrder(paymentIntentId) {
    const orderRef = this.db.collection('orders').doc(paymentIntentId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      throw new Error(`Order ${paymentIntentId} not found`);
    }
    
    const orderData = orderDoc.data();
    const orderNumber = await this.generateOrderNumber();
    
    // 🎯 CORREÇÃO CRÍTICA:
    // Se userId já existe (setado pelo webhook via authUid), PRESERVA
    // Se não existe, usa email como fallback (guest checkout)
    const userId = orderData.userId || orderData.customerEmail || 'guest';
    
    // Atualiza order com campos OMS
    await orderRef.update({
      orderNumber: orderNumber,
      userId: userId, // Mantém o authUid ou usa email
      omsEnrichedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Cria evento no histórico
    await this.db.collection('order-events').add({
      orderId: paymentIntentId,
      orderNumber: orderNumber,
      event: 'created',
      from: null,
      to: 'paid',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return orderNumber;
  }

  /**
   * Atualiza status do pedido
   */
  async updateStatus(paymentIntentId, newStatus, note = '') {
    const orderRef = this.db.collection('orders').doc(paymentIntentId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      throw new Error(`Order ${paymentIntentId} not found`);
    }
    
    const orderData = orderDoc.data();
    const oldStatus = orderData.status;
    
    // Atualiza status
    await orderRef.update({
      status: newStatus,
      statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Cria evento
    await this.db.collection('order-events').add({
      orderId: paymentIntentId,
      orderNumber: orderData.orderNumber,
      event: 'status_changed',
      from: oldStatus,
      to: newStatus,
      note: note,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return true;
  }
}

module.exports = OrderManager;