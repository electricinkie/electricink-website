// ===================================
// Bestsellers Swiper Functionality
// ===================================

(function() {
  'use strict';

  const track = document.querySelector('.bestsellers-track');
  const dots = document.querySelectorAll('.bestsellers-dot');
  const cards = document.querySelectorAll('.bestseller-card');

  if (!track || !dots.length || !cards.length) return;

  // Intersection Observer for dots sync
  const observerOptions = {
    root: track,
    threshold: 0.6
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        const index = Array.from(cards).indexOf(entry.target);
        
        dots.forEach((dot, i) => {
          dot.classList.toggle('active', i === index);
        });
      }
    });
  }, observerOptions);

  cards.forEach(card => observer.observe(card));

  // Dots click handler
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      cards[index].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start'
      });
    });
  });

  // Prevent scroll conflict on wheel events
  track.addEventListener('wheel', (e) => {
    const isScrollable = track.scrollWidth > track.clientWidth;
    
    if (isScrollable) {
      const isAtStart = track.scrollLeft === 0;
      const isAtEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
      
      if ((isAtStart && e.deltaX < 0) || (isAtEnd && e.deltaX > 0)) {
        return;
      }
      
      e.stopPropagation();
    }
  }, { passive: true });

})();
