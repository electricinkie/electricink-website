/**
 * Ultra Pen Gallery
 * Thumbnail click to change main image
 */

(function() {
  'use strict';

  const mainImage = document.getElementById('mainImage');
  const thumbnails = document.querySelectorAll('.thumbnail');

  if (!mainImage || !thumbnails.length) return;

  /**
   * Change main image and update active thumbnail
   */
  function changeImage(imageSrc, clickedThumbnail) {
    // Update main image
    mainImage.src = imageSrc;

    // Update active state
    thumbnails.forEach(thumb => {
      thumb.classList.remove('active');
    });
    
    clickedThumbnail.classList.add('active');
  }

  /**
   * Handle thumbnail clicks
   */
  thumbnails.forEach(thumbnail => {
    thumbnail.addEventListener('click', (e) => {
      e.preventDefault();
      const imageSrc = thumbnail.getAttribute('data-image');
      if (imageSrc) {
        changeImage(imageSrc, thumbnail);
      }
    });
  });

})();

// Accordion functionality for mobile features
(function() {
  'use strict';
  
  const accordionHeader = document.querySelector('.features-accordion-header');
  const accordionContent = document.querySelector('.features-accordion-content');
  const accordionIcon = document.querySelector('.features-accordion-icon');
  
  if (!accordionHeader || !accordionContent || !accordionIcon) return;
  
  // Only activate on mobile
  if (window.innerWidth <= 768) {
    accordionContent.classList.add('open');
    accordionIcon.classList.add('open');
  }
  
  accordionHeader.addEventListener('click', () => {
    accordionContent.classList.toggle('open');
    accordionIcon.classList.toggle('open');
  });
  
})();

// Add to Cart handler for Ultra Pen 2 on index page
(function() {
  'use strict';

  const btn = document.getElementById('ultraPenAddToCart');
  if (!btn) return;

  btn.addEventListener('click', async function() {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      const res = await fetch('/data/product-tattoo-machines.json');
      if (!res.ok) throw new Error('Failed to load product data');
      const data = await res.json();
      const product = data['ultra-pen-2-combo'];
      if (!product) throw new Error('Product not found in data');

      const item = {
        id: product.id || 'ultra-pen-2-combo',
        name: product.name || product.basic?.name || 'Ultra Pen 2',
        price: product.price || product.pricing?.price || product.basic?.price || 0,
        stripe_price_id: product.pricing?.stripe_price_id || product.stripe_price_id || (product.stripe && (product.stripe.price_id || product.stripe.priceId)) || null,
        image: product.image || (product.images && product.images[0]) || '/images/placeholder.jpg'
      };

      if (!item.stripe_price_id) {
        console.error('Missing stripe_price_id for Ultra Pen 2');
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Product not configured for online purchase. Please order via WhatsApp.');
        return;
      }

      if (window.cart && window.cart.addItem) {
        const ok = window.cart.addItem(item);
        if (ok) {
          btn.textContent = '✓ Added!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 1800);
        } else {
          alert('Failed to add to cart. Please try again.');
          btn.textContent = originalText;
        }
      } else {
        alert('Cart system not available. Please refresh the page.');
        btn.textContent = originalText;
      }
    } catch (err) {
      console.error('Add to cart failed:', err);
      alert('Could not add product to cart. Please try again later.');
      btn.textContent = originalText;
    } finally {
      btn.disabled = false;
    }
  });

})();