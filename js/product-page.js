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
    '/data/products-needles-022.json',
    '/data/products-needles-025.json',
    '/data/products-needles-030.json'
  ];

  try {
    const responses = await Promise.all(productFiles.map(p => fetch(p).catch(e => ({ ok: false }))));
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

    productData = allProducts[productId];

    if (!productData) {
      alert('Product not found');
      window.location.href = '/';
      return;
    }
  } catch (error) {
    console.error('Error loading product:', error);
    alert('Error loading product. Please try again.');
    return;
  }

  // EXTRACT values with fallbacks (supports old and new structure)
  const name = productData.basic?.name || productData.name || 'Unnamed Product';
  const tagline = productData.basic?.tagline || null;
  const shortDesc = productData.basic?.short_description || productData.description || '';
  const fullDesc = productData.content?.full_description || productData.description || shortDesc;
  const category = productData.basic?.category || productData.category || '';
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

  // Category badge
  if (category) {
    const categoryEl = document.getElementById('productCategory');
    categoryEl.textContent = category.toUpperCase();
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

  // RENDER price
  const priceEl = document.getElementById('productPrice');
  if (productData.variants && productData.variants.length > 0) {
    // Has variants - show price range
    priceEl.textContent = productData.price_range?.display || `from €${productData.variants[0].price.toFixed(2)}`;
  } else {
    // Simple product - single price
    const price = productData.basic?.price || productData.price;
    priceEl.textContent = price ? `€${price.toFixed(2)}` : 'Price unavailable';
  }

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

    // Populate options
    productData.variants.forEach((variant, index) => {
      const option = document.createElement('option');
      option.value = variant.id;
      option.textContent = `${variant.label} - €${variant.price.toFixed(2)}`;
      option.dataset.price = variant.price;
      option.dataset.priceId = variant.stripe_price_id;
      option.dataset.image = variant.image || '';
      option.dataset.description = variant.description || '';
      variantSelect.appendChild(option);
    });

    // Update price and image on change
    variantSelect.onchange = function() {
      const selected = this.options[this.selectedIndex];
      priceEl.textContent = `€${selected.dataset.price}`;

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
    };

    // Trigger change event for the first variant to initialize the image
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
    
    materialsSection.innerHTML = `
      <h3>${title}</h3>
      <p>${content}</p>
    `;
    
    document.querySelector('.product-usage')?.after(materialsSection) || 
    document.getElementById('productDescription').after(materialsSection);
  }

  // RENDER warnings (if exists)
  if (productData.content?.warnings) {
    const warningBox = document.createElement('div');
    warningBox.className = 'product-warning';
    warningBox.innerHTML = `
      <div class="warning-icon">⚠️</div>
      <div class="warning-content">
        <strong>Warning</strong>
        <p>${productData.content.warnings}</p>
      </div>
    `;
    
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
    
    if (productData.applications.primary_uses) {
      const usesList = document.createElement('ul');
      productData.applications.primary_uses.forEach(use => {
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
    disclaimerBox.innerHTML = `<p><em>${productData.content.disclaimer}</em></p>`;
    
    document.querySelector('.product-applications')?.after(disclaimerBox) ||
    document.getElementById('productSpecs')?.after(disclaimerBox);
  }

  // ADD TO CART button
  document.getElementById('addToCartBtn').onclick = function() {
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

      console.log('[ADD_TO_CART]', { productId: productId, productName: name, variant: selectedVariant.label, resolvedPriceId });

      itemToAdd = {
        id: `${productId}-${selectedVariant.id}`,
        name: `${name} - ${selectedVariant.label}`,
        price: selectedVariant.price,
        stripe_price_id: resolvedPriceId,
        image: selectedVariant.image || mainImage,
        variant: selectedVariant.label
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

      console.log('[ADD_TO_CART]', { productId: productId, productName: name, variant: null, resolvedPriceId });

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
    
    // Add to cart usando global system
    if (window.cart && window.cart.addItem) {
      if (window.cart.addItem(itemToAdd)) {
        // Success feedback no botão
        const btn = this;
        const originalText = btn.textContent;
        btn.textContent = '✓ Added!';
        btn.style.background = '#43BDAB';
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
        }, 2000);
      } else {
        alert('Failed to add item to cart. Please try again.');
      }
    } else {
      alert('Cart system not available. Please refresh the page.');
    }
  };

  // Breadcrumb - atualiza com informação correta do produto
  const breadcrumbCategory = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Products';
  const categoryLink = document.getElementById('breadcrumb-category-link');
  
  if (categoryLink) {
    categoryLink.textContent = breadcrumbCategory;
    const catParam = category ? encodeURIComponent(category.toString().toLowerCase()) : 'all';
    categoryLink.href = `/category.html?cat=${catParam}`;
  }
  
  const breadcrumbProduct = document.getElementById('breadcrumb-product');
  if (breadcrumbProduct) {
    breadcrumbProduct.textContent = name;
  }

})();
