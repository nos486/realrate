import React, { useState, useRef } from 'react';
import { Plus, Briefcase, Receipt, FolderPlus } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';

import PortfolioSwitcher from './PortfolioSwitcher.jsx';
import HoldingsView from './HoldingsView.jsx';
import { TransactionsView } from '../../transactions/index.js';

import { usePortfolio } from '../hooks/usePortfolio.js';
import { Button, FeaturePageHeader } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';

export default function PortfolioTracker({
  rates,
  calcData,
  usdToman,
  goldUsd,
  initialPortfolioId = null,
  initialView = 'holdings',
  onViewChange,
}) {
  const {
    portfolios,
    activePortfolio,
    switchPortfolio,
    createPortfolio,
    deletePortfolio,
    fetchPortfolios,
    loadingPortfolios,
  } = usePortfolio(initialPortfolioId);

  const [view, setView] = useState(initialView);
  const holdingsRef = useRef(null);
  // The active view renders its toolbar (search, export / import, settings) into this row
  const [toolbarSlot, setToolbarSlot] = useState(null);
  const transactionsRef = useRef(null);
  const [holdingsVaultLocked, setHoldingsVaultLocked] = useState(false);
  const [activeViewCount, setActiveViewCount] = useState(null);

  const [newPortfolioModalOpen, setNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);

  // Follow route-driven changes to which sub-tab should be shown (e.g. a deep link to
  // /transactions/:id landing here after initial mount already picked 'holdings'). Adjusted
  // during render (React's recommended pattern) instead of in an effect, so the new tab shows
  // in the same render rather than one render late.
  const [prevInitialView, setPrevInitialView] = useState(initialView);
  if (initialView !== prevInitialView) {
    setPrevInitialView(initialView);
    setView(initialView);
  }

  const handleViewChange = (nextView) => {
    setView(nextView);
    setActiveViewCount(null);
    onViewChange?.(nextView);
  };

  const handleOpenAdd = () => {
    if (view === 'holdings') {
      holdingsRef.current?.openAdd();
    } else {
      transactionsRef.current?.openAdd();
    }
  };

  const { toast } = useFeedback();

  const handleCreatePortfolio = async (e) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;
    setCreatingPortfolio(true);
    try {
      const p = await createPortfolio(newPortfolioName);
      if (p) {
        setNewPortfolioName('');
        setNewPortfolioModalOpen(false);
      }
    } catch (err) {
      toast.error(err.message || 'خطا در ساخت پورتفو');
    } finally {
      setCreatingPortfolio(false);
    }
  };

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.
  return (
    <div className="portfolio-section">
      <FeaturePageHeader
        icon={view === 'holdings' ? <Briefcase size={24} /> : <Receipt size={24} />}
        title={view === 'holdings' ? 'پورتفو' : 'تراکنش‌ها'}
        subtitle={
          view === 'holdings'
            ? 'ارزش‌گذاری دارایی‌ها بر پایه نرخ لحظه‌ای طلا، نقره و ارز'
            : 'ثبت خرید و فروش، تاریخچه معاملات و گردش مالی هر پورتفو'
        }
        actions={
          <Button icon={<Plus size={16} />} onClick={handleOpenAdd} disabled={view === 'holdings' && holdingsVaultLocked}>
            {view === 'holdings' ? 'ثبت دارایی جدید' : 'ثبت تراکنش جدید'}
          </Button>
        }
      />

      {/* Portfolios Navigation Bar */}
      <PortfolioSwitcher
        portfolios={portfolios}
        activePortfolioId={activePortfolio?.id}
        onSelect={switchPortfolio}
        onNewPortfolio={() => setNewPortfolioModalOpen(true)}
        holdingsCount={activeViewCount ?? 0}
        activeCount={activeViewCount}
        mode={view === 'holdings' ? 'portfolio' : 'transactions'}
      />

      {/* Holdings / Transactions sub-tabs, with the active view's toolbar beside them */}
      <div className="portfolio-subtabs-row">
      <div className="tx-filter-pills-bar">
        <button
          type="button"
          className={`tx-filter-pill ${view === 'holdings' ? 'active' : ''}`}
          onClick={() => handleViewChange('holdings')}
        >
          <Briefcase size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          دارایی‌ها
        </button>
        <button
          type="button"
          className={`tx-filter-pill ${view === 'transactions' ? 'active' : ''}`}
          onClick={() => handleViewChange('transactions')}
        >
          <Receipt size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          تراکنش‌ها
        </button>
      </div>
      <div className="portfolio-subtabs-toolbar" ref={setToolbarSlot} />
      </div>

      {view === 'holdings' ? (
        <HoldingsView
          loadingPortfolios={loadingPortfolios}
          ref={holdingsRef}
          activePortfolio={activePortfolio}
          portfolios={portfolios}
          rates={rates}
          calcData={calcData}
          usdToman={usdToman}
          goldUsd={goldUsd}
          fetchPortfolios={fetchPortfolios}
          deletePortfolio={deletePortfolio}
          onVaultLockChange={setHoldingsVaultLocked}
          toolbarSlot={toolbarSlot}
          onCountChange={setActiveViewCount}
        />
      ) : (
        <TransactionsView
          loadingPortfolios={loadingPortfolios}
          ref={transactionsRef}
          activePortfolio={activePortfolio}
          calcData={calcData}
          rates={rates}
          fetchPortfolios={fetchPortfolios}
          onCountChange={setActiveViewCount}
          toolbarSlot={toolbarSlot}
        />
      )}

      {/* New Portfolio Modal */}
      <Modal
        isOpen={newPortfolioModalOpen}
        onClose={() => !creatingPortfolio && setNewPortfolioModalOpen(false)}
        title="پورتفوی جدید"
        icon={<FolderPlus size={18} />}
        maxWidth="460px"
        className="new-portfolio-modal-box"
        onSubmit={handleCreatePortfolio}
        footer={
          <div className="modal-actions">
            <button
              type="button"
              className="btn-cancel"
              disabled={creatingPortfolio}
              onClick={() => setNewPortfolioModalOpen(false)}
            >
              انصراف
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={creatingPortfolio || !newPortfolioName.trim()}
            >
              {creatingPortfolio ? 'در حال ایجاد...' : 'ایجاد'}
            </button>
          </div>
        }
      >
        <div className="form-item">
          <label>نام پورتفو</label>
          <input
            type="text"
            placeholder="مثلاً: پس‌انداز طلا، سبد ارزی..."
            value={newPortfolioName}
            onChange={(e) => setNewPortfolioName(e.target.value)}
            className="form-input"
            required
            autoFocus
          />
          <span className="field-sub-note">
            امکان تنظیم رمز و لینک اشتراک اختصاصی در تنظیمات وجود دارد.
          </span>
        </div>
      </Modal>
    </div>
  );
}
