/**
 * useCalculator.js — React Hook for Calculator & Converter Feature
 * Feature: features/calculator
 * Connects directly to PricingContext for real-time live market rates.
 */

import { useState, useMemo, useCallback } from 'react';
import { usePricing } from '../../market/index.js';
import {
  convertAssetQuantity,
  calculateCustomAssetBubble,
  calculateBudgetPurchases,
  calculateGoldWeightValue,
  convertWeight,
} from '../utils/calculatorMath.js';
import { GOLD_SPECS, COIN_SPECS } from '../../../utils/financialSpecs.js';

export function useCalculator() {
  const {
    resolvedAssets = [],
    usdToman = 0,
    goldUsd = 0,
    silverUsd = 0,
    loading = false,
  } = usePricing() || {};

  const numUsdToman = typeof usdToman === 'string' ? parseFloat(usdToman.replace(/,/g, '')) || 0 : Number(usdToman || 0);
  const numGoldUsd = typeof goldUsd === 'string' ? parseFloat(goldUsd.replace(/,/g, '')) || 0 : Number(goldUsd || 0);
  const numSilverUsd = typeof silverUsd === 'string' ? parseFloat(silverUsd.replace(/,/g, '')) || 0 : Number(silverUsd || 0);

  // ── 1. Catalog of eligible assets for selector ──────────────────────────────
  const selectableAssets = useMemo(() => {
    if (!resolvedAssets || resolvedAssets.length === 0) return [];

    return resolvedAssets.map((asset) => {
      const price = Number(asset.price || asset.marketPrice || 0);
      const hasPrice = price > 0;
      return {
        id: asset.id,
        name: asset.name,
        symbol: asset.symbol || asset.code || '',
        category: asset.category || 'other',
        unit: asset.unit || 'واحد',
        price,
        hasPrice,
        intrinsicPrice: asset.intrinsicPrice || price,
        bubble: asset.bubble || 0,
        bubblePct: asset.bubblePct || 0,
        spec: asset.spec || asset.goldSpec || COIN_SPECS[asset.id] || GOLD_SPECS[asset.id] || null,
        gold24kWeight: asset.gold24kWeight || asset.weight || 0,
      };
    });
  }, [resolvedAssets]);

  // Map for fast asset lookup by ID
  const assetMap = useMemo(() => {
    const map = {};
    selectableAssets.forEach((a) => {
      map[a.id] = a;
      map[a.id.toLowerCase()] = a;
    });
    return map;
  }, [selectableAssets]);

  // ── 2. State for Section 1: Price Converter ─────────────────────────────────
  const [fromAssetId, setFromAssetId] = useState('full_coin');
  const [toAssetId, setToAssetId] = useState('gold_18k');
  const [fromAmount, setFromAmount] = useState('1');

  const fromAsset = assetMap[fromAssetId] || selectableAssets[0] || null;
  const toAsset = assetMap[toAssetId] || selectableAssets[1] || null;

  const swapAssets = useCallback(() => {
    setFromAssetId(toAssetId);
    setToAssetId(fromAssetId);
  }, [fromAssetId, toAssetId]);

  const convertedResult = useMemo(() => {
    const cleanAmount = typeof fromAmount === 'string'
      ? parseFloat(fromAmount.replace(/,/g, '')) || 0
      : Number(fromAmount || 0);

    const fromPrice = fromAsset?.price || 0;
    const toPrice = toAsset?.price || 0;

    const res = convertAssetQuantity(cleanAmount, fromPrice, toPrice);

    return {
      ...res,
      fromAsset,
      toAsset,
      fromAmount: cleanAmount,
      hasRates: fromPrice > 0 && toPrice > 0,
    };
  }, [fromAmount, fromAsset, toAsset]);

  // ── 3. State for Section 2: Custom Bubble Calculator ───────────────────────
  const bubbleEligibleAssets = useMemo(() => {
    return selectableAssets.filter(
      (a) => a.category === 'gold' || a.category === 'coins' || a.category === 'silver' || a.id.includes('coin') || a.id.includes('gold')
    );
  }, [selectableAssets]);

  const [bubbleAssetId, setBubbleAssetId] = useState('full_coin');
  const [tradedPriceInput, setTradedPriceInput] = useState('');

  const selectedBubbleAsset = assetMap[bubbleAssetId] || bubbleEligibleAssets[0] || null;

  const customBubbleResult = useMemo(() => {
    const cleanPrice = typeof tradedPriceInput === 'string'
      ? parseFloat(tradedPriceInput.replace(/,/g, '')) || 0
      : Number(tradedPriceInput || 0);

    const spec = selectedBubbleAsset?.spec || COIN_SPECS[bubbleAssetId] || GOLD_SPECS[bubbleAssetId];
    const marketBubblePct = selectedBubbleAsset?.bubblePct || 0;

    const res = calculateCustomAssetBubble({
      tradedPrice: cleanPrice,
      spec,
      goldUsd: numGoldUsd,
      usdToman: numUsdToman,
      marketBubblePct,
    });

    return {
      ...res,
      selectedAsset: selectedBubbleAsset,
      marketPrice: selectedBubbleAsset?.price || 0,
      marketBubblePct,
    };
  }, [tradedPriceInput, selectedBubbleAsset, bubbleAssetId, numGoldUsd, numUsdToman]);

  // ── 4. State for Section 3: Reverse Budget Calculator ──────────────────────
  const [budgetInput, setBudgetInput] = useState('100,000,000');

  const popularBudgetAssets = useMemo(() => {
    const desiredKeys = [
      'gold_18k',
      'gold_24k',
      'mesghal',
      'full_coin',
      'half_coin',
      'quarter_coin',
      'gerami_coin',
      'usd',
      'usdt',
      'eur',
    ];
    return desiredKeys
      .map((k) => assetMap[k])
      .filter(Boolean);
  }, [assetMap]);

  const budgetResults = useMemo(() => {
    const cleanBudget = typeof budgetInput === 'string'
      ? parseFloat(budgetInput.replace(/,/g, '')) || 0
      : Number(budgetInput || 0);

    return calculateBudgetPurchases(cleanBudget, popularBudgetAssets);
  }, [budgetInput, popularBudgetAssets]);

  // ── 5. State for Section 4: Gold Weight Converter ──────────────────────────
  const [weightInput, setWeightInput] = useState('1');
  const [fromWeightUnit, setFromWeightUnit] = useState('mesghal');
  const [toWeightUnit, setToWeightUnit] = useState('gram');
  const [karat, setKarat] = useState('18k'); // '18k' | '24k' | 'mesghal_17k'

  const gold18kPrice = assetMap['gold_18k']?.price || 0;
  const gold24kPrice = assetMap['gold_24k']?.price || (gold18kPrice * (999.9 / 750));
  const mesghalPrice = assetMap['mesghal']?.price || (gold18kPrice * 4.608 * (705 / 750));

  const weightResult = useMemo(() => {
    const cleanWeight = typeof weightInput === 'string'
      ? parseFloat(weightInput.replace(/,/g, '')) || 0
      : Number(weightInput || 0);

    const valResult = calculateGoldWeightValue({
      weight: cleanWeight,
      unit: fromWeightUnit,
      karat,
      gold18kGramPrice: gold18kPrice,
      gold24kGramPrice: gold24kPrice,
      mesghalPrice,
    });

    const convertedTargetWeight = convertWeight(cleanWeight, fromWeightUnit, toWeightUnit);

    return {
      ...valResult,
      cleanWeight,
      convertedTargetWeight,
      fromWeightUnit,
      toWeightUnit,
      karat,
    };
  }, [weightInput, fromWeightUnit, toWeightUnit, karat, gold18kPrice, gold24kPrice, mesghalPrice]);

  return {
    loading,
    usdToman: numUsdToman,
    goldUsd: numGoldUsd,
    silverUsd: numSilverUsd,
    selectableAssets,
    // Section 1
    fromAssetId,
    setFromAssetId,
    toAssetId,
    setToAssetId,
    fromAmount,
    setFromAmount,
    swapAssets,
    convertedResult,
    // Section 2
    bubbleEligibleAssets,
    bubbleAssetId,
    setBubbleAssetId,
    tradedPriceInput,
    setTradedPriceInput,
    customBubbleResult,
    // Section 3
    budgetInput,
    setBudgetInput,
    budgetResults,
    // Section 4
    weightInput,
    setWeightInput,
    fromWeightUnit,
    setFromWeightUnit,
    toWeightUnit,
    setToWeightUnit,
    karat,
    setKarat,
    weightResult,
  };
}
