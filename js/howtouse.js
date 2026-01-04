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
    const isCurrentlyOpen = header.classList.contains('active');
    
    // Fecha todos os outros produtos (accordion behavior)
    products.forEach(p => {
      const pHeader = p.querySelector('.howtouse-product-header');
      const pContent = p.querySelector('.howtouse-product-content');
      pHeader.classList.remove('active');
      pContent.classList.remove('active');
    });
    
    // Se não estava aberto, abre o clicado
    if (!isCurrentlyOpen) {
      header.classList.add('active');
      content.classList.add('active');
    }
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
