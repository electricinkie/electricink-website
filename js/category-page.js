(async function() {
  'use strict';

  // GET category from URL
  const urlParams = new URLSearchParams(window.location.search);
  const category = urlParams.get('cat') || 'all';
  // Support pre-selecting a subcategory via URL: ?subcategory=During%20Tattoo or ?sub=During%20Tattoo
  let selectedSubcategory = urlParams.get('subcategory') || urlParams.get('sub') || 'all'; // Track subcategory filter

  // CATEGORY INFO
  const categoryInfo = {
    'cosmetics': {
      title: 'Cosmetics',
      description: 'Professional aftercare and skin prep products',
      icon: '💧'
    },
    'cartridges': {
      title: 'Cartridges',
      description: 'Pro tattoo cartridges for all techniques',
      icon: '🔧'
    },
    'inks': {
      title: 'Artistic Inks',
      description: 'High-quality artistic inks',
      icon: '🎨'
    },
    'accessories': {
      title: 'Accessories',
      description: 'Essential tattoo tools and accessories',
      icon: '🛠️'
    },
    'tattoo machines': {
      title: 'Tattoo Machines',
      description: 'Professional tattoo machines, grips and full kits',
      icon: '🖋️'
    },
    'tattoo-machines': {
      title: 'Tattoo Machines',
      description: 'Professional tattoo machines, grips and full kits',
      icon: '🖋️'
    },
    'machines': {
      title: 'Tattoo Machines',
      description: 'Professional rotary machines and equipment',
      icon: '⚙️'
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

  // SHOW subcategory filters only for cosmetics
  if (category === 'cosmetics') {
    document.getElementById('subcategoryFilters').style.display = 'flex';
    // Mark the active subcategory button if one was provided in the URL
    const preButtons = document.querySelectorAll('.subcategory-btn');
    preButtons.forEach(b => {
      if (selectedSubcategory === 'all' && b.dataset.subcategory === 'all') {
        b.classList.add('active');
      } else if (b.dataset.subcategory === selectedSubcategory) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  // LOAD products from multiple JSON files (cosmetics + needles)
  let allProducts = {};
  const productFiles = [
    '/data/product-accessories.json',
    '/data/products-cosmetics.json',
    '/data/products-artistic-inks.json',
    '/data/products-needles-022.json',
    '/data/products-needles-025.json',
    '/data/products-needles-030.json',
    '/data/product-tattoo-machines.json'
  ];

  try {
    const responses = await Promise.all(productFiles.map(p => fetch(p).catch(e => ({ ok: false, error: e }))));
    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      const path = productFiles[i];
      if (!res || !res.ok) {
        console.warn('Could not load', path, res.error || 'Unknown error');
        continue;
      }
      const json = await res.json();
      Object.assign(allProducts, json);
    }
  } catch (error) {
    console.error('Error loading products:', error);
    document.querySelector('.loading').textContent = 'Error loading products. Please refresh.';
    return;
  }

  console.log('Loaded products:', allProducts);

  // CONVERT to array and NORMALIZE structure
  const productsArray = Object.entries(allProducts)
    .filter(([id]) => !id.startsWith('comment')) // Skip comment sections
    .map(([id, data]) => {
      // Extract values with fallbacks for both old and new structure
      const name = data.basic?.name || data.name || 'Unnamed Product';
      const productCategory = data.basic?.category || data.category || 'uncategorized';

      // Handle images - support both old (single image) and new (images object) structure
      let image;
      if (data.images?.cover) {
        image = data.images.cover;
      } else if (data.media?.main_image) {
        image = data.media.main_image;
      } else if (data.image) {
        image = data.image;
      } else if (data.media?.gallery?.[0]) {
        image = data.media.gallery[0];
      } else {
        // Attempt to construct a sensible cartridges image path for Needles products
        const dia = data.specs?.diameter || data.basic?.specs?.diameter;
        const config = (data.specs?.configuration || data.basic?.specs?.configuration || '').toString().padStart(2, '0');
        if (dia && config && (data.basic?.category || data.category || '').toLowerCase().includes('needle')) {
          // try common filename patterns used in /images/products/cartridges
          const cleanDia = dia.replace('.', ''); // e.g. 0.30 -> 030 or we'll keep dot for folder names
          const tryPaths = [];
          // pattern used in rl-0.30: 0.30-rl-03.webp
          tryPaths.push(`/images/products/cartridges/rl-${dia.replace('.', '-')}/0.${dia.split('.')[1]}-rl-${config}.webp`);
          tryPaths.push(`/images/products/cartridges/rl-${dia}/0.${dia.split('.')[1]}-rl-${config}.webp`);
          tryPaths.push(`/images/products/cartridges/rl-${dia.replace('.', '-')}/0.${dia.split('.')[1]}-rl${config}.webp`);
          tryPaths.push(`/images/products/cartridges/rl-${dia}/0.${dia.split('.')[1]}-rl${config}.webp`);
          tryPaths.push(`/images/products/cartridges/rl-${dia}/0.${dia.split('.')[1]}-rl-${config}.webp`);
          image = tryPaths[0];
        } else {
          image = '/images/placeholder.jpg';
        }
      }

      // Handle price (single price OR price range for variants)
      let priceDisplay;
      if (data.variants && data.variants.length > 0) {
        // Has variants - use price range
        priceDisplay = data.price_range?.display || `from €${data.variants[0].price.toFixed(2)}`;
      } else {
        // Single product - use basic price
        const price = data.basic?.price || data.price;
        priceDisplay = price ? `€${price.toFixed(2)}` : 'Price unavailable';
      }

      // Map 'Needles' category to 'Cartridges' and expose variant
      let variant = data.variant || null;
      let mappedCategory = productCategory;
      if ((productCategory || '').toString().toLowerCase() === 'needles') {
        variant = 'Needles';
        mappedCategory = 'Cartridges';
      }

      return {
        id,
        name,
        category: mappedCategory,
        variant,
        subcategory: data.subcategory,
        image,
        priceDisplay,
        hasVariants: !!(data.variants && data.variants.length > 0)
      };
    });

  console.log('Normalized products array:', productsArray);

  // FILTER products by category (case-insensitive)
  let filteredProducts;
  if (category === 'all') {
    filteredProducts = productsArray;
  } else {
    const catLower = category.toLowerCase();
    if (catLower === 'cartridges') {
      // Treat 'cartridges' category as including 'Needles' products
      filteredProducts = productsArray.filter(p => {
        const c = (p.category || '').toLowerCase();
        return c === 'cartridges' || c === 'needles';
      });
    } else if (catLower === 'tattoo-machines' || catLower === 'tattoo machines' || catLower === 'tattoo' || catLower === 'machines') {
      // Tattoo Machines category - include any product whose category mentions 'tattoo'
      filteredProducts = productsArray.filter(p => {
        const c = (p.category || '').toLowerCase();
        return c.includes('tattoo');
      });
    } else {
      filteredProducts = productsArray.filter(p => (p.category || '').toLowerCase() === catLower);
    }
  }

  console.log('Filtered products:', filteredProducts);

  // RENDER function
  function renderProducts(products) {
    const grid = document.getElementById('productsGrid');
    const emptyState = document.getElementById('emptyState');

    // UPDATE count
    document.getElementById('productCount').textContent = 
      `${products.length} ${products.length === 1 ? 'product' : 'products'}`;

    if (products.length === 0) {
      // No products found
      grid.style.display = 'none';
      emptyState.style.display = 'flex';
    } else {
      // Render products
      grid.style.display = 'grid';
      emptyState.style.display = 'none';
      grid.innerHTML = ''; // Clear loading

      products.forEach(product => {
        const card = document.createElement('a');
        card.href = `/products.html?id=${product.id}`;
        card.className = 'product-card';

        // Image
        const img = document.createElement('img');
        img.src = product.image;
        img.alt = product.name;
        img.loading = 'lazy';
        img.onerror = () => { img.src = '/images/placeholder.jpg'; };

        // Info container
        const info = document.createElement('div');
        info.className = 'product-info';

        // Category badge
        const categoryBadge = document.createElement('p');
        categoryBadge.className = 'product-category';
        categoryBadge.textContent = product.category.toUpperCase();

        // Product name
        const name = document.createElement('h3');
        name.className = 'product-name';
        name.textContent = product.name;

        // Price
        const price = document.createElement('div');
        price.className = 'product-price';
        price.textContent = product.priceDisplay;

        // View button
        const viewBtn = document.createElement('div');
        viewBtn.className = 'product-view-btn';
        viewBtn.textContent = 'View Product →';

        // Assemble card
        info.appendChild(categoryBadge);
        info.appendChild(name);
        info.appendChild(price);
        info.appendChild(viewBtn);

        card.appendChild(img);
        card.appendChild(info);

        grid.appendChild(card);
      });
    }
  }

  // INITIAL render (respect optional selectedSubcategory)
  let initialRenderProducts = filteredProducts;
  if (category === 'cosmetics' && selectedSubcategory && selectedSubcategory !== 'all') {
    initialRenderProducts = filteredProducts.filter(p => p.subcategory === selectedSubcategory);
  }
  renderProducts(initialRenderProducts);

  // SUBCATEGORY FILTER LISTENERS (only for cosmetics)
  if (category === 'cosmetics') {
    const subcategoryButtons = document.querySelectorAll('.subcategory-btn');
    
    subcategoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        subcategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Get selected subcategory
        selectedSubcategory = btn.dataset.subcategory;
        
        // Filter and render
        const subFiltered = selectedSubcategory === 'all'
          ? filteredProducts
          : filteredProducts.filter(p => p.subcategory === selectedSubcategory);
        
        renderProducts(subFiltered);
      });
    });
  }

})();
