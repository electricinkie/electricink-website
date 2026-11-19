/*
 * Black Cat Friday campaign: pure calculation, no dependencies.
 * UMD: module.exports in Node, window.EI_CAMPAIGN in the browser.
 * The config is passed in by the caller (this file never reads the JSON).
 * All money is integer cents, VAT included.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else if (root) {
    root.EI_CAMPAIGN = api;
  }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isInt(v) { return typeof v === 'number' && Number.isInteger(v); }
  function isNonNegInt(v) { return isInt(v) && v >= 0; }
  function isNonEmptyStr(v) { return typeof v === 'string' && v.length > 0; }
  function isPercent(v) { return isInt(v) && v >= 0 && v <= 100; }
  function parseDate(v) {
    if (typeof v !== 'string') return NaN;
    return new Date(v).getTime();
  }
  function key(productId, variantId) { return productId + '\u0000' + variantId; }

  function validateConfig(config) {
    var errors = [];
    try {
      if (!isObj(config)) return { ok: false, errors: ['config must be an object'] };
      if (typeof config.enabled !== 'boolean') errors.push('enabled must be boolean');
      if (!isNonEmptyStr(config.label)) errors.push('label required');
      var s = parseDate(config.startsAt);
      var e = parseDate(config.endsAt);
      if (isNaN(s)) errors.push('startsAt invalid');
      if (isNaN(e)) errors.push('endsAt invalid');
      if (!isNaN(s) && !isNaN(e) && s > e) errors.push('startsAt after endsAt');

      if (!isObj(config.vault)) {
        errors.push('vault required');
      } else {
        if (!isPercent(config.vault.discountPercent)) errors.push('vault.discountPercent must be integer 0-100');
        if (!Array.isArray(config.vault.items)) {
          errors.push('vault.items must be an array');
        } else {
          config.vault.items.forEach(function (it, i) {
            if (!isObj(it) || !isNonEmptyStr(it.productId) || !isNonEmptyStr(it.variantId)) {
              errors.push('vault.items[' + i + '] needs productId and variantId');
            } else if (!isInt(it.capPerOrder) || it.capPerOrder < 1) {
              errors.push('vault.items[' + i + '].capPerOrder must be integer >= 1');
            }
          });
        }
      }

      if (!Array.isArray(config.fixedVariants)) {
        errors.push('fixedVariants must be an array');
      } else {
        config.fixedVariants.forEach(function (it, i) {
          if (!isObj(it) || !isNonEmptyStr(it.productId) || !isNonEmptyStr(it.variantId)) {
            errors.push('fixedVariants[' + i + '] needs productId and variantId');
          }
        });
      }

      if (config.bundles !== undefined) {
        if (!Array.isArray(config.bundles)) {
          errors.push('bundles must be an array');
        } else {
          var vaultKeys = {};
          if (isObj(config.vault) && Array.isArray(config.vault.items)) {
            config.vault.items.forEach(function (it) {
              if (isObj(it)) vaultKeys[key(it.productId, it.variantId)] = true;
            });
          }
          config.bundles.forEach(function (b, i) {
            var p = 'bundles[' + i + ']';
            if (!isObj(b)) { errors.push(p + ' must be an object'); return; }
            if (!isNonEmptyStr(b.id)) errors.push(p + '.id required');
            if (!isNonEmptyStr(b.productId)) errors.push(p + '.productId required');
            if (!Array.isArray(b.variantIds) || b.variantIds.length === 0 || !b.variantIds.every(isNonEmptyStr)) {
              errors.push(p + '.variantIds must be a non-empty array of strings');
            } else if (isNonEmptyStr(b.productId)) {
              b.variantIds.forEach(function (v) {
                if (Object.prototype.hasOwnProperty.call(vaultKeys, key(b.productId, v))) {
                  errors.push(p + ' pair ' + b.productId + '/' + v + ' is also in vault.items');
                }
              });
            }
            if (!isInt(b.priceCents) || b.priceCents <= 0) errors.push(p + '.priceCents must be integer > 0');
            if (!isInt(b.capPerOrder) || b.capPerOrder < 1) errors.push(p + '.capPerOrder must be integer >= 1');
          });
        }
      }

      if (!isObj(config.boost)) {
        errors.push('boost required');
      } else {
        if (!isNonNegInt(config.boost.minLineCents)) errors.push('boost.minLineCents must be integer >= 0');
        if (!isPercent(config.boost.discountPercent)) errors.push('boost.discountPercent must be integer 0-100');
        if (!isNonNegInt(config.boost.maxUnitsPerOrder)) errors.push('boost.maxUnitsPerOrder must be integer >= 0');
      }
    } catch (err) {
      errors.push('exception');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function isActive(config, nowMs) {
    try {
      if (!isObj(config) || config.enabled !== true) return false;
      if (typeof nowMs !== 'number' || !isFinite(nowMs)) return false;
      var s = parseDate(config.startsAt);
      var e = parseDate(config.endsAt);
      if (isNaN(s) || isNaN(e)) return false;
      return s <= nowMs && nowMs <= e;
    } catch (err) {
      return false;
    }
  }

  function validLine(l) {
    if (!isObj(l)) return false;
    if (!isNonEmptyStr(l.productId) || !isNonEmptyStr(l.variantId)) return false;
    if (!isInt(l.qty) || l.qty <= 0) return false;
    if (!isNonNegInt(l.listCents) || !isNonNegInt(l.paidCents)) return false;
    if (typeof l.promoActive !== 'boolean') return false;
    if (!(l.stock === null || l.stock === undefined || isNonNegInt(l.stock))) return false;
    return true;
  }

  function fail(error) {
    return {
      ok: false, active: false, label: null, extraCents: 0, boostUnlocked: false,
      boostedUnits: 0, perLine: [], violations: [], error: error,
      bundleSets: 0, bundleExtraCents: 0, perBundle: []
    };
  }

  // Bundles: a complete set needs a line for every variantId of the bundle's
  // productId. Quantities are summed per variant; the unit paid price of a
  // variant with several lines is the lowest of them (never overstates the extra).
  function computeBundles(config, lines, violations) {
    var out = { sets: 0, extraCents: 0, perBundle: [] };
    var bundles = Array.isArray(config.bundles) ? config.bundles : [];
    bundles.forEach(function (b) {
      var qty = {}, unitPaid = {}, paidTotal = 0;
      lines.forEach(function (l) {
        if (l.productId !== b.productId || b.variantIds.indexOf(l.variantId) === -1) return;
        qty[l.variantId] = (qty[l.variantId] || 0) + l.qty;
        unitPaid[l.variantId] = Object.prototype.hasOwnProperty.call(unitPaid, l.variantId)
          ? Math.min(unitPaid[l.variantId], l.paidCents) : l.paidCents;
        paidTotal += l.paidCents * l.qty;
      });
      var minQty = Infinity, setPaid = 0;
      for (var i = 0; i < b.variantIds.length; i++) {
        var v = b.variantIds[i];
        if (!qty[v]) { minQty = 0; break; }
        minQty = Math.min(minQty, qty[v]);
        setPaid += unitPaid[v];
      }
      if (minQty === Infinity) minQty = 0;
      var sets = Math.min(minQty, b.capPerOrder);
      if (minQty > b.capPerOrder) {
        violations.push({ code: 'BUNDLE_CAP_EXCEEDED', productId: b.productId, variantId: null, allowed: b.capPerOrder, requested: minQty });
      }
      var extra = sets > 0 ? Math.min(sets * Math.max(0, setPaid - b.priceCents), paidTotal) : 0;
      extra = Math.max(0, extra);
      out.sets += sets;
      out.extraCents += extra;
      out.perBundle.push({ id: b.id, sets: sets, extraCents: extra });
    });
    return out;
  }

  function compute(input) {
    try {
      if (!isObj(input)) return fail('INVALID_INPUT');
      var config = input.config;
      var nowMs = input.nowMs;
      var lines = input.lines;
      if (!Array.isArray(lines)) return fail('INVALID_INPUT');
      if (typeof nowMs !== 'number' || !isFinite(nowMs)) return fail('INVALID_INPUT');
      if (!validateConfig(config).ok) return fail('INVALID_INPUT');
      for (var i = 0; i < lines.length; i++) {
        if (!validLine(lines[i])) return fail('INVALID_INPUT');
      }

      var perLine = lines.map(function (l) {
        return { productId: l.productId, variantId: l.variantId, boostedQty: 0, extraCents: 0 };
      });
      var base = {
        ok: true, active: false, label: config.label, extraCents: 0, boostUnlocked: false,
        boostedUnits: 0, perLine: perLine, violations: [], error: null,
        bundleSets: 0, bundleExtraCents: 0, perBundle: []
      };
      if (!isActive(config, nowMs)) return base;
      base.active = true;

      var bundleResult = computeBundles(config, lines, base.violations);
      base.bundleSets = bundleResult.sets;
      base.bundleExtraCents = bundleResult.extraCents;
      base.perBundle = bundleResult.perBundle;
      base.extraCents = bundleResult.extraCents;

      var vaultCaps = {};
      config.vault.items.forEach(function (it) { vaultCaps[key(it.productId, it.variantId)] = it.capPerOrder; });
      var fixed = {};
      config.fixedVariants.forEach(function (it) { fixed[key(it.productId, it.variantId)] = true; });

      var units = []; // { lineIdx, order, extraPerUnit, paidCents }
      var vaultPaidTotal = 0;
      var order = 0;
      var boostUnlocked = false;

      lines.forEach(function (l, idx) {
        var k = key(l.productId, l.variantId);
        var isVault = Object.prototype.hasOwnProperty.call(vaultCaps, k) && l.promoActive === true;
        if (isVault) {
          var cap = vaultCaps[k];
          var effQty = Math.min(l.qty, cap);
          if (l.qty > cap) {
            base.violations.push({ code: 'CAP_EXCEEDED', productId: l.productId, variantId: l.variantId, allowed: cap, requested: l.qty });
          }
          if (isNonNegInt(l.stock)) {
            if (l.qty > l.stock) {
              base.violations.push({ code: 'STOCK_EXCEEDED', productId: l.productId, variantId: l.variantId, allowed: l.stock, requested: l.qty });
            }
            effQty = Math.min(effQty, l.stock);
          }
          var boostPrice = Math.round(l.listCents * (100 - config.boost.discountPercent) / 100);
          var extraPerUnit = Math.max(0, l.paidCents - boostPrice);
          vaultPaidTotal += l.paidCents * effQty;
          for (var u = 0; u < effQty; u++) {
            units.push({ lineIdx: idx, order: order++, extraPerUnit: extraPerUnit });
          }
        } else if (!Object.prototype.hasOwnProperty.call(fixed, k)) {
          if (l.paidCents * l.qty >= config.boost.minLineCents) boostUnlocked = true;
        }
      });

      base.boostUnlocked = boostUnlocked;
      if (!boostUnlocked) return base;

      units.sort(function (a, b) {
        if (b.extraPerUnit !== a.extraPerUnit) return b.extraPerUnit - a.extraPerUnit;
        return a.order - b.order;
      });

      var maxUnits = config.boost.maxUnitsPerOrder;
      var total = 0;
      var boosted = 0;
      for (var j = 0; j < units.length && boosted < maxUnits; j++) {
        var unit = units[j];
        if (unit.extraPerUnit <= 0) break;
        var add = Math.min(unit.extraPerUnit, vaultPaidTotal - total);
        if (add <= 0) break;
        total += add;
        boosted++;
        perLine[unit.lineIdx].boostedQty += 1;
        perLine[unit.lineIdx].extraCents += add;
      }

      base.extraCents = Math.max(0, total) + base.bundleExtraCents;
      base.boostedUnits = boosted;
      return base;
    } catch (err) {
      return fail('EXCEPTION');
    }
  }

  return { isActive: isActive, validateConfig: validateConfig, compute: compute };
});
