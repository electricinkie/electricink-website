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
    'power-supplies': {
      title: 'Power Supplies',
      description: 'Wireless supplies, batteries, chargers and complete kits',
      icon: '🔋'
    },
    'power supplies': {
      title: 'Power Supplies',
      description: 'Wireless supplies, batteries, chargers and complete kits',
      icon: '🔋'
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

  // DISPLAY category-level messages (from data/category-messages.json)
  async function renderCategoryMessage() {
    // Suppress category-level availability notices for cartridges
    if ((category || '').toString().toLowerCase() === 'cartridges') return;
    try {
      const res = await fetch('/data/category-messages.json');
      if (!res.ok) return;
      const msgs = await res.json();
      // Try multiple keys so messages match titles or short slugs (e.g. "Artistic Inks" vs "Inks" vs "inks")
      let entry = null;
      const candidates = [];
      candidates.push(currentCategory.title);
      candidates.push(category);
      if (category) candidates.push(category.replace(/-/g, ' '));
      // Common alternate for our inks naming
      if (currentCategory.title && currentCategory.title.includes('Artistic')) {
        candidates.push(currentCategory.title.replace(/^Artistic\s*/i, '')); // 'Inks'
      }
      candidates.push('Inks');

      for (const k of candidates) {
        if (!k) continue;
        if (msgs[k]) { entry = msgs[k]; break; }
      }

      if (!entry || !entry.availability_notice) return;
      const msg = entry.message;
      if (!msg || msg.display_position !== 'top') return;
      const header = document.querySelector('.category-header');
      if (!header) return;

      const notice = document.createElement('div');
      notice.className = 'category-notice';
      // Use message text directly (may contain an embedded WhatsApp link).
      notice.innerHTML = `
        <div class="notice-inner">
          <strong class="notice-title">${msg.title}</strong>
          <p class="notice-text">${msg.text}</p>
        </div>
      `;

      const productCountEl = document.getElementById('productCount');
      header.insertBefore(notice, productCountEl);
    } catch (err) {
      console.warn('Could not load category messages', err);
    }
  }

  renderCategoryMessage();

  // SHOW subcategory/type filters for cosmetics and cartridges
  if (category === 'cosmetics' || category === 'cartridges') {
    const filtersEl = document.getElementById('subcategoryFilters');
    filtersEl.style.display = 'flex';
    // mark filters container when rendering cartridges so CSS can target cartridge-only layout
    if (category === 'cartridges') {
      filtersEl.classList.add('cartridges-filters');
    } else {
      filtersEl.classList.remove('cartridges-filters');
    }

    // If cartridges, generate needle-type buttons (RL, RS, RMG, MG)
    if (category === 'cartridges') {
      // Layout: keep ALL PRODUCTS on its own centered row, types on a second centered row
      filtersEl.innerHTML = `
        <div class="filter-row filter-row-main">
          <button class="subcategory-btn active" data-subcategory="all">ALL PRODUCTS</button>
        </div>
        <div class="filter-row filter-row-types"></div>
      `;

      const types = ['RL', 'RS', 'RMG', 'MG'];
      const typesRow = filtersEl.querySelector('.filter-row-types');
      types.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'subcategory-btn';
        btn.dataset.subcategory = t;
        btn.textContent = t;
        typesRow.appendChild(btn);
      });
    }

    // Mark the active subcategory/type button if one was provided in the URL
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
    '/data/products-power-supplies.json',
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
        specs: data.specs || {},
        image,
        priceDisplay,
        // preserve inventory and stock metadata so availability logic can use it
        inventory: data.inventory || {},
        inStock: !!data.inStock,
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
    } else if (catLower === 'power-supplies' || catLower === 'power supplies') {
      // Power Supplies - match product.category 'Power Supplies'
      filteredProducts = productsArray.filter(p => {
        const c = (p.category || '').toLowerCase();
        return c === 'power supplies';
      });
    } else {
      filteredProducts = productsArray.filter(p => (p.category || '').toLowerCase() === catLower);
    }
  }

  console.log('Filtered products:', filteredProducts);

  // RENDER function
  // Determine whether a product should show the "Available to Order" badge
  function isAvailableToOrder(product) {
    if (!product) return false;
    const cat = (product.category || '').toString().toLowerCase();

    // 1) All machines are available to order
    if (cat.includes('machine') || cat.includes('tattoo')) return true;

    // 2) Accessories: most are available to order except specific exceptions
    if (cat === 'accessories' || cat === 'accessory') {
      const exceptions = ['tattoo-grips', 'silicone-ink-cups', 'wrap-grips', 'silicone ink cups'];
      const pid = (product.id || '').toString().toLowerCase();
      const pname = (product.name || '').toString().toLowerCase();
      // if product id or name matches an exception, consider it in stock (no badge)
      if (exceptions.some(e => pid.includes(e) || pname.includes(e))) return false;
      return true;
    }

    // 3) Inks: show badge for inks that are marked available_on_request or not inStock,
    //    except explicit in-stock colours Raven Black and Ghost White (ids/names match these)
    if (cat === 'inks' || cat === 'ink' || cat === 'artistic inks') {
      const inStockExceptions = ['raven-black', 'ghost-white', 'raven black', 'ghost white'];
      const pid = (product.id || '').toString().toLowerCase();
      const pname = (product.name || '').toString().toLowerCase();
      if (inStockExceptions.some(e => pid.includes(e) || pname.includes(e))) return false;

      const stockStatus = (product.inventory && product.inventory.stock_status) || '';
      if (stockStatus === 'available_on_request' || product.inStock === false) return true;
      return false;
    }

    return false;
  }

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

        // Product-level availability badge ("Available to Order") for inks/accessories
        if (isAvailableToOrder(product)) {
          const avail = document.createElement('span');
          avail.className = 'product-availability-badge';
          avail.textContent = 'Available to Order';
          info.appendChild(avail);
        }
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
  if (selectedSubcategory && selectedSubcategory !== 'all') {
    if (category === 'cosmetics') {
      initialRenderProducts = filteredProducts.filter(p => p.subcategory === selectedSubcategory);
    } else if (category === 'cartridges') {
      const sel = selectedSubcategory.toString();
      // use word-boundary regex to avoid matching 'MG' inside 'RMG'
      const needleRegex = new RegExp('\\b' + sel + '\\b', 'i');
      initialRenderProducts = filteredProducts.filter(p => {
        const pid = (p.id || '').toLowerCase();
        const needleType = (p.specs && p.specs.needleType || '').toString();
        return pid.startsWith(sel.toLowerCase()) || needleRegex.test(needleType);
      });
    }
  }
  renderProducts(initialRenderProducts);

  // SUBCATEGORY / TYPE FILTER LISTENERS (for cosmetics and cartridges)
  if (category === 'cosmetics' || category === 'cartridges') {
    const subcategoryButtons = document.querySelectorAll('.subcategory-btn');

    subcategoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        subcategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Get selected subcategory/type
        selectedSubcategory = btn.dataset.subcategory;

        // Filter and render
        let subFiltered;
        if (category === 'cosmetics') {
          subFiltered = selectedSubcategory === 'all'
            ? filteredProducts
            : filteredProducts.filter(p => p.subcategory === selectedSubcategory);
        } else if (category === 'cartridges') {
          const sel = selectedSubcategory.toString();
          const needleRegex = new RegExp('\\b' + sel + '\\b', 'i');
          subFiltered = selectedSubcategory === 'all'
            ? filteredProducts
            : filteredProducts.filter(p => {
                const pid = (p.id || '').toLowerCase();
                const needleType = (p.specs && p.specs.needleType || '').toString();
                return pid.startsWith(sel.toLowerCase()) || needleRegex.test(needleType);
              });
        }

        renderProducts(subFiltered);
      });
    });
  }

})();
