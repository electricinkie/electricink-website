/**
 * New Arrivals Swiper
 * Simple and precise dots navigation with Intersection Observer
 */

(function() {
  'use strict';

  const track = document.querySelector('.new-arrivals-track');
  const dots = document.querySelectorAll('.new-dot');
  const products = document.querySelectorAll('.new-product');

  if (!track || !dots.length || !products.length) return;

  /**
   * Update active dot
   */
  function setActiveDot(index) {
    dots.forEach((dot, i) => {
      if (i === index) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  /**
   * Scroll to specific product (smooth)
   */
  function scrollToProduct(index) {
    const product = products[index];
    if (!product) return;

    product.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }

  /**
   * Handle dot clicks
   */
  dots.forEach((dot, index) => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToProduct(index);
    });
  });

  /**
   * Intersection Observer - tracks which product is most visible
   */
  const observerOptions = {
    root: track,
    threshold: 0.6, // Product needs to be 60% visible to be active
    rootMargin: '0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        const index = Array.from(products).indexOf(entry.target);
        if (index !== -1) {
          setActiveDot(index);
        }
      }
    });
  }, observerOptions);

  // Observe all products
  products.forEach(product => {
    observer.observe(product);
  });

})();