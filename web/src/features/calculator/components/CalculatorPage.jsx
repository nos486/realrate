import React from 'react';
import { Calculator, Sparkles, RefreshCw, Zap } from 'lucide-react';
import Card from '../../../components/ui/Card.jsx';
import { useCalculator } from '../hooks/useCalculator.js';
import PriceConverterCard from './PriceConverterCard.jsx';
import CustomBubbleCard from './CustomBubbleCard.jsx';
import BudgetReverseCard from './BudgetReverseCard.jsx';
import GoldWeightConverterCard from './GoldWeightConverterCard.jsx';
import { formatNum } from '../../../utils/formatters.js';

export default function CalculatorPage() {
  const calc = useCalculator();

  return (
    <div className="calculator-page-container">
      {/* Hero Header Banner */}
      <Card className="sources-page-hero-banner calc-hero-banner" padding="hero">
        <div className="hero-content-row">
          <div className="hero-title-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="hero-icon-badge calc-badge">
                <Calculator size={24} style={{ color: '#38bdf8' }} />
              </div>
              <div>
                <h1 className="hero-page-title">
                  ماشین‌حساب، مبدل و ارزیابی هوشمند بازار
                </h1>
                <p className="hero-page-desc">
                  تبدیل زنده دارایی‌ها، محاسبه حباب معاملات، برآورد قدرت خرید بر اساس بودجه و مبدل واحدهای طلا
                </p>
              </div>
            </div>
          </div>

          <div className="hero-actions-group">
            <div className="calc-hero-live-rates">
              <span className="live-rate-pill">
                دلار: <strong>{calc.usdToman > 0 ? formatNum(calc.usdToman) : '—'}</strong> تومان
              </span>
              <span className="live-rate-pill">
                انس جهانی: <strong>{calc.goldUsd > 0 ? `${calc.goldUsd}$` : '—'}</strong>
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div style={{ height: '24px' }} />

      {/* Grid Row 1: Price Converter & Custom Bubble */}
      <div className="calculator-grid-2col">
        <PriceConverterCard
          selectableAssets={calc.selectableAssets}
          fromAssetId={calc.fromAssetId}
          setFromAssetId={calc.setFromAssetId}
          toAssetId={calc.toAssetId}
          setToAssetId={calc.setToAssetId}
          fromAmount={calc.fromAmount}
          setFromAmount={calc.setFromAmount}
          swapAssets={calc.swapAssets}
          convertedResult={calc.convertedResult}
        />

        <CustomBubbleCard
          bubbleEligibleAssets={calc.bubbleEligibleAssets}
          bubbleAssetId={calc.bubbleAssetId}
          setBubbleAssetId={calc.setBubbleAssetId}
          tradedPriceInput={calc.tradedPriceInput}
          setTradedPriceInput={calc.setTradedPriceInput}
          customBubbleResult={calc.customBubbleResult}
          usdToman={calc.usdToman}
          goldUsd={calc.goldUsd}
        />
      </div>

      <div style={{ height: '24px' }} />

      {/* Grid Row 2: Reverse Budget Calculator */}
      <BudgetReverseCard
        budgetInput={calc.budgetInput}
        setBudgetInput={calc.setBudgetInput}
        budgetResults={calc.budgetResults}
      />

      <div style={{ height: '24px' }} />

      {/* Grid Row 3: Gold Weight Converter */}
      <GoldWeightConverterCard
        weightInput={calc.weightInput}
        setWeightInput={calc.setWeightInput}
        fromWeightUnit={calc.fromWeightUnit}
        setFromWeightUnit={calc.setFromWeightUnit}
        toWeightUnit={calc.toWeightUnit}
        setToWeightUnit={calc.setToWeightUnit}
        karat={calc.karat}
        setKarat={calc.setKarat}
        weightResult={calc.weightResult}
      />
    </div>
  );
}
