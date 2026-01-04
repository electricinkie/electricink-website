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
  const PAYMENT_INTENT_URL = '/api/create-payment-intent';
  
  // ============================================
  // STATE
  // ============================================
  
  let stripe = null;
  let cardElement = null;
  let cart = [];
  let totals = {
    subtotal: 0,
    shipping: 0,
    discount: 0,
    vat: 0,
    total: 0
  };
  
  let shippingMethod = 'standard'; // 'standard', 'sameday', 'pickup'
  const VAT_RATE = 0.23; // 23% VAT for Ireland
  const FREE_SHIPPING_THRESHOLD = 130; // Free shipping above €130
  const STANDARD_RATE = 11.50; // Standard shipping rate
  const SAMEDAY_RATE = 7.50; // Same-day Dublin rate
  const PICKUP_RATE = 0; // Store pickup is free
  const SAMEDAY_CUTOFF_HOUR = 14; // 2 PM cutoff for same-day
  
  // Dublin Central postcodes (D01-D08)
  const DUBLIN_CENTRAL_POSTCODES = ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08'];

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
    summaryVAT: document.getElementById('summaryVAT'),
    summaryTotal: document.getElementById('summaryTotal')
  };

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function init() {
    // Check if Stripe.js loaded
    if (typeof Stripe === 'undefined') {
      console.error('Stripe.js failed to load');
      if (window.toast) {
        window.toast.error('Payment system unavailable. Please refresh the page.');
      } else {
        showError('Payment system unavailable. Please refresh the page.');
      }
      return;
    }

    // Initialize Stripe
    try {
      stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    } catch (error) {
      console.error('Stripe initialization error:', error);
      if (window.toast) {
        window.toast.error('Payment system error. Please try again later.');
      } else {
        showError('Payment system error. Please try again later.');
      }
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
    
    // Initialize Express Checkout (Apple Pay / Google Pay)
    initExpressCheckout();
    
    // Setup shipping methods
    setupShippingMethods();
    
    // Setup discount code
    setupDiscountCode();
    
    // Setup discount toggle
    setupDiscountToggle();
    
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

    // Get current shipping method
    const selectedMethod = document.querySelector('input[name="shippingMethod"]:checked');
    if (selectedMethod) {
      shippingMethod = selectedMethod.value;
    }

    // Calculate shipping based on method and subtotal
    if (shippingMethod === 'pickup') {
      totals.shipping = PICKUP_RATE;
    } else if (totals.subtotal >= FREE_SHIPPING_THRESHOLD) {
      // Free shipping above threshold (applies to all methods)
      totals.shipping = 0;
    } else {
      // Apply standard or same-day rate
      if (shippingMethod === 'sameday') {
        totals.shipping = SAMEDAY_RATE;
      } else {
        totals.shipping = STANDARD_RATE;
      }
    }

    // Calculate subtotal after discount
    const subtotalAfterDiscount = totals.subtotal - totals.discount;

    // Calculate VAT (23% on subtotal + shipping)
    totals.vat = (subtotalAfterDiscount + totals.shipping) * VAT_RATE;

    // Calculate total (subtotal - discount + shipping + VAT)
    totals.total = subtotalAfterDiscount + totals.shipping + totals.vat;
  }

  // ============================================
  // ORDER SUMMARY
  // ============================================
  
  function renderOrderSummary() {
    // Render items with images
    if (elements.summaryItems) {
      elements.summaryItems.innerHTML = cart.map(item => `
        <div class="summary-item">
          <div class="summary-item-image">
            <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}">
          </div>
          <div class="summary-item-details">
            <div class="summary-item-name">${item.name}</div>
            ${item.variant ? `<div class="summary-item-variant">${item.variant}</div>` : ''}
            <div class="summary-item-quantity">Qty: ${item.quantity}</div>
          </div>
          <div class="summary-item-price">€${(item.price * item.quantity).toFixed(2)}</div>
        </div>
      `).join('');
    }

    // Show/hide free shipping notice
    const freeShippingNotice = document.getElementById('freeShippingNotice');
    if (freeShippingNotice) {
      if (totals.subtotal >= FREE_SHIPPING_THRESHOLD) {
        freeShippingNotice.style.display = 'flex';
      } else {
        freeShippingNotice.style.display = 'none';
      }
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
    
    if (elements.summaryVAT) {
      elements.summaryVAT.textContent = `€${totals.vat.toFixed(2)}`;
    }
    
    if (elements.summaryTotal) {
      elements.summaryTotal.textContent = `€${totals.total.toFixed(2)}`;
    }
    
    // Update discount if element exists
    const discountElement = document.getElementById('summaryDiscount');
    const discountLine = document.getElementById('discountLine');
    if (discountElement && discountLine) {
      if (totals.discount > 0) {
        discountElement.textContent = `-€${totals.discount.toFixed(2)}`;
        discountLine.style.display = 'flex';
      } else {
        discountLine.style.display = 'none';
      }
    }
  }

  // ============================================
  // EXPRESS CHECKOUT (APPLE PAY / GOOGLE PAY)
  // ============================================
  
  async function initExpressCheckout() {
    try {
      console.log('🚀 Initializing Express Checkout...');
      console.log('   Cart total:', totals.total);
      console.log('   Cart subtotal:', totals.subtotal);
      
      // Determine initial shipping options (show all by default)
      const initialShippingOptions = [
        {
          id: 'standard',
          label: 'Standard Delivery (3-5 business days)',
          detail: 'Ireland-wide delivery',
          amount: 1150, // €11.50 in cents
        },
        {
          id: 'pickup',
          label: 'Store Pickup',
          detail: 'FREE - Collect from our Dublin location',
          amount: 0,
        },
      ];
      
      // Check if free shipping threshold met
      const freeShippingThreshold = 130;
      const qualifiesForFreeShipping = totals.subtotal >= freeShippingThreshold;
      
      // Calculate initial shipping (default to standard unless free shipping)
      let initialShipping = qualifiesForFreeShipping ? 0 : 1150;
      let initialTotal = Math.round((totals.subtotal + (initialShipping / 100)) * 100);
      
      console.log('   Free shipping?', qualifiesForFreeShipping);
      console.log('   Initial shipping:', initialShipping / 100);
      console.log('   Initial total:', initialTotal / 100);
      
      // Create Payment Request with shipping support
      const paymentRequest = stripe.paymentRequest({
        country: 'IE',
        currency: 'eur',
        total: {
          label: 'Electric Ink',
          amount: initialTotal,
        },
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: true,
        requestShipping: true, // ✅ REQUEST SHIPPING ADDRESS
        shippingOptions: initialShippingOptions,
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // EVENT: Shipping Address Change (detect Dublin for Same-Day)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      paymentRequest.on('shippingaddresschange', async (ev) => {
        console.log('📍 Shipping address changed:', ev.shippingAddress);
        
        const postalCode = ev.shippingAddress.postalCode;
        const isDublinCentral = postalCode && /^D0[1-8]/.test(postalCode.toUpperCase());
        
        console.log('   Postal code:', postalCode);
        console.log('   Dublin Central?', isDublinCentral);
        
        // Build shipping options based on address
        let shippingOptions = [
          {
            id: 'standard',
            label: 'Standard Delivery (3-5 business days)',
            detail: 'Ireland-wide delivery',
            amount: 1150,
          },
        ];
        
        // Add Same-Day if Dublin Central and before 2PM
        if (isDublinCentral) {
          const now = new Date();
          const cutoffTime = new Date();
          cutoffTime.setHours(14, 0, 0, 0); // 2PM
          
          if (now < cutoffTime) {
            shippingOptions.unshift({
              id: 'same-day',
              label: 'Same-Day Delivery (Order by 2PM)',
              detail: 'Dublin Central (D01-D08) - Today!',
              amount: 750, // €7.50
            });
          }
        }
        
        // Add Pickup option
        shippingOptions.push({
          id: 'pickup',
          label: 'Store Pickup',
          detail: 'FREE - Collect from our Dublin location',
          amount: 0,
        });
        
        // Calculate shipping amount (check free shipping threshold)
        let shippingAmount = shippingOptions[0].amount; // Default to first option
        if (qualifiesForFreeShipping) {
          shippingAmount = 0;
          // Update labels to show FREE
          shippingOptions = shippingOptions.map(opt => ({
            ...opt,
            amount: 0,
            detail: opt.id === 'pickup' ? opt.detail : 'FREE - Subtotal over €130',
          }));
        }
        
        const newTotal = Math.round((totals.subtotal + (shippingAmount / 100)) * 100);
        
        console.log('   Updated shipping options:', shippingOptions.length);
        console.log('   Shipping amount:', shippingAmount / 100);
        console.log('   New total:', newTotal / 100);
        
        ev.updateWith({
          status: 'success',
          shippingOptions: shippingOptions,
          total: {
            label: 'Electric Ink',
            amount: newTotal,
          },
        });
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // EVENT: Shipping Option Change (recalculate total)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      paymentRequest.on('shippingoptionchange', async (ev) => {
        console.log('🚚 Shipping option changed:', ev.shippingOption);
        
        const selectedOption = ev.shippingOption;
        let shippingAmount = selectedOption.amount;
        
        // Apply free shipping threshold
        if (qualifiesForFreeShipping) {
          shippingAmount = 0;
        }
        
        const newTotal = Math.round((totals.subtotal + (shippingAmount / 100)) * 100);
        
        console.log('   Selected option:', selectedOption.id);
        console.log('   Shipping amount:', shippingAmount / 100);
        console.log('   New total:', newTotal / 100);
        
        ev.updateWith({
          status: 'success',
          total: {
            label: 'Electric Ink',
            amount: newTotal,
          },
        });
      });

      // Create Payment Request Button Element
      const elements = stripe.elements();
      const prButton = elements.create('paymentRequestButton', {
        paymentRequest: paymentRequest,
        style: {
          paymentRequestButton: {
            type: 'default',
            theme: 'dark',
            height: '48px',
          },
        },
      });

      console.log('✅ Payment Request created, checking availability...');

      // Check if Payment Request is available (Apple Pay / Google Pay)
      const canMakePayment = await paymentRequest.canMakePayment();
      
      console.log('   Can make payment:', canMakePayment);
      
      if (canMakePayment) {
        console.log('✅ Express Checkout available! Showing buttons...');
        
        // Show Express Checkout container
        const container = document.getElementById('expressCheckoutContainer');
        if (container) {
          container.style.display = 'block';
          console.log('   Container displayed');
        }
        
        // Mount Payment Request Button
        prButton.mount('#payment-request-button');
        console.log('   Payment button mounted');
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // EVENT: Payment Method (complete payment)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        paymentRequest.on('paymentmethod', async (ev) => {
          console.log('💳 Express payment initiated...');
          console.log('   Payer:', ev.payerName, ev.payerEmail);
          console.log('   Shipping:', ev.shippingAddress);
          console.log('   Shipping option:', ev.shippingOption);
          
          try {
            // Create payment intent
            const clientSecret = await createPaymentIntent();
            
            // Confirm payment
            const {error: confirmError} = await stripe.confirmCardPayment(
              clientSecret,
              {payment_method: ev.paymentMethod.id},
              {handleActions: false}
            );

            if (confirmError) {
              // Report error
              console.error('❌ Express payment failed:', confirmError);
              ev.complete('fail');
              if (window.toast) {
                window.toast.error(confirmError.message);
              }
            } else {
              // Success
              console.log('✅ Express payment succeeded!');
              ev.complete('success');
              
              // Get payment intent ID from clientSecret
              const paymentIntentId = clientSecret.split('_secret')[0];
              
              // Format shipping address
              const shippingAddress = ev.shippingAddress;
              const fullAddress = [
                shippingAddress.addressLine[0],
                shippingAddress.addressLine[1],
                shippingAddress.city,
                shippingAddress.postalCode,
                shippingAddress.country
              ].filter(Boolean).join(', ');
              
              // Prepare order info
              const orderInfo = {
                paymentIntentId: paymentIntentId,
                amount: totals.total,
                currency: 'eur',
                email: ev.payerEmail,
                name: ev.payerName,
                phone: ev.payerPhone || 'N/A',
                date: new Date().toISOString(),
                items: cart,
                totals: {
                  subtotal: totals.subtotal,
                  shipping: ev.shippingOption.amount / 100,
                  shippingText: ev.shippingOption.label,
                  vat: totals.vat,
                  total: totals.total
                },
                shipping: {
                  firstName: ev.payerName.split(' ')[0] || '',
                  lastName: ev.payerName.split(' ').slice(1).join(' ') || '',
                  address: shippingAddress.addressLine[0] || '',
                  address2: shippingAddress.addressLine[1] || '',
                  city: shippingAddress.city || '',
                  postalCode: shippingAddress.postalCode || '',
                  country: shippingAddress.country || 'IE',
                  phone: ev.payerPhone || 'N/A',
                  method: ev.shippingOption.id,
                  fullAddress: fullAddress
                }
              };
              
              // Save to localStorage
              localStorage.setItem('electricink_last_order', JSON.stringify(orderInfo));
              
              // Clear cart
              localStorage.removeItem('electricink_cart');
              
              // Send emails (non-blocking)
              sendOrderEmails(orderInfo, paymentIntentId).catch(console.error);
              
              // Redirect to success
              window.location.href = `/success.html?payment_intent=${paymentIntentId}`;
            }
          } catch (error) {
            console.error('❌ Express checkout error:', error);
            ev.complete('fail');
            if (window.toast) {
              window.toast.error('Payment failed. Please try again.');
            }
          }
        });
      } else {
        console.log('⚠️ Express Checkout NOT available (no Apple/Google Pay on this device/browser)');
        // Express checkout not available, hide container
        const container = document.getElementById('expressCheckoutContainer');
        if (container) {
          container.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('❌ Express checkout initialization error:', error);
      // Silently fail - regular checkout still works
    }
  }

  // ============================================
  // SHIPPING METHODS & DUBLIN DETECTION
  // ============================================
  
  /**
   * Check if postal code is Dublin Central (D01-D08)
   */
  function isDublinCentral(postalCode) {
    if (!postalCode) return false;
    const normalizedPostal = postalCode.trim().toUpperCase().replace(/\s/g, '');
    return DUBLIN_CENTRAL_POSTCODES.some(code => normalizedPostal.startsWith(code));
  }
  
  /**
   * Check if current time is before 2 PM cutoff
   */
  function isBeforeCutoff() {
    const now = new Date();
    const currentHour = now.getHours();
    return currentHour < SAMEDAY_CUTOFF_HOUR;
  }
  
  /**
   * Update shipping options based on address
   */
  function updateShippingOptions() {
    const cityInput = document.getElementById('city');
    const postalInput = document.getElementById('postalCode');
    const sameDayOption = document.getElementById('sameDayOption');
    const sameDayRadio = document.getElementById('shipping-sameday');
    
    if (!sameDayOption || !sameDayRadio) return;
    
    const city = cityInput ? cityInput.value : '';
    const postal = postalInput ? postalInput.value : '';
    
    // Check if Dublin Central and before cutoff
    const isDublin = isDublinCentral(postal);
    const beforeCutoff = isBeforeCutoff();
    
    if (isDublin && beforeCutoff) {
      // Show and enable same-day option
      sameDayOption.style.display = 'block';
      sameDayRadio.disabled = false;
    } else {
      // Hide or disable same-day option
      sameDayOption.style.display = 'none';
      sameDayRadio.disabled = true;
      
      // If same-day was selected, switch to standard
      if (sameDayRadio.checked) {
        const standardRadio = document.getElementById('shipping-standard');
        if (standardRadio) {
          standardRadio.checked = true;
          shippingMethod = 'standard';
          calculateTotals();
          renderOrderSummary();
        }
      }
    }
  }
  
  /**
   * Setup shipping method listeners
   */
  function setupShippingMethods() {
    // Listen for shipping method changes
    const shippingRadios = document.querySelectorAll('input[name="shippingMethod"]');
    shippingRadios.forEach(radio => {
      radio.addEventListener('change', function() {
        shippingMethod = this.value;
        calculateTotals();
        renderOrderSummary();
      });
    });
    
    // Listen for address changes to check Dublin eligibility
    const cityInput = document.getElementById('city');
    const postalInput = document.getElementById('postalCode');
    
    if (cityInput) {
      cityInput.addEventListener('input', updateShippingOptions);
      cityInput.addEventListener('blur', updateShippingOptions);
    }
    
    if (postalInput) {
      postalInput.addEventListener('input', updateShippingOptions);
      postalInput.addEventListener('blur', updateShippingOptions);
    }
    
    // Initial check
    updateShippingOptions();
  }

  // ============================================
  // DISCOUNT CODE
  // ============================================
  
  // Valid discount codes (you can expand this)
  const DISCOUNT_CODES = {
    'FIRSTORDER': { type: 'fixed', value: 15, description: '€15 off' },
    'FREECAT': { type: 'shipping', value: 0, description: 'Free shipping' }
  };
  
  function setupDiscountCode() {
    const discountInput = document.getElementById('discountCode');
    const applyButton = document.getElementById('applyDiscountBtn');
    
    if (!discountInput || !applyButton) return;
    
    applyButton.addEventListener('click', function() {
      applyDiscountCode(discountInput.value.trim().toUpperCase());
    });
    
    // Also apply on Enter key
    discountInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyDiscountCode(discountInput.value.trim().toUpperCase());
      }
    });
  }
  
  /**
   * Setup discount toggle button
   */
  function setupDiscountToggle() {
    const discountToggle = document.getElementById('discountToggle');
    const discountInputWrapper = document.getElementById('discountInputWrapper');
    
    if (!discountToggle || !discountInputWrapper) return;
    
    discountToggle.addEventListener('click', function() {
      // Toggle visibility
      if (discountInputWrapper.style.display === 'none') {
        discountInputWrapper.style.display = 'flex';
        this.style.display = 'none'; // Hide toggle button
      }
    });
  }
  
  function applyDiscountCode(code) {
    const discountInput = document.getElementById('discountCode');
    const discountMessage = document.getElementById('discountMessage');
    
    if (!code) {
      showDiscountMessage('Please enter a discount code', 'error');
      return;
    }
    
    const discount = DISCOUNT_CODES[code];
    
    if (!discount) {
      showDiscountMessage('Invalid discount code', 'error');
      discountInput.value = '';
      return;
    }
    
    // Calculate discount amount
    if (discount.type === 'percentage') {
      totals.discount = totals.subtotal * (discount.value / 100);
    } else if (discount.type === 'fixed') {
      totals.discount = Math.min(discount.value, totals.subtotal);
    } else if (discount.type === 'shipping') {
      // For shipping discount, we'll make shipping free
      // This will be handled in calculateTotals
      totals.discount = 0;
      showDiscountMessage(`Discount applied: ${discount.description}`, 'success');
      calculateTotals();
      // Override shipping to 0
      totals.shipping = 0;
      renderOrderSummary();
      return;
    }
    
    // Recalculate totals
    calculateTotals();
    renderOrderSummary();
    
    // Show success message
    showDiscountMessage(`Discount applied: ${discount.description}`, 'success');
    
    // Disable input and button
    discountInput.disabled = true;
    const applyButton = document.getElementById('applyDiscountBtn');
    if (applyButton) {
      applyButton.disabled = true;
      applyButton.textContent = 'Applied';
    }
  }
  
  function showDiscountMessage(message, type) {
    const discountMessage = document.getElementById('discountMessage');
    if (!discountMessage) return;
    
    discountMessage.textContent = message;
    discountMessage.className = `discount-message ${type}`;
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
    cardElement = stripeElements.create('card', { 
      style,
      hidePostalCode: true // Usamos o postal code do formulário
    });

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

        // Confirm payment with Stripe (with 3D Secure / SCA support)
        const billingDetails = {
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
        };

        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: billingDetails
          }
        });

        if (error) {
          // Payment failed (card declined, network error, etc.)
          console.error('Payment error:', error);
          if (window.toast) {
            window.toast.error(error.message, 5000);
          }
          showError(error.message);
          setLoading(false);
          return;
        }

        // Handle payment intent status (including 3D Secure)
        await handlePaymentIntentStatus(paymentIntent, clientSecret, billingDetails);

      } catch (error) {
        console.error('Checkout error:', error);
        if (window.toast) {
          window.toast.error('Payment processing failed. Please try again.', 5000);
        }
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
      if (window.toast) {
        window.toast.error('Please enter a valid email address');
      }
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
  
  /**
   * Handle Payment Intent Status with 3D Secure / SCA Support
   * Following Stripe best practices for PSD2 compliance
   * @param {Object} paymentIntent - Stripe Payment Intent object
   * @param {String} clientSecret - Payment Intent client secret
   * @param {Object} billingDetails - Customer billing details
   */
  async function handlePaymentIntentStatus(paymentIntent, clientSecret, billingDetails) {
    try {
      switch (paymentIntent.status) {
        case 'succeeded':
          // Payment succeeded immediately (no 3DS required)
          console.log('Payment succeeded without additional authentication');
          handlePaymentSuccess(paymentIntent);
          break;

        case 'requires_action':
        case 'requires_source_action':
          // 3D Secure authentication required
          console.log('3D Secure authentication required');
          
          // Show user-friendly message
          if (window.toast) {
            window.toast.info('Please complete authentication with your bank', 3000);
          }
          
          // Stripe will automatically show 3DS modal
          const { error: actionError, paymentIntent: confirmedIntent } = await stripe.handleCardAction(clientSecret);
          
          if (actionError) {
            // 3DS authentication failed
            console.error('3D Secure authentication failed:', actionError);
            if (window.toast) {
              window.toast.error(actionError.message, 5000);
            }
            showError(actionError.message);
            setLoading(false);
            return;
          }
          
          // After 3DS, check final status
          if (confirmedIntent.status === 'succeeded') {
            console.log('Payment succeeded after 3D Secure authentication');
            handlePaymentSuccess(confirmedIntent);
          } else if (confirmedIntent.status === 'requires_payment_method') {
            // 3DS completed but payment still failed (card declined after auth)
            console.error('Payment failed after 3D Secure authentication');
            if (window.toast) {
              window.toast.error('Payment declined. Please try a different card.', 5000);
            }
            showError('Payment declined. Please try a different card.');
            setLoading(false);
          } else {
            // Unexpected status after 3DS
            console.error('Unexpected payment status after 3DS:', confirmedIntent.status);
            if (window.toast) {
              window.toast.error('Payment processing error. Please try again.', 5000);
            }
            showError('Payment processing error. Please try again.');
            setLoading(false);
          }
          break;

        case 'requires_payment_method':
          // Payment failed, customer needs to try different payment method
          console.error('Payment requires different payment method');
          if (window.toast) {
            window.toast.error('Payment declined. Please try a different card.', 5000);
          }
          showError('Payment declined. Please try a different card.');
          setLoading(false);
          break;

        case 'processing':
          // Payment is processing (async payment methods like SEPA, bank transfers)
          console.log('Payment is processing asynchronously');
          if (window.toast) {
            window.toast.info('Payment is processing. You will receive confirmation via email.', 5000);
          }
          // For async payments, still consider it success and redirect
          handlePaymentSuccess(paymentIntent);
          break;

        case 'canceled':
          // Payment was canceled
          console.error('Payment was canceled');
          if (window.toast) {
            window.toast.error('Payment was canceled. Please try again.', 5000);
          }
          showError('Payment was canceled. Please try again.');
          setLoading(false);
          break;

        default:
          // Unknown status
          console.error('Unknown payment intent status:', paymentIntent.status);
          if (window.toast) {
            window.toast.error('Payment status unclear. Please contact support.', 5000);
          }
          showError('Payment status unclear. Please contact support.');
          setLoading(false);
      }
    } catch (error) {
      console.error('Error handling payment intent status:', error);
      if (window.toast) {
        window.toast.error('Payment processing error. Please try again.', 5000);
      }
      showError('Payment processing error. Please try again.');
      setLoading(false);
    }
  }
  
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

  async function sendOrderEmails(orderInfo, paymentIntentId) {
    const orderNumber = paymentIntentId.substring(3, 15).toUpperCase();
    
    const emailData = {
      orderNumber: orderNumber,
      email: orderInfo.email,
      items: orderInfo.items,
      totals: orderInfo.totals,
      shipping: orderInfo.shipping
    };

    try {
      // Email 1: Customer confirmation
      await fetch('/api/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order-confirmation',
          data: emailData
        })
      });

      // Email 2: Admin notification
      await fetch('/api/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order-notification-admin',
          data: emailData
        })
      });
    } catch (error) {
      console.error('Email sending failed (non-blocking):', error);
      // Don't block checkout flow if emails fail
    }
  }

  function handlePaymentSuccess(paymentIntent) {
    // Save order info to localStorage (completo para success page)
    const orderInfo = {
      paymentIntentId: paymentIntent.id,
      amount: totals.total,
      currency: 'eur',
      email: elements.form.email.value,
      name: `${elements.form.firstName.value} ${elements.form.lastName.value}`,
      date: new Date().toISOString(),
      items: cart,
      totals: {
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        shippingText: totals.shipping === 0 ? 'FREE' : `€${totals.shipping.toFixed(2)}`,
        vat: totals.vat,
        total: totals.total
      },
      shipping: {
        firstName: elements.form.firstName.value,
        lastName: elements.form.lastName.value,
        address: elements.form.address.value,
        address2: elements.form.address2?.value || '',
        city: elements.form.city.value,
        postalCode: elements.form.postalCode.value,
        country: elements.form.country.value,
        phone: elements.form.phone.value
      }
    };

    try {
      localStorage.setItem('electricink_last_order', JSON.stringify(orderInfo));
    } catch (error) {
      console.error('Error saving order info:', error);
    }

    // Send confirmation emails
    sendOrderEmails(orderInfo, paymentIntent.id);

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
    window.location.href = `/success.html?payment_intent=${paymentIntent.id}`;
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
