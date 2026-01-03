/**
 * CHECKOUT.JS - Electric Ink IE
 * Stripe Payment Integration
 * Handles checkout form validation and payment processing
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const STRIPE_PUBLISHABLE_KEY = 'pk_test_51SlF0iALQaxEXnEz9kXoD66kw8pbOPffk7TSKmQ1ejhBryHpANG3s5dyLC5jI5nT3atIKZZYKXTA1zKIxG9OIgbq008BlzJwex';
  const PAYMENT_INTENT_URL = '/.netlify/functions/create-payment-intent';
  
  // ============================================
  // STATE
  // ============================================
  
  let stripe = null;
  let cardElement = null;
  let cart = [];
  let totals = {
    subtotal: 0,
    shipping: 0,
    total: 0
  };

  // ============================================
  // DOM ELEMENTS
  // ============================================
  
  const elements = {
    form: document.getElementById('checkoutForm'),
    cardElement: document.getElementById('card-element'),
    cardErrors: document.getElementById('card-errors'),
    submitBtn: document.getElementById('submitBtn'),
    buttonText: document.getElementById('button-text'),
    spinner: document.getElementById('spinner'),
    summaryItems: document.getElementById('summaryItems'),
    summarySubtotal: document.getElementById('summarySubtotal'),
    summaryShipping: document.getElementById('summaryShipping'),
    summaryTotal: document.getElementById('summaryTotal')
  };

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function init() {
    // Check if Stripe.js loaded
    if (typeof Stripe === 'undefined') {
      console.error('Stripe.js failed to load');
      showError('Payment system unavailable. Please refresh the page.');
      return;
    }

    // Initialize Stripe
    try {
      stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    } catch (error) {
      console.error('Stripe initialization error:', error);
      showError('Payment system error. Please try again later.');
      return;
    }

    // Load cart
    loadCart();
    
    // Check if cart has items
    if (cart.length === 0) {
      window.location.href = '/cart.html';
      return;
    }

    // Calculate totals
    calculateTotals();
    
    // Render order summary
    renderOrderSummary();
    
    // Initialize Stripe Elements
    initializeStripeElements();
    
    // Setup form handler
    setupFormHandler();
  }

  // ============================================
  // CART MANAGEMENT
  // ============================================
  
  function loadCart() {
    try {
      const cartData = localStorage.getItem('electricink_cart');
      cart = cartData ? JSON.parse(cartData) : [];
    } catch (error) {
      console.error('Error loading cart:', error);
      cart = [];
    }
  }

  function calculateTotals() {
    // Calculate subtotal
    totals.subtotal = cart.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // Calculate shipping (FREE above €120, else €8.50)
    totals.shipping = totals.subtotal >= 120 ? 0 : 8.50;

    // Calculate total
    totals.total = totals.subtotal + totals.shipping;
  }

  // ============================================
  // ORDER SUMMARY
  // ============================================
  
  function renderOrderSummary() {
    // Render items
    if (elements.summaryItems) {
      elements.summaryItems.innerHTML = cart.map(item => `
        <div class="summary-item">
          <div class="summary-item-image">
            <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}">
          </div>
          <div class="summary-item-info">
            <div class="summary-item-name">${item.name}</div>
            ${item.variant ? `<div class="summary-item-variant">${item.variant}</div>` : ''}
            <div class="summary-item-qty">Qty: ${item.quantity}</div>
          </div>
          <div class="summary-item-price">€${(item.price * item.quantity).toFixed(2)}</div>
        </div>
      `).join('');
    }

    // Update totals
    if (elements.summarySubtotal) {
      elements.summarySubtotal.textContent = `€${totals.subtotal.toFixed(2)}`;
    }
    
    if (elements.summaryShipping) {
      elements.summaryShipping.textContent = totals.shipping === 0 
        ? 'FREE' 
        : `€${totals.shipping.toFixed(2)}`;
    }
    
    if (elements.summaryTotal) {
      elements.summaryTotal.textContent = `€${totals.total.toFixed(2)}`;
    }
  }

  // ============================================
  // STRIPE ELEMENTS
  // ============================================
  
  function initializeStripeElements() {
    // Create Stripe Elements instance
    const stripeElements = stripe.elements();

    // Custom styling for card element
    const style = {
      base: {
        color: '#000',
        fontFamily: '"Montserrat", sans-serif',
        fontSmoothing: 'antialiased',
        fontSize: '15px',
        '::placeholder': {
          color: '#999'
        }
      },
      invalid: {
        color: '#FF4444',
        iconColor: '#FF4444'
      }
    };

    // Create card element
    cardElement = stripeElements.create('card', { style });

    // Mount card element
    if (elements.cardElement) {
      cardElement.mount(elements.cardElement);
    }

    // Handle real-time validation errors
    cardElement.on('change', function(event) {
      if (event.error) {
        showCardError(event.error.message);
      } else {
        showCardError('');
      }
    });
  }

  // ============================================
  // FORM HANDLING
  // ============================================
  
  function setupFormHandler() {
    if (!elements.form) return;

    elements.form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      // Validate form
      if (!validateForm()) {
        return;
      }

      // Disable submit button
      setLoading(true);

      try {
        // Create payment intent
        const clientSecret = await createPaymentIntent();

        if (!clientSecret) {
          throw new Error('Failed to create payment intent');
        }

        // Confirm payment with Stripe
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${elements.form.firstName.value} ${elements.form.lastName.value}`,
              email: elements.form.email.value,
              phone: elements.form.phone.value,
              address: {
                line1: elements.form.address.value,
                line2: elements.form.address2.value || null,
                city: elements.form.city.value,
                postal_code: elements.form.postalCode.value,
                country: elements.form.country.value
              }
            }
          }
        });

        if (error) {
          // Payment failed
          console.error('Payment error:', error);
          showError(error.message);
          setLoading(false);
        } else if (paymentIntent.status === 'succeeded') {
          // Payment succeeded
          handlePaymentSuccess(paymentIntent);
        }

      } catch (error) {
        console.error('Checkout error:', error);
        showError('Payment processing failed. Please try again.');
        setLoading(false);
      }
    });
  }

  // ============================================
  // VALIDATION
  // ============================================
  
  function validateForm() {
    const form = elements.form;
    
    // Check if form is valid (HTML5 validation)
    if (!form.checkValidity()) {
      form.reportValidity();
      return false;
    }

    // Additional custom validation
    const email = form.email.value;
    if (!isValidEmail(email)) {
      showError('Please enter a valid email address');
      form.email.focus();
      return false;
    }

    return true;
  }

  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  // ============================================
  // PAYMENT PROCESSING
  // ============================================
  
  async function createPaymentIntent() {
    try {
      // Prepare order data
      const orderData = {
        amount: totals.total,
        currency: 'eur',
        metadata: {
          customer_email: elements.form.email.value,
          customer_name: `${elements.form.firstName.value} ${elements.form.lastName.value}`,
          items_count: cart.length,
          subtotal: totals.subtotal.toFixed(2),
          shipping: totals.shipping.toFixed(2)
        }
      };

      // Call Netlify function
      const response = await fetch(PAYMENT_INTENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.clientSecret) {
        throw new Error('Invalid response from payment server');
      }

      return data.clientSecret;

    } catch (error) {
      console.error('Payment intent creation error:', error);
      throw error;
    }
  }

  function handlePaymentSuccess(paymentIntent) {
    // Save order info to localStorage
    const orderInfo = {
      paymentIntentId: paymentIntent.id,
      amount: totals.total,
      currency: 'eur',
      email: elements.form.email.value,
      name: `${elements.form.firstName.value} ${elements.form.lastName.value}`,
      date: new Date().toISOString(),
      items: cart
    };

    try {
      localStorage.setItem('electricink_last_order', JSON.stringify(orderInfo));
    } catch (error) {
      console.error('Error saving order info:', error);
    }

    // Clear cart
    try {
      localStorage.removeItem('electricink_cart');
      if (window.cart && typeof window.cart.updateCartCount === 'function') {
        window.cart.updateCartCount();
      }
    } catch (error) {
      console.error('Error clearing cart:', error);
    }

    // Redirect to success page
    window.location.href = '/success.html';
  }

  // ============================================
  // UI HELPERS
  // ============================================
  
  function setLoading(isLoading) {
    if (!elements.submitBtn) return;

    elements.submitBtn.disabled = isLoading;

    if (elements.buttonText) {
      elements.buttonText.style.display = isLoading ? 'none' : 'inline';
    }

    if (elements.spinner) {
      elements.spinner.style.display = isLoading ? 'inline-block' : 'none';
    }
  }

  function showError(message) {
    // Show error in a simple alert
    // Could be enhanced with a custom modal or toast
    if (message) {
      alert(message);
    }
  }

  function showCardError(message) {
    if (!elements.cardErrors) return;
    elements.cardErrors.textContent = message;
  }

  // ============================================
  // START
  // ============================================
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
