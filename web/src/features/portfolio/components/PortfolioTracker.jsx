import React, { useState, useRef } from 'react';
import { Plus, Briefcase, FolderPlus } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';

import PortfolioSwitcher from './PortfolioSwitcher.jsx';
import HoldingsView from './HoldingsView.jsx';

import { usePortfolio } from '../hooks/usePortfolio.js';
import { Button, FeaturePageHeader } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { useDemo } from '../../demo/index.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import TextField from '../../../shared/ui/TextField.jsx';

export default function PortfolioTracker({
  initialPortfolioId = null,
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

  const { readOnly } = useDemo();
  const holdingsRef = useRef(null);
  // The active view renders its toolbar (search, export / import, settings) into this row
  const [toolbarSlot, setToolbarSlot] = useState(null);
  const [holdingsVaultLocked, setHoldingsVaultLocked] = useState(false);

  const [newPortfolioModalOpen, setNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);

  const handleOpenAdd = () => {
    if (!readOnly) holdingsRef.current?.openAdd();
  };

  const { toast } = useFeedback();

  // The app's "+" button: /portfolio?add=holding
  useQuickAddParam('holding', () => holdingsRef.current?.openAdd(), Boolean(activePortfolio) && !readOnly && !holdingsVaultLocked);

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
        icon={<Briefcase size={24} />}
        title="پورتفو"
        subtitle="دارایی‌ها با خرید، فروش و سود و زیان هرکدام، بر پایه نرخ لحظه‌ای"
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={handleOpenAdd}
            disabled={readOnly || holdingsVaultLocked}
            title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}
          >
            ثبت در پورتفو
          </Button>
        }
      />

      {/* Portfolios Navigation Bar */}
      <PortfolioSwitcher
        portfolios={portfolios}
        activePortfolioId={activePortfolio?.id}
        onSelect={switchPortfolio}
        onNewPortfolio={readOnly ? undefined : () => setNewPortfolioModalOpen(true)}
      />

      {/* The holdings toolbar (search, export / import, settings) */}
      <div className="portfolio-subtabs-row">
        <div className="portfolio-subtabs-toolbar" ref={setToolbarSlot} />
      </div>

      <HoldingsView
        loadingPortfolios={loadingPortfolios}
        ref={holdingsRef}
        activePortfolio={activePortfolio}
        portfolios={portfolios}
        fetchPortfolios={fetchPortfolios}
        deletePortfolio={deletePortfolio}
        onVaultLockChange={setHoldingsVaultLocked}
        toolbarSlot={toolbarSlot}
      />

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
          <TextField
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
