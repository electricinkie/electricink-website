#!/bin/bash

echo "=== VALIDAÇÃO FINAL - PRODUCT NORMALIZATION ==="
echo ""

FILES=(
  "data/product-accessories.json"
  "data/product-tattoo-machines.json"
  "data/products-cosmetics.json"
  "data/products-artistic-inks.json"
  "data/products-power-supplies.json"
  "data/products-needles-022.json"
  "data/products-needles-025.json"
  "data/products-needles-030.json"
)

for file in "${FILES[@]}"; do
  echo "📄 Checking: $file"
  
  # JSON válido?
  if jq empty "$file" 2>/dev/null; then
    echo "  ✅ Valid JSON"
  else
    echo "  ❌ INVALID JSON - STOP AND FIX"
    exit 1
  fi
  
  # Todos produtos têm inventory?
  missing_inventory=$(jq '[.[] | select(.inventory == null)] | length' "$file")
  if [ "$missing_inventory" -eq 0 ]; then
    echo "  ✅ All products have inventory"
  else
    echo "  ❌ $missing_inventory products missing inventory"
  fi
  
  # Todos produtos têm seo?
  missing_seo=$(jq '[.[] | select(.seo == null)] | length' "$file")
  if [ "$missing_seo" -eq 0 ]; then
    echo "  ✅ All products have SEO"
  else
    echo "  ❌ $missing_seo products missing SEO"
  fi
  
  # Total de produtos
  total=$(jq 'length' "$file")
  echo "  📊 Total products: $total"
  echo ""
done

# Verificar category-messages.json
if [ -f "data/category-messages.json" ]; then
  echo "✅ category-messages.json exists"
  jq empty data/category-messages.json && echo "✅ Valid JSON" || echo "❌ Invalid JSON"
else
  echo "❌ category-messages.json NOT FOUND"
fi

echo ""
echo "=== VALIDAÇÃO COMPLETA ==="
