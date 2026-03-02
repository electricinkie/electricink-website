window.addEventListener('DOMContentLoaded', function() {
  const heroSection = document.querySelector('[data-hero-section]');
  const heroTrack = document.querySelector('[data-hero-track]');

  if (!heroSection || !heroTrack) {
    return;
  }

  const slides = Array.from(heroTrack.querySelectorAll('.hero-slide'));
  if (!slides.length) {
    return;
  }

  let currentIndex = 0;
  let autoplayTimer = null;
  const autoplayDelay = 6000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setSlideFocusable(slide, isActive) {
    const focusables = slide.querySelectorAll('a, button, input, select, textarea, [tabindex]');
    focusables.forEach((element) => {
      if (isActive) {
        if (element.hasAttribute('data-prev-tabindex')) {
          const previousValue = element.getAttribute('data-prev-tabindex');
          if (previousValue === '') {
            element.removeAttribute('tabindex');
          } else {
            element.setAttribute('tabindex', previousValue);
          }
          element.removeAttribute('data-prev-tabindex');
        }
      } else {
        if (!element.hasAttribute('data-prev-tabindex')) {
          element.setAttribute('data-prev-tabindex', element.getAttribute('tabindex') || '');
        }
        element.setAttribute('tabindex', '-1');
      }
    });
  }

  function syncUI() {
    const activeSlide = slides[currentIndex];
    heroTrack.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;
    heroSection.setAttribute('data-category', activeSlide.dataset.category || 'cosmetics');

    slides.forEach((slide, index) => {
      const isActive = index === currentIndex;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      if ('inert' in slide) {
        slide.inert = !isActive;
      }
      setSlideFocusable(slide, isActive);
    });
  }

  function goTo(index) {
    const normalized = (index + slides.length) % slides.length;
    currentIndex = normalized;
    syncUI();
  }

  function nextSlide() {
    goTo(currentIndex + 1);
  }

  function prevSlide() {
    goTo(currentIndex - 1);
  }

  function startAutoplay() {
    if (reducedMotion || autoplayTimer) {
      return;
    }
    autoplayTimer = window.setInterval(nextSlide, autoplayDelay);
  }

  function stopAutoplay() {
    if (!autoplayTimer) {
      return;
    }
    window.clearInterval(autoplayTimer);
    autoplayTimer = null;
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  heroSection.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      nextSlide();
      restartAutoplay();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prevSlide();
      restartAutoplay();
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
      restartAutoplay();
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(slides.length - 1);
      restartAutoplay();
    }
  });

  heroSection.addEventListener('mouseenter', stopAutoplay);
  heroSection.addEventListener('mouseleave', startAutoplay);

  heroSection.addEventListener('focusin', stopAutoplay);
  heroSection.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!heroSection.contains(document.activeElement)) {
        startAutoplay();
      }
    }, 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });

  syncUI();
  requestAnimationFrame(() => {
    heroSection.classList.add('hero-ready');
  });
  startAutoplay();
});
