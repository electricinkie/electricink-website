(function(){
  'use strict';

  // Reveal pro-team cards with a subtle fade/translate when they enter the viewport.
  // Lightweight and progressively-enhanced: no heavy libs.

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.pro-team .pt-card').forEach(el => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -8% 0px'
  });

  document.querySelectorAll('.pro-team .pt-card').forEach(el => io.observe(el));
})();
