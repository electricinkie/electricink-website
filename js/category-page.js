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
    // Do not show category-level messages on the All Products page
    if ((category || '').toString().toLowerCase() === 'all') return;
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
    // Fetch local product files
    const localFetches = productFiles.map(p => fetch(p).catch(e => ({ ok: false, error: e })));
    // Fetch internal catalog in parallel
    const apiFetch = fetch('/api/catalog?type=products').catch(e => ({ ok: false, _error: e }));

    const responses = await Promise.all(localFetches);
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

    // Try to merge pricing/stock from internal API
    let apiProducts = null;
    try {
      const apiRes = await apiFetch;
      if (apiRes && apiRes.ok) {
        const apiJson = await apiRes.json();
        if (Array.isArray(apiJson)) apiProducts = apiJson;
      } else if (apiRes && apiRes._error) {
        console.warn('Could not fetch internal catalog:', apiRes._error);
      } else if (apiRes && apiRes.ok === false) {
        console.warn('Internal catalog returned non-OK status');
      }
    } catch (e) {
      console.warn('Could not fetch internal catalog:', e);
    }

    if (apiProducts && Array.isArray(apiProducts)) {
      // Group api entries by product id
      const apiByProduct = apiProducts.reduce((acc, item) => {
        if (!item || !item.id) return acc;
        acc[item.id] = acc[item.id] || [];
        acc[item.id].push(item);
        return acc;
      }, {});

      // Merge into local allProducts
      Object.keys(allProducts).forEach(pid => {
        const local = allProducts[pid];
        const entries = apiByProduct[pid];
        if (!entries || entries.length === 0) return;

        // If product has variants, map per variant
        if (Array.isArray(local.variants) && local.variants.length > 0) {
          local.variants.forEach(variant => {
            if (!variant) return;
            // Try to find matching api entry by variant_id
            let found = entries.find(e => e.variant_id === variant.id);
            if (!found) {
              // try product-prefixed id
              found = entries.find(e => e.variant_id === `${pid}-${variant.id}`);
            }
            if (!found) {
              // try suffix match
              found = entries.find(e => variant.id && e.variant_id && e.variant_id.endsWith(variant.id));
            }
            if (found) {
              const parsedPrice = parseFloat(found.price_ex);
              if (!isNaN(parsedPrice)) variant.price = parseFloat((parsedPrice * 1.23).toFixed(2));
              const parsedStock = parseInt(found.stock, 10);
              if (!isNaN(parsedStock)) variant.quantity = parsedStock;
            }
          });

          // update product-level inventory.stock_status
            const totalStock = local.variants.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
            local.inventory = local.inventory || {};
            const originalStatus = local.inventory?.stock_status;
            const isOnRequest = local.orderOnRequest === true || originalStatus === 'available_on_request';
            local.inventory.stock_status = totalStock > 0 ? 'in_stock' : (isOnRequest ? 'available_on_request' : 'out_of_stock');
        } else {
          // Simple product - apply first entry price and stock summary
          const first = entries[0];
          if (first) {
            const parsedPrice = parseFloat(first.price_ex);
            if (!isNaN(parsedPrice)) {
              const priceWithVat = parseFloat((parsedPrice * 1.23).toFixed(2));
              if (local.basic) local.basic.price = priceWithVat; else local.price = priceWithVat;
            }
          }
          local.inventory = local.inventory || {};
          const originalStatus = local.inventory?.stock_status;
          const isOnRequest = local.orderOnRequest === true || originalStatus === 'available_on_request';
          const anyStock = entries.some(e => Number(e.stock) > 0);
          local.inventory.stock_status = anyStock ? 'in_stock' : (isOnRequest ? 'available_on_request' : 'out_of_stock');
        }
      });
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
        // Has variants - prefer explicit price_range.display, otherwise try variant.price or product price
        const priceRangeDisplay = data.price_range && data.price_range.display;
        const firstPrice = (data.variants[0] && typeof data.variants[0].price === 'number')
          ? data.variants[0].price
          : (typeof data.price === 'number' ? data.price : (typeof data.basic?.price === 'number' ? data.basic.price : NaN));

        if (priceRangeDisplay) {
          priceDisplay = priceRangeDisplay;
        } else if (!isNaN(firstPrice)) {
          priceDisplay = `from €${firstPrice.toFixed(2)}`;
        } else {
          priceDisplay = 'Price unavailable';
        }
      } else {
        // Single product - use basic price or product-level price
        const price = typeof data.basic?.price === 'number' ? data.basic.price : data.price;
        priceDisplay = (typeof price === 'number' && !isNaN(price)) ? `€${price.toFixed(2)}` : 'Price unavailable';
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
        orderOnRequest: !!data.orderOnRequest,
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

  

/**
 * Get availability badge info for a product
 * Returns badge configuration or null for in-stock products
 */
function getAvailabilityBadgeInfo(product) {
  const stockStatus = product.inventory?.stock_status;
  const stockQuantity = product.inventory?.stock_quantity || 0;
  
  // COMING SOON - Cannot purchase (not launched yet)
  if (stockStatus === 'available_soon') {
    const availableDate = product.availableDate || product.inventory?.availableDate;
    let dateText = '';
    if (availableDate) {
      try {
        const date = new Date(availableDate);
        dateText = ' - ' + date.toLocaleDateString('en-IE', { month: 'short', day: 'numeric' });
      } catch (e) {
        console.warn('Invalid availableDate:', availableDate);
      }
    }
    return {
      text: `Coming Soon${dateText}`,
      class: 'badge-coming-soon',
      canPurchase: false
    };
  }
  
  // OUT OF STOCK - Cannot purchase
  // OUT OF STOCK - No badge in category, user discovers on product page
  if (stockStatus === 'out_of_stock') {
    return null;
  }
  
  // ORDER ON REQUEST - Specific categories and products
  // Prefer explicit flag on product to indicate "Order on Request"
  if (product.orderOnRequest === true) {
    return {
      text: 'Order on Request',
      class: 'badge-order-request',
      canPurchase: true
    };
  }

    if (stockStatus === 'available_on_request') {
      const category = (product.category || '').toString().toLowerCase();
    const productId = (product.id || '').toString().toLowerCase();
    const productName = (product.name || '').toString().toLowerCase();
    
    // TEMPORARY DEBUG - removed
    
    // 1) MACHINES - category is exactly "machines"
    const isMachine = category === 'machines' || 
                      category === 'machine' ||
                      category.includes('tattoo machine');
    
    // 2) POWER SUPPLIES
    const isPowerSupply = category === 'power supplies' ||
                          category === 'power supply' ||
                          category === 'power' ||
                          category.includes('power');
    
    // 3) ACCESSORIES - except specific products with stock
    const isAccessory = category === 'accessories' || 
                        category === 'accessory';
    
    const excludedAccessories = [
      'tattoo-grips', 'tattoo-grip', 'grip',
      'silicone-ink-cups', 'silicone-ink-cup', 'ink-cups', 'ink-cup',
      'silicone ink cups', 'silicone ink cup', 'wrap-grips', 'wrap grips'
    ];
    
    const isExcludedAccessory = excludedAccessories.some(excluded => 
      productId.includes(excluded) || productName.includes(excluded)
    );
    
    // 4) INKS - all colors except Raven Black and Ghost White
    const isInk = category === 'inks' || 
                  category === 'ink' || 
                  category === 'artistic inks' ||
                  category.includes('inks');
    
    const inStockInks = [
      'raven-black', 'ravenblack', 'raven black',
      'ghost-white', 'ghostwhite', 'ghost white'
    ];
    
    const isInStockInk = inStockInks.some(stockInk => 
      productId.includes(stockInk) || productName.toLowerCase().includes(stockInk)
    );
    
    // 5) DILUENT - always show badge
    const isDiluent = productId.includes('diluent') || 
                      productName.toLowerCase().includes('diluent') ||
                      productId === 'diluent';
    
    // DECISION LOGIC - Show badge if:
    if (isMachine || isPowerSupply || isDiluent) {
      return {
        text: 'Order on Request',
        class: 'badge-order-request',
        canPurchase: true
      };
    }
    
    if (isAccessory && !isExcludedAccessory) {
      return {
        text: 'Order on Request',
        class: 'badge-order-request',
        canPurchase: true
      };
    }
    
    if (isInk && !isInStockInk) {
      return {
        text: 'Order on Request',
        class: 'badge-order-request',
        canPurchase: true
      };
    }
  }
  
  // IN STOCK - No badge (default clean look)
  return null;
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
        img.onerror = () => {
          if (!img.src || img.src.endsWith('/images/placeholder.jpg')) return;
          img.src = '/images/placeholder.jpg';
        };

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

        // Add availability badge if needed
        const badgeInfo = getAvailabilityBadgeInfo(product);
        if (badgeInfo) {
          const badge = document.createElement('span');
          badge.className = `product-availability-badge ${badgeInfo.class}`;
          badge.textContent = badgeInfo.text;
          card.appendChild(badge);

          if (badgeInfo.class === 'badge-order-request') {
            const shipsNote = document.createElement('p');
            shipsNote.className = 'product-ships-note';
            shipsNote.textContent = 'Ships in 7–10 days';
            info.appendChild(shipsNote);
          }

          // Store purchase status for potential future use
          card.dataset.canPurchase = badgeInfo.canPurchase;
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
