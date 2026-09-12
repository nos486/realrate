/**
 * formulaEvaluator.js — Safe, dynamic formula evaluator for derived assets
 *
 * Supports:
 * - Direct multiplier: BASE * multiplier
 * - Mathematical expressions: e.g. `(BASE * USD) / 31.1034768`, `BASE * (24 / 18)`
 * - Dependency resolution across multiple derived layers (e.g., silver_925 -> silver_gram -> ons_silver)
 */

/**
 * Safely tokenize and evaluate an arithmetic expression with variable context
 * Allowed tokens: numbers, operators (+, -, *, /), parentheses (), and variable names
 * @param {string} expr - Expression string
 * @param {Record<string, number>} vars - Variable dictionary (case-insensitive)
 * @returns {number}
 */
export function evaluateExpression(expr, vars = {}) {
  if (!expr || typeof expr !== 'string') return 0;

  // Normalize variable names in vars to uppercase
  const normalizedVars = {};
  for (const [k, v] of Object.entries(vars)) {
    if (k) normalizedVars[k.toUpperCase()] = Number(v) || 0;
  }

  // Tokenize
  const rawTokens = expr.match(/([a-zA-Z_][a-zA-Z0-9_]*|\d+(?:\.\d+)?|[+\-*/()])/g);
  if (!rawTokens) return 0;

  // Substitute variables and convert numbers
  const tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (/^[a-zA-Z_]/.test(t)) {
      const upper = t.toUpperCase();
      const val = normalizedVars[upper] !== undefined ? normalizedVars[upper] : 0;
      tokens.push(val);
    } else if (/^\d/.test(t)) {
      tokens.push(parseFloat(t));
    } else {
      tokens.push(t);
    }
  }

  // Recursive descent parser for +, -, *, /, ()
  let cursor = 0;

  function parseExpression() {
    let result = parseTerm();
    while (cursor < tokens.length) {
      const op = tokens[cursor];
      if (op === '+') {
        cursor++;
        result += parseTerm();
      } else if (op === '-') {
        cursor++;
        result -= parseTerm();
      } else {
        break;
      }
    }
    return result;
  }

  function parseTerm() {
    let result = parseFactor();
    while (cursor < tokens.length) {
      const op = tokens[cursor];
      if (op === '*') {
        cursor++;
        result *= parseFactor();
      } else if (op === '/') {
        cursor++;
        const denom = parseFactor();
        result = denom !== 0 ? result / denom : 0;
      } else {
        break;
      }
    }
    return result;
  }

  function parseFactor() {
    if (cursor >= tokens.length) return 0;
    const t = tokens[cursor];

    // Unary minus/plus
    if (t === '-') {
      cursor++;
      return -parseFactor();
    }
    if (t === '+') {
      cursor++;
      return parseFactor();
    }

    // Parentheses
    if (t === '(') {
      cursor++;
      const val = parseExpression();
      if (cursor < tokens.length && tokens[cursor] === ')') {
        cursor++;
      }
      return val;
    }

    // Number literal or resolved variable
    if (typeof t === 'number') {
      cursor++;
      return t;
    }

    cursor++;
    return 0;
  }

  try {
    const finalVal = parseExpression();
    return isFinite(finalVal) && !isNaN(finalVal) ? finalVal : 0;
  } catch (err) {
    console.error('Expression evaluation error:', err, expr);
    return 0;
  }
}

/**
 * Extract numerical price from any price object or number
 */
function extractNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val.price !== undefined) return Number(val.price) || 0;
  const parsed = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Build standard context variables for derived asset calculation
 * @param {Record<string, any>} priceMap - Map of asset prices (e.g., { gold_18k: 4500000, usd: 62000 })
 * @param {number} [basePrice=0] - Explicit BASE price for the target asset
 * @returns {Record<string, number>}
 */
export function buildFormulaContext(priceMap = {}, basePrice = 0) {
  const usdPrice = extractNumber(priceMap.usd || priceMap.usd_toman || priceMap.USD || 0);
  const goldUsd = extractNumber(priceMap.ons_gold || priceMap.gold_usd || priceMap.GOLD_USD || 0);
  const silverUsd = extractNumber(priceMap.ons_silver || priceMap.silver_usd || priceMap.SILVER_USD || 0);

  const ctx = {
    BASE: Number(basePrice) || 0,
    USD: usdPrice,
    USD_TOMAN: usdPrice,
    GOLD_USD: goldUsd,
    SILVER_USD: silverUsd,
    ONS_GOLD: goldUsd,
    ONS_SILVER: silverUsd,
  };

  // Add all other keys from priceMap
  for (const [k, v] of Object.entries(priceMap)) {
    if (k) {
      const num = extractNumber(v);
      ctx[k.toUpperCase()] = num;
      ctx[k] = num;
    }
  }

  return ctx;
}

/**
 * Calculate the price of a single derived asset
 * @param {object} derivedAsset - Derived asset config ({ baseAssetId, formulaType, multiplier, formulaExpression })
 * @param {Record<string, any>} priceMap - Map of known prices
 * @returns {number}
 */
export function calculateDerivedPrice(derivedAsset, priceMap = {}) {
  if (!derivedAsset) return 0;

  const baseKey = derivedAsset.baseAssetId || derivedAsset.base_asset_id;
  const basePrice = extractNumber(priceMap[baseKey] || (baseKey ? priceMap[baseKey.toLowerCase()] : 0));

  const formulaType = derivedAsset.formulaType || derivedAsset.formula_type || 'multiplier';
  const multiplier = derivedAsset.multiplier !== undefined && derivedAsset.multiplier !== null
    ? Number(derivedAsset.multiplier)
    : 1.0;

  if (formulaType === 'expression') {
    const expr = derivedAsset.formulaExpression || derivedAsset.formula_expression;
    if (!expr || !String(expr).trim()) {
      return basePrice * multiplier;
    }
    const ctx = buildFormulaContext(priceMap, basePrice);
    return evaluateExpression(expr, ctx);
  }

  return basePrice * multiplier;
}

/**
 * Compute all derived assets across multiple passes to handle inter-dependencies
 * e.g., silver_925 depends on silver_gram which depends on ons_silver.
 * @param {Array<object>} derivedAssets - Array of derived asset objects
 * @param {Record<string, any>} basePriceMap - Initial raw prices
 * @returns {Record<string, number>} Map of derived asset id -> computed price
 */
export function computeAllDerivedPrices(derivedAssets = [], basePriceMap = {}) {
  const mergedMap = { ...basePriceMap };
  const derivedMap = {};

  if (!Array.isArray(derivedAssets) || derivedAssets.length === 0) {
    return derivedMap;
  }

  // Multi-pass resolution (max 4 passes for chained dependencies)
  const maxPasses = 4;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const asset of derivedAssets) {
      if (!asset.isActive && asset.is_active === 0) continue;
      const id = asset.id;
      const currentVal = derivedMap[id] || 0;
      const computed = calculateDerivedPrice(asset, mergedMap);

      if (computed > 0 && Math.abs(computed - currentVal) > 0.0001) {
        derivedMap[id] = computed;
        mergedMap[id] = computed;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return derivedMap;
}
