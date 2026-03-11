(async function() {
  'use strict';

  // GET product ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  if (!productId) {
    alert('Product not found');
    window.location.href = '/';
    return;
  }

  // LOAD products from multiple JSON files (cosmetics + needles)
  let productData;
  const productFiles = [
    '/data/product-accessories.json',
    '/data/products-cosmetics.json',
    '/data/products-artistic-inks.json',
    '/data/product-tattoo-machines.json',
    '/data/products-power-supplies.json',
    '/data/products-needles-022.json',
    '/data/products-needles-025.json',
    '/data/products-needles-030.json'
  ];

  try {
    // Start local fetches
    const localFetches = productFiles.map(p => fetch(p).catch(e => ({ ok: false, error: e })));

    // Start internal API fetch in parallel
    const apiFetch = fetch(`/api/catalog?type=product&id=${encodeURIComponent(productId)}`).catch(e => ({ ok: false, _error: e }));

    const responses = await Promise.all(localFetches);
    let allProducts = {};
    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      const path = productFiles[i];
      if (!res || !res.ok) {
        console.warn('Could not load', path);
        continue;
      }
      const json = await res.json();
      Object.assign(allProducts, json);
    }

    const localProduct = allProducts[productId];
    if (!localProduct) {
      alert('Product not found');
      window.location.href = '/';
      return;
    }

    // Await API result (may have already completed)
    let apiData = null;
    try {
      const apiRes = await apiFetch;
      if (apiRes && apiRes.ok) {
        const apiJson = await apiRes.json();
        if (Array.isArray(apiJson) && apiJson.length > 0) apiData = apiJson;
      } else if (apiRes && apiRes._error) {
        console.warn('Could not fetch internal catalog for product:', apiRes._error);
      } else if (apiRes && apiRes.ok === false) {
        console.warn('Internal catalog returned non-OK for product');
      }
    } catch (e) {
      console.warn('Could not fetch internal catalog for product:', e);
    }

    // Merge pricing/stock from internal API into local productData (if available)
    if (apiData && localProduct) {
      // Build a map of api entries by variant_id for quick lookup
      const apiByVariant = new Map();
      apiData.forEach(item => {
        if (item && item.variant_id) apiByVariant.set(item.variant_id, item);
      });

      // Helper to match variant id heuristically
      function findApiForVariant(variant) {
        if (!variant) return null;
        const vid = variant.id || '';
        if (apiByVariant.has(vid)) return apiByVariant.get(vid);
        // try product-prefixed variant id e.g. `${productId}-${variant.id}`
        const prefixed = `${productId}-${vid}`;
        if (apiByVariant.has(prefixed)) return apiByVariant.get(prefixed);
        // try suffix match
        for (const [k, v] of apiByVariant.entries()) {
          if (k.endsWith(vid)) return v;
        }
        return null;
      }

      // If variants exist, patch them
      if (Array.isArray(localProduct.variants) && localProduct.variants.length > 0) {
        localProduct.variants.forEach(variant => {
          const apiEntry = findApiForVariant(variant);
          if (apiEntry) {
            const parsedPrice = parseFloat(apiEntry.price_ex);
            if (!isNaN(parsedPrice)) variant.price = parseFloat((parsedPrice * 1.23).toFixed(2));
            const parsedStock = parseInt(apiEntry.stock, 10);
            if (!isNaN(parsedStock)) variant.quantity = parsedStock;
          }
        });

        // Update inventory.stock_status based on total stock
        const totalStock = localProduct.variants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
        localProduct.inventory = localProduct.inventory || {};
        const originalStatus = localProduct.inventory?.stock_status;
        const isOnRequest = localProduct.orderOnRequest === true || originalStatus === 'available_on_request';
        localProduct.inventory.stock_status = totalStock > 0 ? 'in_stock' : (isOnRequest ? 'available_on_request' : 'out_of_stock');
      } else if (Array.isArray(apiData) && apiData.length > 0) {
        // Simple product - apply first api entry as fallback
        const first = apiData[0];
        if (first) {
          const parsedPrice = parseFloat(first.price_ex);
          if (!isNaN(parsedPrice)) {
            const priceWithVat = parseFloat((parsedPrice * 1.23).toFixed(2));
            if (localProduct.basic) localProduct.basic.price = priceWithVat; else localProduct.price = priceWithVat;
          }
        }
        localProduct.inventory = localProduct.inventory || {};
        const originalStatus = localProduct.inventory?.stock_status;
        const isOnRequest = localProduct.orderOnRequest === true || originalStatus === 'available_on_request';
        const anyStock = apiData.some(a => Number(a.stock) > 0);
        localProduct.inventory.stock_status = anyStock ? 'in_stock' : (isOnRequest ? 'available_on_request' : 'out_of_stock');
      }
    }

    // Use localProduct (possibly merged) going forward
    productData = localProduct;
  } catch (error) {
    console.error('Error loading product:', error);
    alert('Error loading product. Please try again.');
    return;
  }

  // ===== INVENTORY (SIMPLE) =====
  function getQuantity(variant) {
    if (variant.quantity === undefined || variant.quantity === null) {
      return null;
    }
    return variant.quantity;
  }
  // ===== FIM INVENTORY (SIMPLE) =====

  /**
   * Hybrid availability check.
   * Priority:
   * 1. variant.stock_status === 'out_of_stock' => unavailable
   * 2. variant.stock_status === 'in_stock' => available (but validate quantity if present)
   * 3. fallback to quantity > 0
   * 4. if neither present => assume available (backwards compatible)
   */
  /**
   * Verifica se variant está disponível para compra
   * Regra segura: sem quantity = indisponível
   *
   * @param {Object} productData - Dados completos do produto
   * @param {Object} variant - Variante específica
   * @returns {boolean} true se disponível, false caso contrário
   */
  function isAvailable(productData, variant) {
    // 1. Produto inteiro out of stock? Nenhum variant disponível
    if (productData?.inventory?.stock_status === 'out_of_stock') {
      return false;
    }

    // 2. Variant não existe? Indisponível
    if (!variant) {
      return false;
    }

    // 3. Variant explicitamente marcado out of stock?
    if (variant.stock_status === 'out_of_stock') {
      return false;
    }

    // Order on Request — always purchasable regardless of stock
    if (productData?.orderOnRequest === true ||
        productData?.inventory?.stock_status === 'available_on_request') {
      return true;
    }

    // 4. Variant tem quantity definido?
    if (variant.quantity !== undefined && variant.quantity !== null) {
      // Disponível apenas se quantity > 0
      return Number(variant.quantity) > 0;
    }

    // 5. Sem quantity e sem stock_status explícito = INDISPONÍVEL (safe default)
    return false;
  }

  // EXTRACT values with fallbacks (supports old and new structure)
  const name = productData.basic?.name || productData.name || 'Unnamed Product';
  const tagline = productData.basic?.tagline || null;
  const shortDesc = productData.basic?.short_description || productData.description || '';
  const fullDesc = productData.content?.full_description || productData.description || shortDesc;
  const category = productData.basic?.category || productData.category || '';
  // Map old 'Needles' category to 'Cartridges' for display (cartridge products
  // are stored under category 'Needles' in data files)
  const displayCategory = (category || '').toString().toLowerCase() === 'needles'
    ? 'Cartridges'
    : category;
  const mainImage = productData.media?.main_image || productData.image || '/images/placeholder.jpg';
  const gallery = productData.media?.gallery || productData.images || [mainImage];

  // RENDER SEO
  const metaTitle = productData.seo?.meta_title || `${name} - Electric Ink IE`;
  const metaDesc = productData.seo?.meta_description || shortDesc;
  
  document.getElementById('page-title').textContent = metaTitle;
  
  // Add or update meta description
  let metaDescTag = document.querySelector('meta[name="description"]');
  if (!metaDescTag) {
    metaDescTag = document.createElement('meta');
    metaDescTag.setAttribute('name', 'description');
    document.head.appendChild(metaDescTag);
  }
  metaDescTag.setAttribute('content', metaDesc);

  // RENDER basic info
  document.getElementById('productName').textContent = name;
  
  // Tagline (if exists)
  if (tagline) {
    const taglineEl = document.createElement('p');
    taglineEl.className = 'product-tagline';
    taglineEl.textContent = tagline;
    document.getElementById('productName').after(taglineEl);
  }

  // Category badge (use mapped displayCategory)
  if (displayCategory) {
    const categoryEl = document.getElementById('productCategory');
    categoryEl.textContent = displayCategory.toUpperCase();
    categoryEl.style.display = 'inline-block';
  }

  // Description (use full_description if available, split into paragraphs)
  const descContainer = document.getElementById('productDescription');
  if (fullDesc) {
    const paragraphs = fullDesc.split('\n\n').filter(p => p.trim());
    paragraphs.forEach(para => {
      const p = document.createElement('p');
      p.textContent = para.trim();
      descContainer.appendChild(p);
    });
  }

  // RENDER price (defensive: avoid calling toFixed on undefined)
  const priceEl = document.getElementById('productPrice');
  if (productData.variants && productData.variants.length > 0) {
    // Has variants - determine numeric variant prices safely
    const variantPrices = productData.variants
      .map(v => (typeof v.price === 'number' && !isNaN(v.price)) ? v.price : null)
      .filter(p => typeof p === 'number');

    if (variantPrices.length === 0) {
      // No numeric variant prices: fall back to product-level price or range
      const basePrice = productData.basic?.price ?? productData.price;
      priceEl.textContent = basePrice ? `€${Number(basePrice).toFixed(2)}` : (productData.price_range?.display || 'Price unavailable');
    } else {
      const uniquePrices = Array.from(new Set(variantPrices.map(p => Number(p).toFixed(2))));
      if (uniquePrices.length === 1) {
        // All variants share same price - display single price
        priceEl.textContent = `€${parseFloat(uniquePrices[0]).toFixed(2)}`;
      } else {
        // Multiple prices - show price range using the lowest variant price
        const minPrice = Math.min(...variantPrices);
        priceEl.textContent = productData.price_range?.display || `from €${Number(minPrice).toFixed(2)}`;
      }
    }
  } else {
    // Simple product - use basic price or product-level price defensively
    const price = (typeof productData.basic?.price === 'number') ? productData.basic.price : productData.price;
    priceEl.textContent = (typeof price === 'number' && !isNaN(price)) ? `€${price.toFixed(2)}` : 'Price unavailable';
  }

  // RENDER stock indicator badge based on inventory.stock_status
  (function renderStockBadge() {
    const stockStatus = productData.inventory?.stock_status || (productData.inStock ? 'in_stock' : 'out_of_stock');
    const productStock = document.getElementById('productStock');
    if (!productStock) return;
    const dot = productStock.querySelector('.stock-dot');
    const text = productStock.querySelector('.stock-text');

    let label = 'In Stock';
    let color = '#43BDAB';

    if (stockStatus === 'available_soon') {
      const availableDate = productData.availableDate || productData.inventory?.availableDate;
      if (availableDate) {
        try {
          const d = new Date(availableDate);
          label = `Coming soon (${d.toLocaleDateString('en-IE', { month: 'short', day: 'numeric' })})`;
        } catch (e) {
          label = 'Coming soon';
        }
      } else {
        label = 'Coming soon';
      }
      color = '#f59e0b';
    } else if (productData.orderOnRequest === true) {
      label = 'Available — may ship with delay';
      color = '#f97316';
    } else if (stockStatus === 'available_on_request') {
      label = 'Available — may ship with delay';
      color = '#f97316';
    } else if (stockStatus === 'out_of_stock') {
      label = 'Out of Stock';
      color = '#6b7280';
    } else {
      label = 'In Stock';
      color = '#43BDAB';
    }

    if (dot) dot.style.background = color;
    if (text) text.textContent = label;

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn-share-inline';
    shareBtn.title = 'Share this product';
    shareBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

    shareBtn.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: name, url: window.location.href });
        } else {
          await navigator.clipboard.writeText(window.location.href);
          shareBtn.title = 'Link copied!';
          setTimeout(() => { shareBtn.title = 'Share this product'; }, 2000);
        }
      } catch (e) {}
    });

    if (productStock) productStock.appendChild(shareBtn);
  })();

  // RENDER images
  const mainImg = document.getElementById('mainProductImage');
  const thumbsContainer = document.getElementById('thumbnails');
  
  if (gallery && gallery.length > 1) {
    // Multiple images - render gallery
    mainImg.src = gallery[0];
    mainImg.alt = name;
    
    gallery.forEach((imgUrl, index) => {
      const thumb = document.createElement('img');
      thumb.src = imgUrl;
      thumb.alt = `${name} - Image ${index + 1}`;
      thumb.className = 'product-thumbnail' + (index === 0 ? ' active' : '');
      thumb.onclick = () => {
        mainImg.src = imgUrl;
        document.querySelectorAll('.product-thumbnail').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      };
      thumbsContainer.appendChild(thumb);
    });
  } else if (mainImage) {
    // Single image
    mainImg.src = mainImage;
    mainImg.alt = name;
  }

  // RENDER variants (if any)
  if (productData.variants && productData.variants.length > 0) {
    const variantsContainer = document.getElementById('variantsContainer');
    const variantSelect = document.getElementById('variantSelect');
    const variantLabel = document.getElementById('variantLabel');

    variantsContainer.style.display = 'block';

    // Variant label and description
    if (productData.variant_config?.label) {
      variantLabel.textContent = productData.variant_config.label + ':';
    }

    if (productData.variant_config?.description) {
      const variantDesc = document.createElement('p');
      variantDesc.className = 'variant-description';
      variantDesc.textContent = productData.variant_config.description;
      variantsContainer.insertBefore(variantDesc, variantSelect);
    }

    

    // Populate options (use safe price fallback and avoid toFixed on undefined)
    // Determine whether variants share a single price
    const variantPrices = productData.variants
      .map(v => (typeof v.price === 'number' && !isNaN(v.price)) ? v.price : null)
      .filter(p => typeof p === 'number');
    const uniquePrices = Array.from(new Set(variantPrices.map(p => Number(p).toFixed(2))));
    const sharedPrice = variantPrices.length > 0 && uniquePrices.length === 1;

    productData.variants.forEach((variant, index) => {
      const option = document.createElement('option');
      option.value = variant.id;

      // Determine option price safely (use product price as fallback when sharedPrice)
      const optPrice = sharedPrice
        ? (productData.basic?.price ?? productData.price ?? variant.price)
        : variant.price;
      option.dataset.price = (typeof optPrice === 'number' && !isNaN(optPrice)) ? String(optPrice) : '';

      // Ensure a usable priceId is available on the option: prefer variant, otherwise fall back to product-level ids
      option.dataset.priceId = variant.stripe_price_id || variant.priceId || variant.price_id || productData.stripe_price_id || (productData.stripe && (productData.stripe.priceId || productData.stripe.price_id)) || productData.priceId || productData.price_id || '';
      option.dataset.image = variant.image || '';
      option.dataset.description = variant.description || '';

      // Inventory (read-only from JSON): use secure availability check
      const qty = getQuantity(variant);
      // Use new isAvailable signature which checks product-level stock_status internally
      const available = isAvailable(productData, variant);

      // expose availability and quantity to DOM for handlers
      option.dataset.available = available ? 'true' : 'false';
      if (qty !== null) {
        option.dataset.quantity = String(qty);
      }

      if (!available) {
        option.disabled = true;
        option.textContent = `${variant.label} - Out of Stock`;
      }

      // Use dataset.price for display to avoid calling toFixed on undefined
      const displayPrice = parseFloat(option.dataset.price);
      // If we already set textContent above for stock messages, keep it and append price where applicable
      if (!option.textContent || option.textContent.trim() === '') {
        option.textContent = isNaN(displayPrice) ? `${variant.label}` : `${variant.label} - €${displayPrice.toFixed(2)}`;
      } else if (!isNaN(displayPrice)) {
        // append price alongside existing stock text
        option.textContent = `${option.textContent} - €${displayPrice.toFixed(2)}`;
      }

      variantSelect.appendChild(option);
    });

    // Ensure select has a valid selection: pick first available variant if present,
    // otherwise select the first option (even if disabled). If there are no options,
    // add a disabled placeholder to avoid an empty select element.
    if (variantSelect.options.length === 0) {
      const ph = document.createElement('option');
      ph.textContent = 'No variants available';
      ph.disabled = true;
      ph.setAttribute('aria-disabled', 'true');
      variantSelect.appendChild(ph);
      variantSelect.selectedIndex = 0;
    } else {
      const firstAvailable = Array.from(variantSelect.options).find(o => !o.disabled);
      if (firstAvailable) {
        variantSelect.value = firstAvailable.value;
      } else {
        // none available - choose first option so select isn't empty
        variantSelect.selectedIndex = 0;
      }
    }

    // Update price and image on change (defensive: handle missing dataset.price)
    variantSelect.onchange = function() {
      let selected = this.options[this.selectedIndex];

      // Guard: if no selected option, try to pick a sensible fallback
      if (!selected) {
        const firstAvailable = Array.from(this.options).find(o => !o.disabled);
        if (firstAvailable) {
          this.value = firstAvailable.value;
          selected = this.options[this.selectedIndex];
        } else if (this.options.length > 0) {
          this.selectedIndex = 0;
          selected = this.options[0];
        } else {
          // Nothing to do - ensure add-to-cart is disabled and return
          const addBtn = document.getElementById('addToCartBtn');
          if (addBtn) {
            addBtn.disabled = true;
            addBtn.textContent = 'Out of Stock';
          }
          priceEl.textContent = productData.price_range?.display || 'Price unavailable';
          return;
        }
      }

      const parsed = parseFloat(selected.dataset.price);
      if (!isNaN(parsed)) {
        priceEl.textContent = `€${parsed.toFixed(2)}`;
      } else {
        // fallback to product-level price or display price range
        const basePrice = (typeof productData.basic?.price === 'number') ? productData.basic.price : productData.price;
        priceEl.textContent = basePrice ? `€${Number(basePrice).toFixed(2)}` : (productData.price_range?.display || 'Price unavailable');
      }

      // Update image if variant has one
      if (selected.dataset.image) {
        mainImg.src = selected.dataset.image;
        mainImg.alt = `${name} - ${selected.textContent}`;
      }

      // Update description if exists
      if (selected.dataset.description) {
        const variantDescEl = document.querySelector('.variant-selected-description');
        if (variantDescEl) {
          variantDescEl.textContent = selected.dataset.description;
        } else {
          const descEl = document.createElement('p');
          descEl.className = 'variant-selected-description';
          descEl.textContent = selected.dataset.description;
          variantSelect.after(descEl);
        }
      }
      
      // Verify availability on variant change (uses dataset.available set during population)
      const available = selected.dataset.available;
      const addBtn = document.getElementById('addToCartBtn');
      if (available === 'false') {
        if (addBtn) {
          addBtn.disabled = true;
          addBtn.textContent = 'Out of Stock';
        }
      } else {
        if (addBtn) {
          addBtn.disabled = false;
          addBtn.textContent = 'Add to Cart';
        }
      }
    };

    // Trigger change event for the selected variant to initialize the image
    variantSelect.dispatchEvent(new Event('change'));
  }

  // ======= Helper: Resolve Stripe priceId (FRONT) =======
  function resolveStripePriceId(product, variant) {
    if (variant && (variant.stripe_price_id || variant.priceId || variant.price_id)) {
      return variant.stripe_price_id || variant.priceId || variant.price_id;
    }
    if (product && product.stripe && (product.stripe.priceId || product.stripe.price_id)) {
      return product.stripe.priceId || product.stripe.price_id;
    }
    if (product && (product.priceId || product.price_id)) {
      return product.priceId || product.price_id;
    }
    throw new Error(`Stripe priceId not found for product ${product && product.id}`);
  }

  // RENDER How to Use accordion (if exists and NOT cartridges)
  if (productData.content?.usage_instructions && category !== 'cartridges') {
    const howToContainer = document.getElementById('productHowToUse');
    const howToSteps = document.getElementById('howToSteps');
    const howToToggle = document.getElementById('howToToggle');
    const howToContent = document.getElementById('howToContent');
    
    howToContainer.style.display = 'block';
    
    // Parse steps (split by newline or numbered list)
    const steps = productData.content.usage_instructions.split('\n').filter(s => s.trim());
    
    steps.forEach(step => {
      const li = document.createElement('li');
      // Remove números se tiver (e.g. "1. Apply..." → "Apply...")
      li.textContent = step.replace(/^\d+\.\s*/, '').trim();
      howToSteps.appendChild(li);
    });
    
    // Toggle functionality
    howToToggle.onclick = function() {
      const isExpanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', (!isExpanded).toString());
      howToContent.classList.toggle('active');
      // also toggle active class on the button for styling
      this.classList.toggle('active');
    };
  }

  // RENDER materials/ingredients (if exists)
  if (productData.content?.materials || productData.content?.ingredients) {
    const materialsSection = document.createElement('div');
    materialsSection.className = 'product-materials';
    
    const title = productData.content.materials ? 'Materials' : 'Ingredients';
    const content = productData.content.materials || productData.content.ingredients;
    
    // Build elements safely to avoid injecting untrusted HTML
    const h3 = document.createElement('h3');
    h3.textContent = title;
    const pContent = document.createElement('p');
    pContent.textContent = content;
    materialsSection.appendChild(h3);
    materialsSection.appendChild(pContent);
    
    document.querySelector('.product-usage')?.after(materialsSection) || 
    document.getElementById('productDescription').after(materialsSection);
  }

  // RENDER warnings (if exists) — support both `warnings` and legacy `warning` keys
  const rawWarningText = productData.content?.warnings || productData.content?.warning || '';
  if (rawWarningText) {
    // Extract leading IMPORTANT: (case-insensitive) and split into badge + body
    let importantHTML = '';
    let bodyText = rawWarningText.trim();
    const m = bodyText.match(/^\s*IMPORTANT:\s*(.*)$/i);
    if (m) {
      importantHTML = '<span class="important-note">IMPORTANT</span>';
      bodyText = m[1] || '';
    }

    const warningBox = document.createElement('div');
    warningBox.className = 'product-warning';
    // Lucide-style inline SVG (alert-triangle) used as visual icon — purely presentational
    const lucideInfo = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#43BDAB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" aria-hidden="true" focusable="false">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>`;

    // Build simple vertical content: IMPORTANT badge above the message (no icon)
    // Insert presentational SVG (static) then create text nodes safely
    if (lucideInfo) warningBox.insertAdjacentHTML('beforeend', lucideInfo);
    const warningContentDiv = document.createElement('div');
    warningContentDiv.className = 'warning-content';

    const warningTopDiv = document.createElement('div');
    warningTopDiv.className = 'warning-top';
    if (importantHTML) {
      // importantHTML is a static badge string - create element instead of injecting raw HTML
      const impSpan = document.createElement('span');
      impSpan.className = 'important-note';
      impSpan.textContent = 'IMPORTANT';
      warningTopDiv.appendChild(impSpan);
    }

    const warningP = document.createElement('p');
    warningP.className = 'warning-text';
    // HTML formatting required for IMPORTANT notices - content controlled by admin
    warningP.innerHTML = bodyText;

    warningContentDiv.appendChild(warningTopDiv);
    warningContentDiv.appendChild(warningP);
    warningBox.appendChild(warningContentDiv);

    document.querySelector('.product-materials')?.after(warningBox) ||
    document.querySelector('.product-usage')?.after(warningBox) ||
    document.getElementById('productDescription').after(warningBox);
  }

  // RENDER features (if any)
  if (productData.features && productData.features.length > 0) {
    const featuresContainer = document.getElementById('productFeatures');
    const featuresList = document.getElementById('featuresList');
    
    featuresContainer.style.display = 'block';
    
    productData.features.forEach(feature => {
      const li = document.createElement('li');
      li.textContent = feature;
      featuresList.appendChild(li);
    });
  }

  // RENDER specifications (if any)
  if (productData.specifications) {
    const specsContainer = document.getElementById('productSpecs');
    const specsList = document.getElementById('specsList');
    
    specsContainer.style.display = 'block';
    
    Object.entries(productData.specifications).forEach(([key, value]) => {
      const specItem = document.createElement('div');
      specItem.className = 'spec-item';
      
      const label = document.createElement('span');
      label.className = 'spec-label';
      label.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ':';
      
      const valueSpan = document.createElement('span');
      valueSpan.className = 'spec-value';
      valueSpan.textContent = value;
      
      specItem.appendChild(label);
      specItem.appendChild(valueSpan);
      specsList.appendChild(specItem);
    });
  }

  // RENDER applications (if exists - cartridges only)
  if (productData.applications) {
    const appsSection = document.createElement('div');
    appsSection.className = 'product-applications';
    appsSection.innerHTML = '<h3>Commonly Used For</h3>';

    // Support two shapes:
    // - productData.applications = { primary_uses: [..] }
    // - productData.applications = [..]
    let uses = [];
    if (Array.isArray(productData.applications)) {
      uses = productData.applications;
    } else if (productData.applications.primary_uses && Array.isArray(productData.applications.primary_uses)) {
      uses = productData.applications.primary_uses;
    }

    if (uses.length > 0) {
      const usesList = document.createElement('ul');
      uses.forEach(use => {
        const li = document.createElement('li');
        li.textContent = use;
        usesList.appendChild(li);
      });
      appsSection.appendChild(usesList);
    }

    document.getElementById('productSpecs')?.after(appsSection) ||
    document.getElementById('productFeatures')?.after(appsSection);
  }

  // RENDER disclaimer (if exists)
  if (productData.content?.disclaimer) {
    const disclaimerBox = document.createElement('div');
    disclaimerBox.className = 'product-disclaimer';
    const p = document.createElement('p');
    const em = document.createElement('em');
    em.textContent = productData.content.disclaimer;
    p.appendChild(em);
    disclaimerBox.appendChild(p);

    document.querySelector('.product-applications')?.after(disclaimerBox) ||
    document.getElementById('productSpecs')?.after(disclaimerBox);
  }

  // ===== WHOLESALE SECTION =====
if (productData.wholesale && productData.wholesale.enabled) {
  const wholesale = productData.wholesale;
  const productInfo = document.querySelector('.product-info');

  // Tab buttons — inserir depois do título (productName)
  const tabButtons = document.createElement('div');
  tabButtons.className = 'product-tab-buttons';
  tabButtons.innerHTML = `
    <button class="product-tab-btn active" data-tab="individual">Individual</button>
    <button class="product-tab-btn" data-tab="wholesale">Wholesale</button>
  `;
  document.getElementById('productName').after(tabButtons);

  // Wholesale panel — inserir depois dos tab buttons
  const wholesalePanel = document.createElement('div');
  wholesalePanel.className = 'wholesale-panel';
  wholesalePanel.style.display = 'none';

  const wholesaleDesc = document.createElement('p');
  wholesaleDesc.className = 'wholesale-description';
  wholesaleDesc.textContent = wholesale.description;
  wholesalePanel.appendChild(wholesaleDesc);

  const tiersGrid = document.createElement('div');
  tiersGrid.className = 'wholesale-tiers';

  let selectedTier = wholesale.tiers[0];

  wholesale.tiers.forEach((tier, index) => {
    const card = document.createElement('div');
    card.className = 'wholesale-tier-card' + (index === 0 ? ' selected' : '');
    card.dataset.tierId = tier.id;
    card.innerHTML = `
      <div class="tier-label">${tier.label}</div>
      <div class="tier-qty">${tier.quantity} units</div>
      <div class="tier-unit-price">€${tier.unit_price.toFixed(2)}/unit</div>
      ${(() => {
        const individualPrice = productData.basic?.price ?? productData.price ?? 0;
        const individualTotal = individualPrice * tier.quantity;
        const saving = individualTotal - tier.price;
        return saving > 0.01
          ? `<div class="tier-saving"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg> Save €${saving.toFixed(2)}</div>`
          : '';
      })()}
    `;
    card.addEventListener('click', () => {
      tiersGrid.querySelectorAll('.wholesale-tier-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedTier = tier;
      const individualPrice = productData.basic?.price ?? productData.price ?? 0;
      const individualTotal = individualPrice * tier.quantity;
      const saving = Math.max(0, individualTotal - tier.price);
      wholesaleBuyBtn.textContent = `Order ${tier.label} — Save €${saving.toFixed(2)}`;
    });
    tiersGrid.appendChild(card);
  });

  wholesalePanel.appendChild(tiersGrid);

  const wholesaleBuyBtn = document.createElement('button');
  wholesaleBuyBtn.className = 'btn-add-to-cart btn-wholesale-buy';
  {
    const individualPrice = productData.basic?.price ?? productData.price ?? 0;
    const individualTotal = individualPrice * selectedTier.quantity;
    const saving = Math.max(0, individualTotal - selectedTier.price);
    wholesaleBuyBtn.textContent = `Order ${selectedTier.label} — Save €${saving.toFixed(2)}`;
  }
  wholesaleBuyBtn.addEventListener('click', () => {
    if (!selectedTier) return;
    const itemToAdd = {
      id: selectedTier.id,
      name: `${name} - Wholesale ${selectedTier.label} (${selectedTier.quantity} units)`,
      price: selectedTier.price,
      stripe_price_id: selectedTier.stripe_price_id,
      image: mainImage,
      variant: `${selectedTier.quantity} units`
    };
    if (window.cart && window.cart.addItem) {
      if (window.cart.addItem(itemToAdd)) {
        const orig = wholesaleBuyBtn.innerHTML;
        wholesaleBuyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;margin-right:4px;"><circle cx="10" cy="10" r="9" stroke="#43BDAB" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round"/></svg> Added!`;
        wholesaleBuyBtn.style.background = '#43BDAB';
        setTimeout(() => {
          wholesaleBuyBtn.innerHTML = orig;
          wholesaleBuyBtn.style.background = '';
        }, 2000);
      }
    }
  });
  wholesalePanel.appendChild(wholesaleBuyBtn);

  tabButtons.after(wholesalePanel);

  // Elementos que pertencem só à aba Individual
  const individualEls = ['productPrice', 'productStock', 'variantsContainer', 'addToCartBtn'];

  // Toggle
  tabButtons.querySelectorAll('.product-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.querySelectorAll('.product-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const isWholesale = btn.dataset.tab === 'wholesale';
      wholesalePanel.style.display = isWholesale ? 'flex' : 'none';
      wholesalePanel.style.flexDirection = 'column';
      wholesalePanel.style.gap = '24px';

      individualEls.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (isWholesale) {
          el.style.display = 'none';
        } else {
          if (id === 'variantsContainer') {
            el.style.display = (productData.variants && productData.variants.length > 0) ? 'block' : 'none';
          } else {
            el.style.display = '';
          }
        }
      });
    });
  });
}
// ===== FIM WHOLESALE =====

  // ADD TO CART button
/**
 * Check if product can be purchased
 * @param {Object} product - Product object with inventory data
 * @returns {Object} - {canPurchase, reason, message}
 */
function checkProductAvailability(product) {
  const stockStatus = product.inventory?.stock_status;
  
  // Coming Soon - cannot purchase
  if (stockStatus === 'available_soon') {
    const availableDate = product.availableDate || product.inventory?.availableDate;
    let dateText = '';
    if (availableDate) {
      try {
        const date = new Date(availableDate);
        dateText = ' (' + date.toLocaleDateString('en-IE', { month: 'short', day: 'numeric' }) + ')';
      } catch (e) {
        dateText = availableDate ? ` (${availableDate})` : '';
      }
    }
    return {
      canPurchase: false,
      reason: 'coming_soon',
      // Mensagem removida por solicitação — manter string vazia
      message: ''
    };
  }
  
  // Out of Stock - cannot purchase
  if (stockStatus === 'out_of_stock') {
    return {
      canPurchase: false,
      reason: 'out_of_stock',
      message: 'This product is currently out of stock'
    };
  }
  
  // Order on Request - can purchase (but takes longer)
  if (stockStatus === 'available_on_request') {
    return {
      canPurchase: true,
      reason: 'order_on_request',
      message: ''
    };
  }
  
  // In Stock - can purchase normally
  return {
    canPurchase: true,
    reason: 'in_stock',
    message: ''
  };
}

  // Set up Add to Cart button with availability check
  const addToCartBtn = document.getElementById('addToCartBtn');
  if (addToCartBtn) {
    const availability = checkProductAvailability(productData);

    if (!availability.canPurchase) {
    // Product cannot be purchased - disable button
    addToCartBtn.disabled = true;
    addToCartBtn.style.opacity = '0.5';
    addToCartBtn.style.cursor = 'not-allowed';
    addToCartBtn.style.backgroundColor = '#6b7280';
    
    // Change button text based on reason
    if (availability.reason === 'coming_soon') {
      addToCartBtn.textContent = 'Coming Soon';
    } else if (availability.reason === 'out_of_stock') {
      addToCartBtn.textContent = 'Out of Stock';

      // Notify Me button
      const notifyBtn = document.createElement('button');
      notifyBtn.id = 'notifyMeBtn';
      notifyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>Notify me when back in stock`;
      notifyBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;margin-top:10px;padding:11px 16px;border-radius:10px;border:1.5px solid #43BDAB;background:transparent;color:#43BDAB;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;transition:all 0.2s ease';
      notifyBtn.onmouseenter = () => { notifyBtn.style.background = '#43BDAB'; notifyBtn.style.color = '#fff'; };
      notifyBtn.onmouseleave = () => { notifyBtn.style.background = 'transparent'; notifyBtn.style.color = '#43BDAB'; };
      notifyBtn.onclick = () => openNotifyMeModal();
      addToCartBtn.parentNode.insertBefore(notifyBtn, addToCartBtn.nextSibling);
    }
    
    // Show message to user
    if (availability.message) {
      const productPrice = document.querySelector('.product-price') || document.getElementById('productPrice');
      if (productPrice) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'availability-message';
        messageDiv.style.cssText = 'color: #6b7280; font-size: 0.9rem; margin-top: 8px; font-style: italic;';
        messageDiv.textContent = availability.message;
        productPrice.parentNode.insertBefore(messageDiv, productPrice.nextSibling);
      }
    }
  } else {
      // Product can be purchased - attach existing handler
      addToCartBtn.onclick = function() {
        let itemToAdd;
        
        if (productData.variants && productData.variants.length > 0) {
          // Product with variants
          const variantSelect = document.getElementById('variantSelect');
          
          if (!variantSelect || variantSelect.selectedIndex === -1) {
            alert('Please select a variant');
            return;
          }
          
          const selectedOption = variantSelect.options[variantSelect.selectedIndex];
          const selectedVariant = productData.variants.find(v => v.id === selectedOption.value);
          
          if (!selectedVariant) {
            alert('Invalid variant selected');
            return;
          }
          
          // Resolve priceId explicitly and fail if missing
          let resolvedPriceId;
          try {
            resolvedPriceId = resolveStripePriceId(productData, selectedVariant);
          } catch (err) {
            console.error('Stripe price resolution failed (variant):', err);
            alert('Product price not configured correctly. Please contact support.');
            return;
          }

          

          // Resolve a usable price for the selected variant (fallback to product price)
          const resolvedVariantPrice = (typeof selectedVariant.price === 'number' && !isNaN(selectedVariant.price))
            ? selectedVariant.price
            : (productData.basic?.price ?? productData.price ?? null);

          if (resolvedVariantPrice === null) {
            console.error('No price available for selected variant or product', { productId, selectedVariant });
            alert('Product price not available');
            return;
          }

          itemToAdd = {
            id: `${productId}-${selectedVariant.id}`,
            name: `${name} - ${selectedVariant.label}`,
            price: resolvedVariantPrice,
            stripe_price_id: resolvedPriceId,
            image: selectedVariant.image || mainImage,
            variant: selectedVariant.id || selectedVariant.label || null
          };
        } else {
          // Simple product
          const price = productData.basic?.price || productData.price;
          // Resolve priceId explicitly and fail if missing
          let resolvedPriceId;
          try {
            resolvedPriceId = resolveStripePriceId(productData, undefined);
          } catch (err) {
            console.error('Stripe price resolution failed (simple product):', err, productData);
            alert('Product price not configured correctly. Please contact support.');
            return;
          }

          

          if (!price) {
            alert('Product price not available');
            return;
          }

          itemToAdd = {
            id: productId,
            name: name,
            price: price,
            stripe_price_id: resolvedPriceId,
            image: mainImage
          };
        }
        
        // ===== VALIDAÇÃO DE STOCK (FRONTEND) =====
        // Proteção extra: verificar disponibilidade declarada no option
        if (productData.variants && productData.variants.length > 0) {
          const variantSelect = document.getElementById('variantSelect');
          const selectedOption = variantSelect && variantSelect.options[variantSelect.selectedIndex];
          const available = selectedOption && selectedOption.dataset && selectedOption.dataset.available;
          if (available === 'false') {
            alert('Sorry, this item is currently out of stock. Please select another variant.');
            return;
          }
        }

        // Add to cart usando global system
        if (window.cart && window.cart.addItem) {
          if (window.cart.addItem(itemToAdd)) {
            // Success feedback no botão
            const btn = this;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;margin-right:4px;"><circle cx="10" cy="10" r="9" stroke="#43BDAB" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round"/></svg> Added!`;
            btn.style.background = '#43BDAB';
            setTimeout(() => {
              btn.innerHTML = originalHTML;
              btn.style.background = '';
            }, 2000);
          } else {
            alert('Failed to add item to cart. Please try again.');
          }
        } else {
          alert('Cart system not available. Please refresh the page.');
        }
      };
    }
  }

  // Breadcrumb - atualiza com informação correta do produto
  const breadcrumbCategory = displayCategory ? displayCategory.charAt(0).toUpperCase() + displayCategory.slice(1) : 'Products';
  const categoryLink = document.getElementById('breadcrumb-category-link');
  
  if (categoryLink) {
    categoryLink.textContent = breadcrumbCategory;
    const catParam = displayCategory ? encodeURIComponent(displayCategory.toString().toLowerCase()) : 'all';
    categoryLink.href = `/category.html?cat=${catParam}`;
  }
  
  const breadcrumbProduct = document.getElementById('breadcrumb-product');
  if (breadcrumbProduct) {
    breadcrumbProduct.textContent = name;
  }

  // ===== REVIEWS =====
  const REVIEWS_API = 'https://ei-internal-production.up.railway.app';

  let selectedRating = 0;

  // Star input interaction
  const starBtns = document.querySelectorAll('.star-btn');
  starBtns.forEach(star => {
    function renderStars(val) {
      starBtns.forEach(s => {
        s.innerHTML = Number(s.dataset.value) <= val
          ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="#43BDAB" stroke="#43BDAB" stroke-width="1.5"><polygon points="12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9"/></svg>'
          : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#43BDAB" stroke-width="1.5"><polygon points="12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9"/></svg>';
        s.classList.toggle('active', Number(s.dataset.value) <= val);
      });
    }
    star.addEventListener('mouseover', () => {
      const val = Number(star.dataset.value);
      renderStars(val);
    });
    star.addEventListener('mouseleave', () => {
      renderStars(selectedRating);
    });
    star.addEventListener('click', () => {
      selectedRating = Number(star.dataset.value);
      renderStars(selectedRating);
    });
  });

  // Load and render reviews
  async function loadReviews() {
    try {
      const res = await fetch(`${REVIEWS_API}/api/reviews?product_id=${encodeURIComponent(productId)}`);
      const data = await res.json();

      const summaryEl = document.getElementById('reviewsSummary');
      const listEl = document.getElementById('reviewsList');

      if (data.total === 0) {
        summaryEl.innerHTML = '';
        listEl.innerHTML = '<p class="reviews-empty">No reviews yet — be the first!</p>';
        return;
      }

      // Distribution
      const dist = [5,4,3,2,1].map(n => ({
        stars: n,
        count: data.reviews.filter(r => r.rating === n).length
      }));

      summaryEl.innerHTML = `
        <div>
          <div class="reviews-avg">${data.average}</div>
          <div class="reviews-stars-display">${[...Array(5)].map((_,i)=>i<Math.round(data.average)?'<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"#43BDAB\" stroke=\"#43BDAB\" stroke-width=\"1.5\"><polygon points=\"12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9\"/></svg>':'<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#43BDAB\" stroke-width=\"1.5\"><polygon points=\"12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9\"/></svg>').join('')}</div>
          <div class="reviews-count">${data.total} review${data.total !== 1 ? 's' : ''}</div>
        </div>
        <div class="reviews-bars">
          ${dist.map(d => `
            <div class="reviews-bar-row">
              <span>${d.stars}<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"#43BDAB\" stroke=\"#43BDAB\" stroke-width=\"1.5\"><polygon points=\"12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9\"/></svg></span>
              <div class="reviews-bar-track">
                <div class="reviews-bar-fill" style="width:${data.total > 0 ? Math.round(d.count / data.total * 100) : 0}%"></div>
              </div>
              <span>${d.count}</span>
            </div>
          `).join('')}
        </div>
      `;

      listEl.innerHTML = data.reviews.map(r => `
        <div class="review-card">
          <div class="review-card-header">
            <span class="review-author">${r.reviewer_name.replace(/</g, '&lt;')}</span>
            <span class="review-date">${new Date(r.created_at).toLocaleDateString('en-IE', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>
          <div class="review-stars">${[...Array(5)].map((_,i)=>i<r.rating?'<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"#43BDAB\" stroke=\"#43BDAB\" stroke-width=\"1.5\"><polygon points=\"12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9\"/></svg>':'<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#43BDAB\" stroke-width=\"1.5\"><polygon points=\"12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9\"/></svg>').join('')}</div>
          ${r.comment ? `<p class="review-comment">${r.comment.replace(/</g, '&lt;')}</p>` : ''}
        </div>
      `).join('');

    } catch (err) {
      console.warn('Could not load reviews:', err);
    }
  }

  // Submit review
  const reviewSubmitBtn = document.getElementById('reviewSubmitBtn');
  if (reviewSubmitBtn) {
    reviewSubmitBtn.addEventListener('click', async () => {
      const reviewerName = document.getElementById('reviewName').value.trim();
      const comment = document.getElementById('reviewComment').value.trim();

      // Validação de tamanho e caracteres
      if (!selectedRating) {
        alert('Please select a star rating.');
        return;
      }
      if (!reviewerName) {
        alert('Please enter your name.');
        return;
      }
      if (reviewerName.length > 32) {
        alert('Name too long (max 32 chars).');
        return;
      }
      if (!/^[\w\s\-'.À-ÿ]+$/i.test(reviewerName)) {
        alert('Name contains invalid characters.');
        return;
      }
      if (comment.length > 400) {
        alert('Comment too long (max 400 chars).');
        return;
      }

      reviewSubmitBtn.disabled = true;
      reviewSubmitBtn.textContent = 'Submitting...';
      reviewSubmitBtn.classList.add('loading');

      try {
        const res = await fetch(`${REVIEWS_API}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: productId,
            reviewer_name: reviewerName,
            rating: selectedRating,
            comment: comment || null
          })
        });
        const result = await res.json().catch(() => ({}));

        if (res.ok && result.success !== false) {
          document.getElementById('reviewsFormWrap').innerHTML = `
            <div class="review-card" style="border-top:1px solid #f0f0f0;opacity:0.6;">
              <div class="review-card-header">
                <span class="review-author">${reviewerName.replace(/</g,'&lt;')}</span>
                <span class="review-date">Just now</span>
              </div>
              <div class="review-stars">${[...Array(5)].map((_,i)=>i<selectedRating?'<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"#43BDAB\" stroke=\"#43BDAB\" stroke-width=\"1.5\"><polygon points=\"12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9\"/></svg>':'<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#43BDAB\" stroke-width=\"1.5\"><polygon points=\"12,2 15,9 22,9.5 17,15 18.5,22 12,18.5 5.5,22 7,15 2,9.5 9,9\"/></svg>').join('')}</div>
              ${comment ? `<p class=\"review-comment\">${comment.replace(/</g,'&lt;')}</p>` : ''}
              <p class=\"review-note\" style=\"margin-top:12px;display:flex;align-items:center;gap:6px;\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#43BDAB\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/></svg> Your review will appear after a quick check — usually within 24h.</p>
            </div>
          `;
          setTimeout(loadReviews, 1200);
        } else {
          let msg = result && result.message ? result.message : 'Failed to submit review.';
          alert(msg);
          reviewSubmitBtn.disabled = false;
          reviewSubmitBtn.textContent = 'Submit Review';
        }
      } catch (err) {
        reviewSubmitBtn.disabled = false;
        reviewSubmitBtn.textContent = 'Submit Review';
        alert('Failed to submit review. Please try again.');
      } finally {
        reviewSubmitBtn.classList.remove('loading');
      }
    });
  }

  loadReviews();
  // Atualização automática dos reviews a cada 10 segundos
  setInterval(() => {
    loadReviews();
  }, 10000);

})();

function openNotifyMeModal() {
  const backdrop = document.getElementById('notifyMeBackdrop');
  const emailInput = document.getElementById('notifyMeEmail');
  const errorEl = document.getElementById('notifyMeError');
  const btn = document.getElementById('notifyMeSubmitBtn');
  if (!backdrop) return;
  if (emailInput) emailInput.value = '';
  if (errorEl) errorEl.textContent = '';
  if (btn) { btn.textContent = 'Notify Me'; btn.disabled = false; }
  backdrop.style.display = 'flex';
  requestAnimationFrame(() => backdrop.classList.add('show'));
  setTimeout(() => { if (emailInput) emailInput.focus(); }, 100);
}

function closeNotifyMeModal() {
  const backdrop = document.getElementById('notifyMeBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('show');
  setTimeout(() => { backdrop.style.display = 'none'; }, 300);
}

async function submitNotifyMe() {
  const emailInput = document.getElementById('notifyMeEmail');
  const errorEl = document.getElementById('notifyMeError');
  const btn = document.getElementById('notifyMeSubmitBtn');
  const email = emailInput?.value?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errorEl) errorEl.textContent = 'Please enter a valid email address.';
    return;
  }

  const productId = new URLSearchParams(window.location.search).get('id') || 'unknown';
  const productName = document.getElementById('product-name')?.textContent?.trim() || '';

  if (btn) { btn.textContent = 'Submitting...'; btn.disabled = true; }
  if (errorEl) errorEl.textContent = '';

  try {
    const res = await fetch('https://ei-internal-production.up.railway.app/api/waitlist/notify-me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, product_name: productName, email })
    });

    if (res.ok) {
      closeNotifyMeModal();
      window.toast.success("You're on the list! We'll notify you when it's back in stock.");
    } else {
      const data = await res.json().catch(() => ({}));
      if (errorEl) errorEl.textContent = data.error || 'Something went wrong. Please try again.';
      if (btn) { btn.textContent = 'Notify Me'; btn.disabled = false; }
    }
  } catch {
    if (errorEl) errorEl.textContent = 'Connection error. Please try again.';
    if (btn) { btn.textContent = 'Notify Me'; btn.disabled = false; }
  }
}

window.openNotifyMeModal = openNotifyMeModal;
window.closeNotifyMeModal = closeNotifyMeModal;
window.submitNotifyMe = submitNotifyMe;
