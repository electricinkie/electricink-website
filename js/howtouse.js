// ========================================
// HOW TO USE - ACCORDION MOBILE
// ========================================

(function() {
  'use strict';

  // Seleciona todos os produtos
  const products = document.querySelectorAll('.howtouse-product');

  // Função para toggle accordion
  function toggleProduct(product) {
    const header = product.querySelector('.howtouse-product-header');
    const content = product.querySelector('.howtouse-product-content');
    
    // Toggle classes
    header.classList.toggle('active');
    content.classList.toggle('active');
  }

  // Função para setup accordion
  function setupAccordion() {
    const isMobile = window.innerWidth <= 968;
    
    products.forEach(product => {
      const header = product.querySelector('.howtouse-product-header');
      const content = product.querySelector('.howtouse-product-content');
      
      if (isMobile) {
        // Mobile: Remove event listeners antigos
        header.removeEventListener('click', header._clickHandler);
        
        // Cria novo handler
        header._clickHandler = () => toggleProduct(product);
        
        // Adiciona click listener
        header.addEventListener('click', header._clickHandler);
        
        // Fecha tudo por padrão
        header.classList.remove('active');
        content.classList.remove('active');
        
      } else {
        // Desktop: Remove event listeners
        header.removeEventListener('click', header._clickHandler);
        
        // Abre tudo
        header.classList.add('active');
        content.classList.add('active');
      }
    });
  }

  // Setup inicial
  setupAccordion();

  // Re-setup on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setupAccordion();
    }, 250);
  });

})();
