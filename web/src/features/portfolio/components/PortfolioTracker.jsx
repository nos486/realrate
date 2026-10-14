import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { t } from '../../../utils/i18n.js';

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

  // The address names the open portfolio (/portfolio/:id), so a link or reload lands on it and
  // back / forward move between portfolios; the query (?add=, ?app=) is kept
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = activePortfolio?.id || null;
  const onPortfolioPath = location.pathname.startsWith('/portfolio');
  const goToPortfolio = useCallback((id, replace = false) => {
    navigate({ pathname: `/portfolio/${id}`, search: location.search }, { replace });
  }, [navigate, location.search]);
  const handleSelect = (id) => {
    switchPortfolio(id);
    if (onPortfolioPath && id !== activeId) goToPortfolio(id);
  };
  // The address follows the open portfolio when it names none (/portfolio) or an unknown one; one
  // that exists is adopted by usePortfolio instead (back / forward, a shared link)
  const urlId = location.pathname.match(/^\/portfolio\/([^/]+)/)?.[1] || null;
  const urlKnown = Boolean(urlId) && portfolios.some((p) => p.id === urlId);
  useEffect(() => {
    if (activeId && onPortfolioPath && !urlKnown) goToPortfolio(activeId, true);
  }, [activeId, onPortfolioPath, urlKnown, goToPortfolio]);

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
      toast.error(err.message || t('خطا در ساخت پورتفو'));
    } finally {
      setCreatingPortfolio(false);
    }
  };

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.
  return (
    <div className="portfolio-section">
      <FeaturePageHeader
        icon={<Briefcase size={24} />}
        title={t('پورتفو')}
        help="portfolio"
        subtitle={t('دارایی‌ها با خرید، فروش و سود و زیان هرکدام، بر پایه نرخ لحظه‌ای')}
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={handleOpenAdd}
            disabled={readOnly || holdingsVaultLocked}
            title={readOnly ? t('در نسخه دمو غیرفعال است') : undefined}
          >
            {t('ثبت در پورتفو')}
          </Button>
        }
      />

      {/* Portfolios Navigation Bar */}
      <PortfolioSwitcher
        portfolios={portfolios}
        activePortfolioId={activePortfolio?.id}
        onSelect={handleSelect}
        onNewPortfolio={readOnly ? undefined : () => setNewPortfolioModalOpen(true)}
      />

      {/* The holdings toolbar (search, export / import, settings) */}
      <div className="portfolio-subtabs-row">
        <div className="portfolio-subtabs-toolbar" ref={setToolbarSlot} />
      </div>

      <HoldingsView
        key={activeId || 'none'}
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
        title={t('پورتفوی جدید')}
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
              {t('انصراف')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={creatingPortfolio || !newPortfolioName.trim()}
            >
              {creatingPortfolio ? t('در حال ایجاد...') : t('ایجاد')}
            </button>
          </div>
        }
      >
        <div className="form-item">
          <label>{t('نام پورتفو')}</label>
          <TextField
            type="text"
            placeholder={t('مثلاً: پس‌انداز طلا، سبد ارزی...')}
            value={newPortfolioName}
            onChange={(e) => setNewPortfolioName(e.target.value)}
            className="form-input"
            required
            autoFocus
          />
          <span className="field-sub-note">
            {t('امکان تنظیم رمز و لینک اشتراک اختصاصی در تنظیمات وجود دارد.')}
          </span>
        </div>
      </Modal>
    </div>
  );
}
