/**
 * calculationEngine.js — Pure client-side calculation engine for transactions
 *
 * Zero React dependencies — purely functional and 100% testable in any JS runtime.
 * Implements Weighted Average Cost (WAC) and real-time PnL computation.
 */

/**
 * Aggregate an array of decrypted transactions into net holdings with Weighted Average Cost.
 *
 * @param {Array} transactions - Array of decrypted transaction objects
 * @param {object} [livePriceMap={}] - Mapping of asset IDs to current market prices
 * @returns {{ computedHoldings: Array, warnings: Array, summary: object }}
 */
export function calculateComputedHoldings(transactions = [], livePriceMap = {}) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      computedHoldings: [],
      warnings: [],
      summary: {
        totalCost: 0,
        totalRealValue: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        hasAnyCost: false,
        count: 0,
      },
    };
  }

  // 1. Group transactions by asset identifier (assetId / symbol)
  const groups = new Map();

  for (const tx of transactions) {
    if (!tx) continue;
    const payload = tx.payload || tx.decryptedPayload || tx;
    const assetId = String(payload.assetId || payload.symbol || payload.id || '').trim();
    if (!assetId) continue;

    if (!groups.has(assetId)) {
      groups.set(assetId, {
        assetId,
        assetName: payload.assetName || payload.name || assetId,
        assetType: payload.assetType || payload.category || 'custom',
        unit: payload.unit || payload.currency || 'واحد',
        transactions: [],
      });
    }

    const group = groups.get(assetId);
    if (payload.assetName && payload.assetName !== assetId) group.assetName = payload.assetName;
    if (payload.unit && payload.unit !== 'واحد') group.unit = payload.unit;
    if (payload.assetType && payload.assetType !== 'custom') group.assetType = payload.assetType;

    group.transactions.push({
      ...payload,
      id: tx.id || payload.id,
      createdAt: tx.createdAt || payload.createdAt,
    });
  }

  const computedHoldings = [];
  const warnings = [];

  // 2. Aggregate each asset group
  for (const [assetId, group] of groups.entries()) {
    let totalBuyQty = 0;
    let totalBuyCost = 0;
    let totalSellQty = 0;
    let latestBuyDate = '';
    let latestTxDate = '';

    // Sort chronologically if dates exist
    const sortedTxs = [...group.transactions].sort((a, b) => {
      const dateA = a.transactionDate || a.buyDate || a.date || a.createdAt || '';
      const dateB = b.transactionDate || b.buyDate || b.date || b.createdAt || '';
      return String(dateA).localeCompare(String(dateB));
    });

    for (const t of sortedTxs) {
      const type = String(t.transactionType || t.type || 'buy').toLowerCase();
      const qty = Number(t.quantity !== undefined ? t.quantity : (t.amount || 0));
      const price = Number(t.unitPrice !== undefined ? t.unitPrice : (t.buyPrice || t.price || 0));
      const date = t.transactionDate || t.buyDate || t.date || '';

      if (date && (!latestTxDate || date > latestTxDate)) {
        latestTxDate = date;
      }

      if (type === 'buy') {
        if (qty > 0) {
          totalBuyQty += qty;
          totalBuyCost += qty * price;
          if (date && (!latestBuyDate || date > latestBuyDate)) {
            latestBuyDate = date;
          }
        }
      } else if (type === 'sell') {
        if (qty > 0) {
          totalSellQty += qty;
        }
      }
    }

    const currentQty = totalBuyQty - totalSellQty;

    // Scenario A: Overselling (User error — sells exceed purchases)
    if (currentQty < 0) {
      warnings.push({
        assetId,
        assetName: group.assetName,
        totalBuyQty,
        totalSellQty,
        deficit: Math.abs(currentQty),
        unit: group.unit,
        message: `موجودی دارایی «${group.assetName}» منفی است (${Math.abs(currentQty).toLocaleString('fa-IR')} ${group.unit} فروش مازاد بر خرید). لطفاً تراکنش‌ها را بازبینی فرمایید.`,
      });
      // Do NOT include negative-balance assets in computed holdings list
      continue;
    }

    // Scenario B: Completely sold (zero balance)
    if (currentQty === 0) {
      // Omit from computed holdings list silently
      continue;
    }

    // Scenario C: Positive balance -> Calculate Weighted Average Cost
    // WAC = Total Buy Cost / Total Buy Quantity
    const weightedAveragePrice = totalBuyQty > 0 ? (totalBuyCost / totalBuyQty) : 0;

    // Resolve current market price
    const cleanAssetId = assetId.replace(/^src_def_/, '').replace(/^derived_/, '');
    const unitRealPrice =
      Number(livePriceMap[cleanAssetId]) ||
      Number(livePriceMap[assetId]) ||
      Number(livePriceMap[`bourse_${cleanAssetId}`]) ||
      (weightedAveragePrice > 0 ? weightedAveragePrice : 0);

    const hasBuyPrice = weightedAveragePrice > 0;
    const itemCost = hasBuyPrice ? currentQty * weightedAveragePrice : 0;
    const itemRealVal = currentQty * unitRealPrice;
    const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
    const itemPnlPct =
      hasBuyPrice && itemCost > 0
        ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1))
        : null;

    computedHoldings.push({
      id: `computed_${assetId}`,
      portfolioId: group.transactions[0]?.portfolioId || '',
      assetId,
      assetName: group.assetName,
      assetType: group.assetType,
      category: group.assetType,
      unit: group.unit,
      amount: currentQty,
      buyPrice: Math.round(weightedAveragePrice),
      currentPrice: unitRealPrice,
      unitRealPrice,
      itemCost,
      itemRealVal,
      itemPnl,
      itemPnlPct,
      hasBuyPrice,
      buyDate: latestBuyDate || latestTxDate || '',
      notes: `محاسبه خودکار از ${group.transactions.length.toLocaleString('fa-IR')} تراکنش`,
      source: 'transactions',
      isComputed: true,
      txCount: group.transactions.length,
    });
  }

  // 3. Overall metrics
  const costedItems = computedHoldings.filter((it) => it.hasBuyPrice);
  const totalCost = costedItems.reduce((acc, it) => acc + it.itemCost, 0);
  const totalRealValue = computedHoldings.reduce((acc, it) => acc + it.itemRealVal, 0);
  const hasAnyCost = costedItems.length > 0 && totalCost > 0;
  const totalPnl = costedItems.reduce((sum, it) => sum + (it.itemPnl || 0), 0);
  const totalPnlPct = hasAnyCost ? parseFloat(((totalPnl / totalCost) * 100).toFixed(1)) : 0;

  return {
    computedHoldings,
    warnings,
    summary: {
      totalCost,
      totalRealValue,
      totalPnl,
      totalPnlPct,
      hasAnyCost,
      count: computedHoldings.length,
    },
  };
}
