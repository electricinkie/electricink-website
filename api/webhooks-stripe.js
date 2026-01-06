/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * STRIPE WEBHOOKS HANDLER (Vercel Serverless)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * Secure webhook handler following Stripe best practices:
 * - Signature verification (CRITICAL for security)
 * - Idempotency (prevent duplicate processing)
 * - Event handling for payment lifecycle
 * - Error logging and monitoring
 * 
 * Events handled:
 * - payment_intent.succeeded (payment completed)
 * - payment_intent.payment_failed (payment declined)
 * - charge.dispute.created (customer disputed charge)
 * - charge.refunded (refund processed)
 * 
 * @see https://stripe.com/docs/webhooks/best-practices
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import Stripe from 'stripe';
import { kv } from '@vercel/kv';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const ADMIN_EMAIL = 'contact@electricink.ie';

// In-memory cache for idempotency (prevent duplicate processing)
// In production with high volume, use Redis or Vercel KV
// Idempotency persistence via Vercel KV
const EVENT_CACHE_TTL_SEC = 24 * 60 * 60; // 24 hours

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VERCEL SERVERLESS CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Disable body parsing - we need raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: Read raw body from request stream
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Get signature from headers
  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    console.error('❌ Webhook: Missing Stripe signature');
    return res.status(400).json({ error: 'Missing Stripe signature' });
  }

  if (!WEBHOOK_SECRET) {
    console.error('❌ Webhook: STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let stripeEvent;

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // VERIFY WEBHOOK SIGNATURE (CRITICAL SECURITY)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      WEBHOOK_SECRET
    );
    
    console.log('✅ Webhook signature verified:', stripeEvent.type);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).json({ 
      error: `Webhook signature verification failed: ${err.message}` 
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IDEMPOTENCY CHECK (Persisted via Vercel KV)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const eventId = stripeEvent.id;
  const alreadyProcessed = await kv.get(eventId);
  if (alreadyProcessed) {
    console.log(`⚠️ Event ${eventId} already processed (idempotency check)`);
    return res.status(200).json({ 
      received: true, 
      status: 'already_processed' 
    });
  }

  // Mark as processed (set TTL 24h)
  await kv.set(eventId, Date.now(), { ex: EVENT_CACHE_TTL_SEC });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROUTE EVENT TO HANDLER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  try {
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(stripeEvent.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(stripeEvent.data.object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(stripeEvent.data.object);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(stripeEvent.data.object);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${stripeEvent.type}`);
    }

    return res.status(200).json({ 
      received: true, 
      event: stripeEvent.type 
    });

  } catch (error) {
    console.error(`❌ Error processing webhook ${stripeEvent.type}:`, error);
    
    // Return 200 to acknowledge receipt (prevent Stripe retries)
    // but log error for monitoring
    return res.status(200).json({ 
      received: true, 
      error: error.message,
      note: 'Event acknowledged but processing failed'
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EVENT HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Handle successful payment
 * - Log order for records
 * - Trigger fulfillment (future: update inventory, create shipping label)
 */
async function handlePaymentSucceeded(paymentIntent) {
  console.log('✅ Payment succeeded:', paymentIntent.id);
  console.log('   Amount:', formatCurrency(paymentIntent.amount, paymentIntent.currency));
  console.log('   Customer:', paymentIntent.metadata?.customer_email || 'N/A');
  
  // Extract order details from metadata
  const orderDetails = {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency.toUpperCase(),
    customerEmail: paymentIntent.metadata?.customer_email,
    customerName: paymentIntent.metadata?.customer_name,
    itemsCount: paymentIntent.metadata?.items_count,
    subtotal: paymentIntent.metadata?.subtotal,
    shipping: paymentIntent.metadata?.shipping,
    status: 'succeeded',
    timestamp: new Date().toISOString()
  };

  // TODO: Save to database/Google Sheets for order management
  // Example integration:
  // await saveToGoogleSheets(orderDetails);
  // await updateInventory(paymentIntent.metadata);
  
  console.log('📦 Order details:', orderDetails);
  
  // Email confirmation already sent by checkout.js
  // No need to duplicate here
}

/**
 * Handle failed payment
 * - Log failure for analysis
 * - Send recovery email to customer (optional)
 */
async function handlePaymentFailed(paymentIntent) {
  console.error('❌ Payment failed:', paymentIntent.id);
  console.error('   Reason:', paymentIntent.last_payment_error?.message || 'Unknown');
  console.error('   Customer:', paymentIntent.metadata?.customer_email || 'N/A');
  
  const failureDetails = {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency.toUpperCase(),
    customerEmail: paymentIntent.metadata?.customer_email,
    failureReason: paymentIntent.last_payment_error?.message || 'Unknown',
    failureCode: paymentIntent.last_payment_error?.code || 'unknown',
    timestamp: new Date().toISOString()
  };

  console.log('📊 Failure details:', failureDetails);

  // TODO: Send payment failed email to customer
  // TODO: Log to analytics for conversion optimization
  // TODO: Trigger abandoned cart recovery flow
  
  // Example:
  // await sendPaymentFailedEmail(failureDetails);
}

/**
 * Handle dispute (chargeback)
 * - CRITICAL: Alert admin immediately
 * - Log dispute details for evidence collection
 */
async function handleDisputeCreated(dispute) {
  console.error('🚨 DISPUTE CREATED:', dispute.id);
  console.error('   Charge:', dispute.charge);
  console.error('   Amount:', formatCurrency(dispute.amount, dispute.currency));
  console.error('   Reason:', dispute.reason);
  console.error('   Status:', dispute.status);

  const disputeDetails = {
    disputeId: dispute.id,
    chargeId: dispute.charge,
    amount: dispute.amount / 100,
    currency: dispute.currency.toUpperCase(),
    reason: dispute.reason,
    status: dispute.status,
    evidenceDueBy: dispute.evidence_details?.due_by ? 
      new Date(dispute.evidence_details.due_by * 1000).toISOString() : 'N/A',
    timestamp: new Date().toISOString()
  };

  console.log('⚠️ Dispute details:', disputeDetails);

  // TODO: Send URGENT email to admin
  // TODO: Retrieve order details for evidence
  // TODO: Set reminder for evidence submission deadline
  
  // Example:
  // await sendDisputeAlert(disputeDetails, ADMIN_EMAIL);
  
  // CRITICAL: You need to respond to dispute within deadline
  // or you automatically lose the dispute!
}

/**
 * Handle refund
 * - Log refund for accounting
 * - Update order status
 */
async function handleChargeRefunded(charge) {
  console.log('💰 Refund processed:', charge.id);
  console.log('   Amount:', formatCurrency(charge.amount_refunded, charge.currency));
  console.log('   Refunded:', charge.refunded ? 'Full' : 'Partial');

  const refundDetails = {
    chargeId: charge.id,
    totalAmount: charge.amount / 100,
    refundedAmount: charge.amount_refunded / 100,
    currency: charge.currency.toUpperCase(),
    refunded: charge.refunded,
    timestamp: new Date().toISOString()
  };

  console.log('📊 Refund details:', refundDetails);

  // TODO: Update order status in database
  // TODO: Send refund confirmation email to customer
  // TODO: Update inventory (return items to stock)
  
  // Example:
  // await updateOrderStatus(charge.id, 'refunded');
  // await sendRefundConfirmation(refundDetails);
}

/**
 * Handle payment cancellation
 * - Log for analytics
 */
async function handlePaymentCanceled(paymentIntent) {
  console.log('🚫 Payment canceled:', paymentIntent.id);
  console.log('   Customer:', paymentIntent.metadata?.customer_email || 'N/A');

  // TODO: Log to analytics
  // TODO: Trigger abandoned cart recovery
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Format currency for logging
 */
function formatCurrency(amountInCents, currency) {
  const amount = amountInCents / 100;
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

// ...existing code...
