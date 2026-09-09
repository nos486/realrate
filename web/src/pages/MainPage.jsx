import React from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Megaphone, TrendingUp, Briefcase, Sparkles } from 'lucide-react';
import AppLayout from '../components/ui/AppLayout.jsx';
import FilterPills from '../components/ui/FilterPills.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import MarketInputsToolbar from '../components/MarketInputsToolbar.jsx';
import AnalysisCards from '../components/AnalysisCards.jsx';
import CurrenciesList from '../components/CurrenciesList.jsx';
import PortfolioTracker from '../components/PortfolioTracker.jsx';
import { useMarketData } from '../hooks/useMarketData.js';

export default function MainPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  // Determine active tab from pathname or query params
  const isPortfolio =
    location.pathname.startsWith('/portfolio') ||
    searchParams.get('tab') === 'portfolio';
  const activeTab = isPortfolio ? 'portfolio' : 'market';

  const handleTabChange = (nextTab) => {
    if (nextTab === 'portfolio') {
      if (!location.pathname.startsWith('/portfolio')) {
        let lastId = null;
        try {
          lastId = localStorage.getItem('realrate_last_portfolio_id');
        } catch {}
        navigate(lastId ? `/portfolio/${lastId}` : '/portfolio');
      }
    } else {
      if (location.pathname !== '/' && location.pathname !== '/rates') {
        navigate('/');
      }
    }
  };

  const {
    rates,
    calcData,
    loading,
    usdToman,
    goldUsd,
    setUsdToman,
    setGoldUsd,
    liveUsdSource,
    liveUsdDatetime,
  } = useMarketData();

  const announcement = calcData?.globalSettings?.announcement || rates?.globalSettings?.announcement;
  const analysis = calcData?.analysis;
  const recommendation = calcData?.recommendation;
  const currencies = calcData?.currencies || rates?.currencies;

  const usdNum = parseFloat(String(usdToman).replace(/,/g, '')) || 0;
  const goldUsdNum = parseFloat(String(goldUsd).replace(/,/g, '')) || 0;
  const gold18kItem = calcData?.analysis?.find((i) => i.id === 'gold_18k');
  const computed18k = (goldUsdNum > 0 && usdNum > 0)
    ? Math.round(((goldUsdNum / 31.1034768) * usdNum) * 0.75)
    : null;
  const gold18kPrice = gold18kItem?.market || gold18kItem?.intrinsic || computed18k;

  const hasUsd = usdNum > 0;

  return (
    <AppLayout
      usdToman={usdToman}
      gold18kPrice={gold18kPrice}
      activeTab={activeTab}
      setActiveTab={handleTabChange}
    >
      {/* System Announcement Banner */}
      {announcement && (
        <AlertBanner
          type="info"
          icon={<Megaphone size={16} />}
          message={announcement}
          style={{ marginBottom: '20px' }}
        />
      )}

      {/* Modern Segmented Navigation Tabs */}
      <FilterPills
        variant="segmented"
        size="lg"
        options={[
          { value: 'market', label: 'نرخ و حباب', icon: <TrendingUp size={16} strokeWidth={2} /> },
          { value: 'portfolio', label: 'پورتفو', icon: <Briefcase size={16} strokeWidth={2} /> },
        ]}
        activeValue={activeTab}
        onChange={handleTabChange}
        style={{ marginBottom: '24px' }}
      />

      {/* Tab Views */}
      <section className="tab-view-container">
        {activeTab === 'market' && (
          <div className="market-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Market Top Controls (Inputs Toolbar & Smart Recommendation Side-by-Side on Desktop) */}
            <div className={`market-top-controls ${recommendation ? 'has-rec' : ''}`}>
              <MarketInputsToolbar
                usdToman={usdToman}
                setUsdToman={setUsdToman}
                goldUsd={goldUsd}
                setGoldUsd={setGoldUsd}
                liveUsdSource={liveUsdSource}
                liveUsdDatetime={liveUsdDatetime}
              />

              {/* Smart Recommendation Banner */}
              {recommendation && (
                <div className="smart-rec-banner">
                  <div className="rec-icon-badge">
                    <Sparkles size={16} />
                  </div>
                  <div className="rec-text-group">
                    <div className="rec-title">
                      کمترین حباب: <strong>{recommendation.best_name}</strong>
                    </div>
                    <div className="rec-desc">{recommendation.reason}</div>
                  </div>
                  <div className={`rec-chip ${recommendation.best_bubble_pct < 0 ? 'negative' : 'positive'}`}>
                    <span>{recommendation.best_bubble_pct < 0 ? 'حباب منفی: ' : 'حباب: '}</span>
                    <strong>{recommendation.best_bubble_pct?.toLocaleString('fa-IR')}٪</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Alert Banner if USD is null or 0 */}
            {!hasUsd && (
              <AlertBanner
                type="warning"
                message="لطفاً نرخ دلار را برای محاسبه ارزش واقعی و حباب وارد کنید."
                style={{ marginBottom: '8px' }}
              />
            )}

            <AnalysisCards analysis={analysis} recommendation={recommendation} />
            <CurrenciesList currencies={currencies} />
          </div>
        )}

        {activeTab === 'portfolio' && (
          <PortfolioTracker
            calcData={calcData}
            rates={rates}
            usdToman={usdToman}
            goldUsd={goldUsd}
            initialPortfolioId={params.portfolioId || searchParams.get('p') || searchParams.get('id') || null}
          />
        )}
      </section>
    </AppLayout>
  );
}

