import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, AlertTriangle, CheckCircle2, TrendingUp, Sparkles, Scale } from 'lucide-react';

export default function LandingBubbleExplainer() {
  // Interactive Slider State: Dollar Rate in Toman
  const [dollarRate, setDollarRate] = useState(62500);
  // Gold Ounce in USD
  const [ouncePrice, setOuncePrice] = useState(2650);

  // Calculation of Emami Coin Real Value:
  // Weight: 8.133g, Fineness: 900/1000 (21.6 karat). Ounce = 31.1035g
  const { realValue, marketPrice, bubbleAmount, bubblePercent, realPercent } = useMemo(() => {
    const goldPurityWeight = 8.133 * (900 / 999.9); // ~7.32g pure 24k gold
    const rawGoldValue = (ouncePrice * dollarRate / 31.1035) * goldPurityWeight;
    const mintingCost = 100000; // حق ضرب مصوب بانک مرکزی
    const calculatedReal = Math.round(rawGoldValue + mintingCost);

    // Simulated market premium (~14.5% to 16% in Iranian market)
    // We let the market price scale with market sentiment
    const calculatedMarket = Math.round(calculatedReal * 1.155);
    const calculatedBubble = calculatedMarket - calculatedReal;
    const calculatedBubblePct = Math.round((calculatedBubble / calculatedMarket) * 1000) / 10;
    const calculatedRealPct = 100 - calculatedBubblePct;

    return {
      realValue: calculatedReal,
      marketPrice: calculatedMarket,
      bubbleAmount: calculatedBubble,
      bubblePercent: calculatedBubblePct,
      realPercent: calculatedRealPct,
    };
  }, [dollarRate, ouncePrice]);

  return (
    <section className="landing-bubble-section" id="bubble-calculator">
      <div className="landing-container">
        {/* Section Header */}
        <div className="landing-section-header">
          <div className="section-tag-badge">
            <Scale size={14} />
            <span>مفهوم کلیدی ریلریت</span>
          </div>
          <h2 className="section-title">
            «حباب» چیست و چرا نباید طلای بدون تحلیل بخرید؟
          </h2>
          <p className="section-subtitle">
            حباب تفاوت بین <strong>ارزش واقعی طلای خام</strong> و <strong>قیمت هیجانی بازار</strong> است.
            با ابزار تعاملی زیر تغییر نرخ دلار را شبیه‌سازی کنید تا ببینید چند درصد از پولتان بابت طلا و چند درصد بابت حباب پرداخت می‌شود:
          </p>
        </div>

        {/* Interactive Simulator Box */}
        <motion.div
          className="bubble-simulator-card"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="simulator-controls-grid">
            {/* Dollar Slider */}
            <div className="slider-control-group">
              <div className="slider-header">
                <span className="slider-title">نرخ شبیه‌سازی‌شده دلار:</span>
                <strong className="slider-display-val text-gradient-gold">
                  {dollarRate.toLocaleString('fa-IR')} <span className="unit">تومان</span>
                </strong>
              </div>
              <input
                type="range"
                min="50000"
                max="80000"
                step="500"
                value={dollarRate}
                onChange={(e) => setDollarRate(Number(e.target.value))}
                className="landing-range-slider"
                aria-label="اسلایدر نرخ دلار"
              />
              <div className="slider-scale-labels">
                <span>۵۰٬۰۰۰ تومان</span>
                <span>۶۵٬۰۰۰ تومان</span>
                <span>۸۰٬۰۰۰ تومان</span>
              </div>
            </div>

            {/* Ounce Slider */}
            <div className="slider-control-group">
              <div className="slider-header">
                <span className="slider-title">نرخ انس جهانی طلا:</span>
                <strong className="slider-display-val text-gradient-sky">
                  {ouncePrice.toLocaleString('fa-IR')} <span className="unit">دلار</span>
                </strong>
              </div>
              <input
                type="range"
                min="2400"
                max="3000"
                step="25"
                value={ouncePrice}
                onChange={(e) => setOuncePrice(Number(e.target.value))}
                className="landing-range-slider"
                aria-label="اسلایدر انس جهانی"
              />
              <div className="slider-scale-labels">
                <span>۲٬۴۰۰ دلار</span>
                <span>۲٬۷۰۰ دلار</span>
                <span>۳٬۰۰۰ دلار</span>
              </div>
            </div>
          </div>

          {/* Results Comparison Graphic */}
          <div className="bubble-results-visual">
            <div className="bubble-cards-row">
              {/* Card 1: Market Price */}
              <div className="result-metric-box market-box">
                <span className="box-label">قیمت تابلوی بازار (سکه تمام)</span>
                <div className="box-number">{marketPrice.toLocaleString('fa-IR')} <span className="sub-unit">تومان</span></div>
                <span className="box-badge-sub red">قیمت پرداختی در طلافروشی</span>
              </div>

              {/* Card 2: Real Intrinsic Value */}
              <div className="result-metric-box real-box">
                <span className="box-label">ارزش ذاتی طلا (وزن خالص + انس)</span>
                <div className="box-number text-gradient-gold">{realValue.toLocaleString('fa-IR')} <span className="sub-unit">تومان</span></div>
                <span className="box-badge-sub gold">ارزش واقعی طلای فیزیکی</span>
              </div>

              {/* Card 3: Bubble Amount & Percentage */}
              <div className="result-metric-box bubble-box">
                <span className="box-label">حباب پرداخت‌شده (ریسک شما)</span>
                <div className="box-number text-gradient-rose">
                  +{bubbleAmount.toLocaleString('fa-IR')} <span className="sub-unit">تومان ({bubblePercent.toLocaleString('fa-IR')}٪)</span>
                </div>
                <span className="box-badge-sub rose">پولی که برای طلا نیست!</span>
              </div>
            </div>

            {/* Dynamic Comparison Split Bar */}
            <div className="bubble-graphic-bar-container">
              <div className="bar-labels-top">
                <span className="label-real">
                  <CheckCircle2 size={14} className="icon-green" />
                  ارزش خالص طلا: {realPercent.toLocaleString('fa-IR')}٪
                </span>
                <span className="label-bubble">
                  <AlertTriangle size={14} className="icon-warning" />
                  حباب هیجانی بازار: {bubblePercent.toLocaleString('fa-IR')}٪
                </span>
              </div>

              <div className="bubble-split-bar">
                <div
                  className="bar-segment real-segment"
                  style={{ width: `${realPercent}%` }}
                  title={`ارزش طلای سکه: ${realValue.toLocaleString('fa-IR')} تومان`}
                >
                  <span className="segment-text">طلای خالص موجود در سکه</span>
                </div>
                <div
                  className="bar-segment bubble-segment"
                  style={{ width: `${bubblePercent}%` }}
                  title={`حباب سکه: ${bubbleAmount.toLocaleString('fa-IR')} تومان`}
                >
                  <span className="segment-text">حباب ({bubblePercent}٪)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Educational Insights 3 Cards */}
          <div className="bubble-insights-grid">
            <div className="insight-card">
              <div className="insight-icon-pill warning">
                <AlertTriangle size={18} />
              </div>
              <h4>چرا خرید در حباب بالا خطرناک است؟</h4>
              <p>
                با هر تکانه در بازار یا تصمیم سیاست‌گذار، اولین رقمی که به سرعت ریزش می‌کند،
                <strong> حباب سکه </strong> است نه ارزش طلای درون آن.
              </p>
            </div>

            <div className="insight-card">
              <div className="insight-icon-pill gold">
                <Scale size={18} />
              </div>
              <h4>مقایسه حباب بین انواع سکه و طلا</h4>
              <p>
                در ریلریت حباب سکه تمام، نیم، ربع، سکه گرمی و طلای ۱۸ عیار را لحظه‌ای مقایسه می‌کنید تا ارزان‌ترین
                گزینه با کمترین حباب را برای پس‌انداز انتخاب کنید.
              </p>
            </div>

            <div className="insight-card">
              <div className="insight-icon-pill green">
                <CheckCircle2 size={18} />
              </div>
              <h4>ارزیابی پرتفوی با نرخ واقعی</h4>
              <p>
                ریلریت پورتفوی شما را هم به ارزش اسمی روز بازار و هم به ارزش ذاتی تفکیک می‌کند تا
                بدانید چه میزان از ثروت شما متکی بر حباب است.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
