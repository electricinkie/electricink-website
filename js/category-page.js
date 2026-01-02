(async function() {
  'use strict';

  // GET category from URL
  const urlParams = new URLSearchParams(window.location.search);
  const category = urlParams.get('cat') || 'all';

  // CATEGORY INFO
  const categoryInfo = {
    'cosmetics': {
      title: 'Cosmetics',
      description: 'Professional aftercare and skin prep products',
      icon: '💧'
    },
    'cartridges': {
      title: 'Cartridges',
      description: 'Premium tattoo cartridges for all techniques',
      icon: '🔧'
    },
    'inks': {
      title: 'Inks',
      description: 'High-quality tattoo inks',
      icon: '🎨'
    },
    'accessories': {
      title: 'Accessories',
      description: 'Essential tattoo tools and accessories',
      icon: '🛠️'
    },
    'all': {
      title: 'All Products',
      description: 'Browse our complete range of professional supplies',
      icon: '🏪'
    }
  };

  const currentCategory = categoryInfo[category] || categoryInfo['all'];

  // UPDATE page info
  document.getElementById('page-title').textContent = currentCategory.title + ' - Electric Ink IE';
  document.getElementById('categoryTitle').textContent = currentCategory.title;
  document.getElementById('categoryDescription').textContent = currentCategory.description;
  document.getElementById('breadcrumb-category').textContent = currentCategory.title;

  // LOAD products
  let allProducts;
  try {
    const response = await fetch('/data/stripe-products.json');
    if (!response.ok) throw new Error('Failed to load products');
    allProducts = await response.json();
  } catch (error) {
    console.error('Error loading products:', error);
    document.querySelector('.loading').textContent = 'Error loading products. Please refresh.';
    return;
  }

  // FILTER products by category
  const productsArray = Object.entries(allProducts).map(([id, data]) => ({
    id,
    ...data
  }));

  const filteredProducts = category === 'all' 
    ? productsArray 
    : productsArray.filter(p => p.category === category);

  // UPDATE count
  document.getElementById('productCount').textContent = 
    `${filteredProducts.length} ${filteredProducts.length === 1 ? 'product' : 'products'}`;

  // RENDER products
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');

  if (filteredProducts.length === 0) {
    // No products found
    grid.style.display = 'none';
    emptyState.style.display = 'flex';
  } else {
    // Render products
    grid.innerHTML = ''; // Clear loading

    filteredProducts.forEach(product => {
      const card = document.createElement('a');
      card.href = `/products.html?id=${product.id}`;
      card.className = 'product-card';

      // Image
      const img = document.createElement('img');
      img.src = product.image || product.images?.[0] || '/images/placeholder.jpg';
      img.alt = product.name;
      img.loading = 'lazy';
      img.onerror = () => { img.src = '/images/placeholder.jpg'; };

      // Info
      const info = document.createElement('div');
      info.className = 'product-info';

      const name = document.createElement('h3');
      name.className = 'product-name';
      name.textContent = product.name;

      const categoryBadge = document.createElement('p');
      categoryBadge.className = 'product-category';
      categoryBadge.textContent = product.category?.toUpperCase() || 'PRODUCT';

      const price = document.createElement('div');
      price.className = 'product-price';
      
      if (product.variants && product.variants.length > 0) {
        // Has variants - show price range
        const prices = product.variants.map(v => v.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (minPrice === maxPrice) {
          price.textContent = `€${minPrice.toFixed(2)}`;
        } else {
          price.textContent = `€${minPrice.toFixed(2)} - €${maxPrice.toFixed(2)}`;
        }
      } else {
        // Simple product
        price.textContent = `€${product.price.toFixed(2)}`;
      }

      const viewBtn = document.createElement('div');
      viewBtn.className = 'product-view-btn';
      viewBtn.textContent = 'View Product →';

      // Assemble
      info.appendChild(categoryBadge);
      info.appendChild(name);
      info.appendChild(price);
      info.appendChild(viewBtn);

      card.appendChild(img);
      card.appendChild(info);

      grid.appendChild(card);
    });
  }

})();
