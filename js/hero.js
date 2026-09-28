window.addEventListener('DOMContentLoaded', function() {
  const heroSection = document.querySelector('[data-hx]');
  if (!heroSection) {
    return;
  }

  const slides = Array.from(heroSection.querySelectorAll('.hx-slide'));
  const tabsContainer = heroSection.querySelector('[data-hx-tabs]');
  const currentLabel = heroSection.querySelector('[data-hx-current]');
  if (!slides.length || !tabsContainer) {
    return;
  }

  const defaultDuration = 7000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currentIndex = 0;
  let timer = null;
  let startedAt = 0;
  let remaining = 0;
  let pointerInside = false;
  let visible = true;

  const tabs = slides.map((slide, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'hx-tab';
    tab.innerHTML = '<i></i>';
    tab.setAttribute('aria-label', `Show slide ${index + 1}: ${slide.dataset.label || ''}`);
    tab.style.setProperty('--dur', `${slideDuration(slide)}ms`);
    tab.addEventListener('click', () => goTo(index));
    tabsContainer.appendChild(tab);
    return tab;
  });

  function slideDuration(slide) {
    return Number(slide.dataset.duration) || defaultDuration;
  }

  function isRunning() {
    return !reducedMotion && !pointerInside && visible;
  }

  function schedule(ms) {
    window.clearTimeout(timer);
    remaining = ms;
    startedAt = performance.now();
    if (isRunning()) {
      timer = window.setTimeout(() => goTo(currentIndex + 1), ms);
    }
  }

  function syncPaused() {
    heroSection.classList.toggle('is-paused', !isRunning());
    if (isRunning()) {
      schedule(remaining);
    } else {
      window.clearTimeout(timer);
      remaining -= performance.now() - startedAt;
      startedAt = performance.now();
    }
  }

  function goTo(index) {
    currentIndex = (index + slides.length) % slides.length;
    const activeSlide = slides[currentIndex];

    slides.forEach((slide, i) => {
      const isActive = i === currentIndex;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      slide.inert = !isActive;
    });

    tabs.forEach((tab, i) => {
      tab.classList.remove('is-active');
      tab.removeAttribute('aria-current');
      if (i === currentIndex) {
        void tab.offsetWidth; // restart the progress animation
        tab.classList.add('is-active');
        tab.setAttribute('aria-current', 'true');
      }
    });

    if (currentLabel) {
      currentLabel.textContent = activeSlide.dataset.label || '';
      currentLabel.classList.remove('is-swapping');
      void currentLabel.offsetWidth;
      currentLabel.classList.add('is-swapping');
    }

    schedule(slideDuration(activeSlide));
  }

  // Split slides: hovering one product focuses its side
  slides.filter((slide) => slide.dataset.layout === 'split').forEach((slide) => {
    slide.addEventListener('mousemove', (event) => {
      slide.dataset.focusSide = event.clientX < window.innerWidth / 2 ? 'left' : 'right';
    });
    slide.addEventListener('mouseleave', () => {
      delete slide.dataset.focusSide;
    });
  });

  // Pause while the pointer or keyboard focus is inside the hero
  heroSection.addEventListener('mouseenter', () => {
    pointerInside = true;
    syncPaused();
  });
  heroSection.addEventListener('mouseleave', () => {
    pointerInside = false;
    syncPaused();
  });
  heroSection.addEventListener('focusin', () => {
    pointerInside = true;
    syncPaused();
  });
  heroSection.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!heroSection.contains(document.activeElement) && !heroSection.matches(':hover')) {
        pointerInside = false;
        syncPaused();
      }
    }, 0);
  });

  heroSection.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(currentIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(currentIndex - 1);
    }
  });

  // Swipe on touch
  let touchStartX = null;
  heroSection.addEventListener('touchstart', (event) => {
    touchStartX = event.touches[0].clientX;
  }, { passive: true });
  heroSection.addEventListener('touchend', (event) => {
    if (touchStartX === null) {
      return;
    }
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(deltaX) > 50) {
      goTo(currentIndex + (deltaX < 0 ? 1 : -1));
    }
  });

  // Stop when scrolled out of view or the tab is hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      syncPaused();
    }, { threshold: 0.4 }).observe(heroSection);
  }
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    syncPaused();
  });

  goTo(0);
});
