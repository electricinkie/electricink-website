// ========================================
// DROGHEDA PHOTOS - auto fan cycle (mobile)
// Electric Ink IE
// ========================================

// Touch devices have no hover, so the fan brings each photo forward
// on its own. Pointer devices keep the real :hover and are left alone.

'use strict';

const STEP_MS = 1800;

function initFanCycle() {
  const wall = document.querySelector('.dg-wall');
  if (!wall) return;

  const shots = Array.from(wall.querySelectorAll('.dg-shot'));
  if (shots.length < 2) return;

  const noHover = window.matchMedia('(hover: none)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let timer = null;
  let index = 0;

  function clear() {
    shots.forEach((shot) => shot.classList.remove('is-front'));
  }

  function tick() {
    clear();
    shots[index].classList.add('is-front');
    index = (index + 1) % shots.length;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    clear();
  }

  function start() {
    if (timer || !noHover.matches || reducedMotion.matches) return;
    index = 0;
    tick();
    timer = setInterval(tick, STEP_MS);
  }

  // Only run while the fan is actually on screen
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) start();
      else stop();
    });
  }, { threshold: 0.4 });

  observer.observe(wall);

  // A tap takes over from the loop, then the loop resumes
  wall.addEventListener('touchstart', () => {
    stop();
    setTimeout(start, STEP_MS * 2);
  }, { passive: true });

  // Rotating to a desktop-sized window, or turning on reduced motion,
  // should hand control back to :hover
  const onPreferenceChange = () => {
    stop();
    start();
  };

  noHover.addEventListener('change', onPreferenceChange);
  reducedMotion.addEventListener('change', onPreferenceChange);

  // Pause when the tab is hidden so it is not animating in the background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFanCycle);
} else {
  initFanCycle();
}
