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