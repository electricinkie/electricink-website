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