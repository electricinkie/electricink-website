/**
 * New Arrivals Swiper
 * Navigation arrows + dots with scroll protection
 */

(function() {
  'use strict';

  const track = document.querySelector('.new-arrivals-track');
  const dots = document.querySelectorAll('.new-dot');
  const products = document.querySelectorAll('.new-product');
  const prevBtn = document.querySelector('.new-nav-prev');
  const nextBtn = document.querySelector('.new-nav-next');

  if (!track || !dots.length || !products.length) return;

  /**
   * Prevent scroll propagation to page
   */
  track.addEventListener('wheel', (e) => {
    const atStart = track.scrollLeft === 0;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    
    // Only prevent if scrolling within bounds
    if ((e.deltaX > 0 && !atEnd) || (e.deltaX < 0 && !atStart)) {
      e.stopPropagation();
    }
  }, { passive: false });

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
   * Update arrow states
   */
  function updateArrows() {
    if (!prevBtn || !nextBtn) return;

    const atStart = track.scrollLeft <= 1;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;

    prevBtn.classList.toggle('disabled', atStart);
    nextBtn.classList.toggle('disabled', atEnd);
  }

  /**
   * Scroll to specific product
   */
  function scrollToProduct(index) {
    const product = products[index];
    if (!product) return;

    product.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start'
    });
  }

  /**
   * Scroll by one product width
   */
  function scrollByProduct(direction) {
    const productWidth = products[0].offsetWidth + 20; // Including gap
    const scrollAmount = direction === 'next' ? productWidth : -productWidth;
    
    track.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
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
   * Handle arrow clicks
   */
  if (prevBtn) {
    prevBtn.addEventListener('click', () => scrollByProduct('prev'));
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => scrollByProduct('next'));
  }

  /**
   * Update arrows on scroll
   */
  track.addEventListener('scroll', () => {
    updateArrows();
  });

  /**
   * Intersection Observer - tracks visible product
   */
  const observerOptions = {
    root: track,
    threshold: 0.6,
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

  products.forEach(product => {
    observer.observe(product);
  });

  // Initial state
  updateArrows();

})();