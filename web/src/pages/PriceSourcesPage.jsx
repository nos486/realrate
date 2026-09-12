import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Radio,
  Plus,
  RefreshCw,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Star,
  Sparkles,
  Code,
  X,
  Sliders,
  Activity,
  Layers,
  Send,
  Globe,
  ShieldCheck,
  Zap,
  Save,
  Search,
  Eye,
  Wand2,
  SlidersHorizontal,
  Table,
  Hash,
  Tag,
  DollarSign,
  Percent,
  Folder,
  RotateCcw,
  Calculator,
  CheckSquare,
  Square,
  Filter,
  Check,
  ArrowRight,
  ArrowLeft,
  Coins,
  Settings2,
  Info,
} from 'lucide-react';
import AppLayout from '../components/ui/AppLayout.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import FilterPills from '../components/ui/FilterPills.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMarketData } from '../hooks/useMarketData.js';
import {
  apiGetPriceSources,
  apiSavePriceSource,
  apiDeletePriceSource,
  apiSetPrimarySource,
  apiTestPriceSource,
  apiInspectApiSource,
  apiFetchAllSourcesNow,
  apiGetSourceTypes,
  apiSaveSourceType,
  apiDeleteSourceType,
} from '../api/client.js';
import UniversalAssetSearch, {
  extractMultiItems,
  getPriceTypeLabel,
  calculateUsdCrossRate,
  WORLD_CURRENCY_NAMES,
} from '../components/UniversalAssetSearch.jsx';
import DerivedAssetsPage from './DerivedAssetsPage.jsx';

// PRICE_TYPE_INFO is now computed dynamically inside the component from DB-loaded sourceTypes
// See: const PRICE_TYPE_INFO = useMemo(...) inside PriceSourcesPage()

// Generic empty fallback — types are 100% dynamic from DB or user input
const PRICE_TYPE_INFO_FALLBACK = {};

export const FOREX_PRESETS = [
  {
    id: 'iran_market',
    title: 'ارزهای پرکاربرد بازار ایران',
    icon: '⭐',
    keys: ['EUR', 'TRY', 'AED', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY'],
  },
  {
    id: 'neighbors',
    title: 'ارزهای همسایه و منطقه',
    icon: '🌍',
    keys: ['TRY', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'AFN', 'IQD', 'AZN', 'RUB', 'PKR'],
  },
  {
    id: 'g10',
    title: 'ارزهای بین‌المللی G10',
    icon: '🌐',
    keys: ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'USD'],
  },
  {
    id: 'brics',
    title: 'ارزهای آسیایی و بریکس',
    icon: '🌏',
    keys: ['CNY', 'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'SAR'],
  },
];

const DEFAULT_SOURCE_FORM = {
  id: null,
  name: '',
  priceType: '',
  unit: 'تومان',
  sourceType: 'telegram',
  channelUsername: '',
  apiUrl: '',
  jsonPath: '',
  fieldMapping: null,
  excludedOutputs: [],
  displayConfig: null,
  showOnHomePage: true,
  regexPattern: '([\\d,]+)\\s*فروش',
  regexGroupIndex: 1,
  fetchIntervalMinutes: 5,
  isActive: true,
  isPrimary: false,
};

const DEFAULT_MULTI_FEED_FORM = {
  id: null,
  name: '',
  priceType: 'bourse',
  apiUrl: '',
  fetchIntervalMinutes: 60,
  isActive: true,
  showOnHomePage: true,
};

function isSourceMultiOutput(s, priceTypeInfo = {}) {
  if (!s) return false;
  const t = (s.priceType || '').toLowerCase();
  const info = priceTypeInfo[t];
  if (info?.category === 'multi_output') return true;
  if (t === 'bourse' || t === 'bourse_fund' || t === 'forex') return true;
  if (s.fieldMapping && (s.fieldMapping.isMultiOutput || s.fieldMapping.idField || s.fieldMapping.symbolField)) return true;
  return false;
}

function formatNum(num, priceType = 'usd', unit = '') {
  if (num === null || num === undefined || isNaN(num)) return '-';
  if (priceType === 'forex') {
    return `${Number(num).toLocaleString('fa-IR')} ارز`;
  }
  if (priceType === 'bourse_fund') {
    return `${Number(num).toLocaleString('fa-IR')} صندوق`;
  }
  if (priceType === 'bourse') {
    return `${Number(num).toLocaleString('fa-IR')} نماد`;
  }
  if (unit) {
    return `${Number(num).toLocaleString('fa-IR')} ${unit}`;
  }
  const isForex = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes(priceType);
  if (isForex) {
    return Number(num).toLocaleString('fa-IR', { minimumFractionDigits: 4, maximumFractionDigits: 5 });
  }
  const isUsdAsset = priceType === 'ons_gold' || priceType === 'ons_silver';
  if (isUsdAsset) {
    return Number(num).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(num).toLocaleString('fa-IR');
}

function getPriceUnit(priceType) {
  if (priceType === 'bourse_fund') return 'صندوق';
  if (priceType === 'bourse') return 'نماد';
  const isForex = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes(priceType);
  if (isForex) return '$ برابری';
  return (priceType === 'ons_gold' || priceType === 'ons_silver') ? 'دلار ($)' : 'تومان';
}

function formatPersianDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return (
      d.toLocaleDateString('fa-IR') +
      ' ' +
      d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return isoStr;
  }
}

export default function PriceSourcesPage({ embedded = false, usdToman: propUsdToman, gold18kPrice: propGold18kPrice }) {
  const { user, loading: authLoading, triggerLogin } = useAuth();
  const marketData = useMarketData();
  const usdToman = propUsdToman !== undefined ? propUsdToman : marketData.usdToman;
  const gold18kPrice = propGold18kPrice !== undefined ? propGold18kPrice : marketData.gold18kPrice;
  const navigate = useNavigate();

  const renderLayout = (content) => {
    if (embedded) return <div className="embedded-sources-view" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>{content}</div>;
    return (
      <AppLayout
        activeTab="sources"
        setActiveTab={(tab) => navigate(tab === 'portfolio' ? '/portfolio' : '/')}
        usdToman={usdToman}
        gold18kPrice={gold18kPrice}
        layoutClassName="price-sources-fullscreen-app"
        className="sources-page-main full-width-sources-page"
      >
        {content}
      </AppLayout>
    );
  };

  // Sources State
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fetchingAll, setFetchingAll] = useState(false);

  // Source Types State (dynamic, from DB — replaces hardcoded PRICE_TYPE_INFO)
  const [sourceTypes, setSourceTypes] = useState([]);
  const [_loadingSourceTypes, setLoadingSourceTypes] = useState(false);
  // Source Type Management Panel
  const [showSourceTypePanel, setShowSourceTypePanel] = useState(false);
  const [sourceTypeForm, setSourceTypeForm] = useState({ id: '', label: '', category: 'single', unit: 'تومان', badgeColor: 'blue', sortOrder: 99 });
  const [savingSourceType, setSavingSourceType] = useState(false);

  // Compute PRICE_TYPE_INFO dynamically from DB sourceTypes (with hardcoded fallback)
  const PRICE_TYPE_INFO = useMemo(() => {
    if (sourceTypes.length === 0) return PRICE_TYPE_INFO_FALLBACK;
    const map = {};
    for (const st of sourceTypes) {
      map[st.id] = { label: st.label, badgeColor: st.badgeColor || 'blue', unit: st.unit || 'تومان', category: st.category || 'single' };
    }
    return map;
  }, [sourceTypes]);

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const initialTabSection = searchParams.get('subtab') === 'derived' ||
    searchParams.get('tab') === 'derived' ||
    location.pathname.includes('derived')
      ? 'derived'
      : (searchParams.get('subtab') === 'multi' ? 'multi' : 'single');

  // View Switcher: 'single' (Base Rates) vs 'multi' (Multi-Output Feeds Hub) vs 'derived' (Derived Assets)
  const [activeTabSection, setActiveTabSection] = useState(initialTabSection);

  useEffect(() => {
    const tabParam = searchParams.get('subtab') || searchParams.get('tab');
    if (tabParam && ['single', 'multi', 'derived'].includes(tabParam)) {
      setActiveTabSection(tabParam);
    }
  }, [searchParams]);
  const [multiSearch, setMultiSearch] = useState('');

  // Multi-Output Modal States
  const [multiWizardOpen, setMultiWizardOpen] = useState(false);
  const [multiForm, setMultiForm] = useState(DEFAULT_MULTI_FEED_FORM);
  const [multiTesting, setMultiTesting] = useState(false);
  const [multiTestResult, setMultiTestResult] = useState(null);
  const [savingMultiSource, setSavingMultiSource] = useState(false);

  // Data Explorer Modal States
  const [explorerModalOpen, setExplorerModalOpen] = useState(false);
  const [explorerFeed, setExplorerFeed] = useState(null);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerItems, setExplorerItems] = useState([]);

  // Modal State
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [sourceForm, setSourceForm] = useState(DEFAULT_SOURCE_FORM);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState(null);


  // Row Testing State
  const [rowTestingId, setRowTestingId] = useState(null);
  const [rowTestResults, setRowTestResults] = useState({});

  // Notifications / Messages
  const [message, setMessage] = useState(null);

  const showMsg = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Load Source Types from API
  const loadSourceTypes = async () => {
    setLoadingSourceTypes(true);
    try {
      const res = await apiGetSourceTypes();
      if (res.success && Array.isArray(res.sourceTypes)) {
        setSourceTypes(res.sourceTypes);
      }
    } catch (e) {
      console.error('Error loading source types:', e);
    } finally {
      setLoadingSourceTypes(false);
    }
  };

  // Load Price Sources from API
  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const res = await apiGetPriceSources();
      if (res.success && Array.isArray(res.sources)) {
        setSources(res.sources);
      }
    } catch (e) {
      console.error('Error loading price sources:', e);
      showMsg('خطا در دریافت لیست سورس‌ها: ' + e.message, 'error');
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    loadSourceTypes();
    loadSources();
  }, []);

  // Partition sources into Single-Rate Base Sources vs Multi-Output Feeds
  const singleSources = useMemo(() => {
    return sources.filter((s) => !isSourceMultiOutput(s, PRICE_TYPE_INFO));
  }, [sources, PRICE_TYPE_INFO]);

  const multiSources = useMemo(() => {
    return sources.filter((s) => isSourceMultiOutput(s, PRICE_TYPE_INFO));
  }, [sources, PRICE_TYPE_INFO]);


  // Dynamic filter options for Base Rates Table
  const dynamicFilterOptions = useMemo(() => {
    const counts = {};
    for (const s of singleSources) {
      const k = s.priceType || 'general';
      counts[k] = (counts[k] || 0) + 1;
    }
    const options = [
      { value: 'all', label: 'همه نرخ‌ها و سورس‌ها', badge: singleSources.length.toLocaleString('fa-IR') },
    ];
    for (const [key, count] of Object.entries(counts)) {
      const info = PRICE_TYPE_INFO[key];
      options.push({
        value: key,
        label: info?.label || key,
        badge: count.toLocaleString('fa-IR'),
      });
    }
    return options;
  }, [singleSources, PRICE_TYPE_INFO]);

  // Filtered Sources for Base Rates Table
  const filteredSingleSources = useMemo(() => {
    if (sourceFilter === 'all') return singleSources;
    return singleSources.filter((s) => s.priceType === sourceFilter);
  }, [singleSources, sourceFilter]);

  // Filtered Multi Sources for Multi-Feeds Hub Table
  const filteredMultiSources = useMemo(() => {
    if (!multiSearch.trim()) return multiSources;
    const q = multiSearch.trim().toLowerCase();
    return multiSources.filter((s) => {
      return (
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.priceType && s.priceType.toLowerCase().includes(q)) ||
        (s.endpoint && s.endpoint.toLowerCase().includes(q))
      );
    });
  }, [multiSources, multiSearch]);

  // Force Refresh All Active Sources Now
  const handleFetchAllNow = async () => {
    setFetchingAll(true);
    try {
      const res = await apiFetchAllSourcesNow();
      if (res.success) {
        showMsg(`استخراج آنی انجام شد: ${res.extractedCount} سورس به‌روزرسانی شد.`, 'success');
        await loadSources();
      } else {
        showMsg('خطا در استخراج سورس‌ها: ' + (res.message || 'نامشخص'), 'error');
      }
    } catch (err) {
      showMsg('خطا در ارتباط با سرور: ' + err.message, 'error');
    } finally {
      setFetchingAll(false);
    }
  };

  // Open Add Modal
  const handleOpenAddSource = (initialType = '') => {
    setEditingSourceId(null);
    const typeToUse = initialType || (sourceTypes[0]?.id || '');
    setSourceForm({
      ...DEFAULT_SOURCE_FORM,
      priceType: typeToUse,
      unit: 'تومان',
      showOnHomePage: true,
      regexPattern: '([\\d,]+)\\s*فروش',
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditSource = (src) => {
    if (isSourceMultiOutput(src, PRICE_TYPE_INFO)) {
      handleOpenEditMultiFeed(src);
      return;
    }
    const displayCfg = typeof src.displayConfig === 'string'
      ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
      : (src.displayConfig || {});
    const showOnHomePage = displayCfg.showOnHomePage !== undefined ? Boolean(displayCfg.showOnHomePage) : true;

    setEditingSourceId(src.id);
    setSourceForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || '',
      unit: src.unit || getPriceUnit(src.priceType),
      sourceType: src.sourceType || 'telegram',
      channelUsername: src.channelUsername || (src.sourceType === 'telegram' ? src.endpoint : ''),
      apiUrl: src.apiUrl || (src.sourceType === 'api_url' ? src.endpoint : ''),
      jsonPath: src.jsonPath || '',
      fieldMapping: src.fieldMapping || null,
      excludedOutputs: Array.isArray(src.excludedOutputs) ? src.excludedOutputs : [],
      displayConfig: src.displayConfig || null,
      showOnHomePage,
      regexPattern: src.regexPattern || src.regex || '',
      regexGroupIndex: src.regexGroupIndex || 1,
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 300) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      isPrimary: Boolean(src.isPrimary),
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // ── Multi-Feed Handlers ──────────────────────────────────────────────────
  const handleOpenAddMultiFeed = () => {
    setMultiForm({
      ...DEFAULT_MULTI_FEED_FORM,
      name: '',
      priceType: 'bourse',
      apiUrl: 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1',
      fetchIntervalMinutes: 60,
      isActive: true,
      showOnHomePage: true,
    });
    setMultiTestResult(null);
    setMultiWizardOpen(true);
  };

  const handleOpenEditMultiFeed = (src) => {
    const displayCfg = typeof src.displayConfig === 'string'
      ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
      : (src.displayConfig || {});
    const showOnHomePage = displayCfg.showOnHomePage !== undefined ? Boolean(displayCfg.showOnHomePage) : true;

    setMultiForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'bourse',
      apiUrl: src.apiUrl || src.endpoint || '',
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 3600) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      showOnHomePage,
    });
    setMultiTestResult(null);
    setMultiWizardOpen(true);
  };

  const handleTestMultiSource = async () => {
    if (!multiForm.apiUrl) {
      alert('لطفاً آدرس وب‌سرویس را وارد کنید.');
      return;
    }
    setMultiTesting(true);
    setMultiTestResult(null);
    try {
      const res = await apiTestPriceSource({
        sourceType: 'api_url',
        priceType: multiForm.priceType,
        endpoint: multiForm.apiUrl,
        name: multiForm.name || 'تست فید',
      });
      setMultiTestResult(res);
      if (res.success) {
        showMsg(res.message || 'تست با موفقیت انجام شد.', 'success');
      }
    } catch (err) {
      setMultiTestResult({ success: false, error: err.message });
    } finally {
      setMultiTesting(false);
    }
  };

  const handleSaveMultiSource = async (e) => {
    if (e) e.preventDefault();
    if (!multiForm.name.trim()) {
      alert('لطفاً نام فید را وارد کنید.');
      return;
    }
    if (!multiForm.apiUrl.trim()) {
      alert('لطفاً آدرس وب‌سرویس API را وارد کنید.');
      return;
    }

    setSavingMultiSource(true);
    try {
      const displayConfig = {
        showOnHomePage: multiForm.showOnHomePage !== false,
      };

      const payload = {
        id: multiForm.id,
        name: multiForm.name.trim(),
        priceType: multiForm.priceType || 'bourse',
        sourceType: 'api_url',
        endpoint: multiForm.apiUrl.trim(),
        fetchIntervalMinutes: Number(multiForm.fetchIntervalMinutes) || 60,
        isActive: multiForm.isActive,
        displayConfig,
      };

      const res = await apiSavePriceSource(payload);
      if (res.success) {
        showMsg(`سورس چند خروجی «${multiForm.name}» با موفقیت ذخیره شد.`, 'success');
        setMultiWizardOpen(false);
        await loadSources();
      } else {
        alert('خطا در ذخیره‌سازی: ' + (res.error || 'ناشناخته'));
      }
    } catch (err) {
      alert('خطا در ذخیره‌سازی سورس: ' + err.message);
    } finally {
      setSavingMultiSource(false);
    }
  };

  const handleOpenExplorer = async (src) => {
    setExplorerFeed(src);
    setExplorerSearch('');
    setExplorerModalOpen(true);

    let items = extractMultiItems(src);
    if (items.length > 0) {
      setExplorerItems(items.map(it => ({
        s: it.symbol || it.s,
        n: it.name || it.n,
        p: it.price || it.p,
        cp: it.changePercent !== undefined ? it.changePercent : it.cp,
        cat: it.category || it.cat,
        extra: it.extra,
        rawRate: it.rawRate,
        usdCrossRate: it.usdCrossRate,
        priceTomans: it.price,
      })));
      return;
    }

    setExplorerLoading(true);
    try {
      const testRes = await apiTestPriceSource(src);
      if (testRes.success) {
        const testItems = extractMultiItems({ ...src, lastMultiData: testRes.multiData || testRes });
        if (testItems.length > 0) {
          setExplorerItems(testItems.map(it => ({
            s: it.symbol || it.s,
            n: it.name || it.n,
            p: it.price || it.p,
            cp: it.changePercent !== undefined ? it.changePercent : it.cp,
            cat: it.category || it.cat,
            extra: it.extra,
            rawRate: it.rawRate,
            usdCrossRate: it.usdCrossRate,
            priceTomans: it.price,
          })));
        } else if (testRes.sampleItems || testRes.compactList) {
          setExplorerItems(testRes.sampleItems || testRes.compactList || []);
        }
      }
    } catch (e) {
      console.error('Error fetching explorer items:', e);
    } finally {
      setExplorerLoading(false);
    }
  };

  const handleExplorerToggleExclude = async (itemSymOrName) => {
    if (!explorerFeed) return;
    const currentExcluded = Array.isArray(explorerFeed.excludedOutputs)
      ? [...explorerFeed.excludedOutputs]
      : (typeof explorerFeed.excludedOutputs === 'string' ? JSON.parse(explorerFeed.excludedOutputs || '[]') : []);

    const key = String(itemSymOrName).trim().toLowerCase();
    const isExcluded = currentExcluded.includes(key);
    const updated = isExcluded ? currentExcluded.filter(x => x !== key) : [...currentExcluded, key];

    try {
      const res = await apiSavePriceSource({
        ...explorerFeed,
        endpoint: explorerFeed.endpoint || explorerFeed.channelUsername || explorerFeed.apiUrl,
        excludedOutputs: updated,
      });
      if (res.success) {
        setExplorerFeed(prev => ({ ...prev, excludedOutputs: updated }));
        showMsg(isExcluded ? `آیتم «${itemSymOrName}» مجدداً به لیست بازگشت.` : `آیتم «${itemSymOrName}» مستثنی شد.`, 'info');
        loadSources();
      }
    } catch (e) {
      alert('خطا در ذخیره مستثنی‌سازی: ' + e.message);
    }
  };

  // Save Source Type from management panel
  const handleSaveSourceType = async (e) => {
    e.preventDefault();
    setSavingSourceType(true);
    try {
      const res = await apiSaveSourceType(sourceTypeForm);
      if (res.success) {
        showMsg('نوع سورس با موفقیت ذخیره شد.', 'success');
        setSourceTypeForm({ id: '', label: '', category: 'single', unit: 'تومان', badgeColor: 'blue', sortOrder: 99 });
        await loadSourceTypes();
      } else {
        showMsg(res.message || 'خطا در ذخیره‌سازی.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    } finally {
      setSavingSourceType(false);
    }
  };

  // Delete Source Type
  const handleDeleteSourceType = async (st) => {
    if (!window.confirm(`حذف نوع سورس «${st.label || st.id}»؟`)) return;
    try {
      const res = await apiDeleteSourceType(st.id);
      if (res.success) {
        showMsg('نوع سورس حذف شد.', 'success');
        await loadSourceTypes();
      } else {
        showMsg(res.message || 'خطا در حذف.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    }
  };

  // Save Modal Source
  const handleSaveModalSource = async (e) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const prevDisplay = typeof sourceForm.displayConfig === 'string'
        ? (() => { try { return JSON.parse(sourceForm.displayConfig); } catch { return {}; } })()
        : (sourceForm.displayConfig || {});
      const displayConfig = {
        ...prevDisplay,
        showOnHomePage: sourceForm.showOnHomePage !== false,
      };

      const payload = {
        ...sourceForm,
        displayConfig,
        endpoint: sourceForm.sourceType === 'telegram' ? sourceForm.channelUsername : sourceForm.apiUrl,
        regexGroupIndex: parseInt(sourceForm.regexGroupIndex, 10) || 1,
        fetchIntervalMinutes: parseInt(sourceForm.fetchIntervalMinutes, 10) || 5,
        fetchIntervalSec: (parseInt(sourceForm.fetchIntervalMinutes, 10) || 5) * 60,
      };
      const res = await apiSavePriceSource(payload);
      if (res.success) {
        showMsg(res.message || 'سورس با موفقیت ذخیره شد.', 'success');
        setSourceModalOpen(false);
        await loadSources();
        // Auto-register custom type if not yet in source_types
        if (sourceForm.priceType && !sourceTypes.some(st => st.id === sourceForm.priceType)) {
          apiSaveSourceType({
            id: sourceForm.priceType,
            label: sourceForm.priceType,
            category: 'single',
            unit: sourceForm.unit || 'تومان',
            badgeColor: 'blue',
          }).then(() => loadSourceTypes()).catch(() => {});
        }
      } else {
        showMsg(res.message || 'خطا در ذخیره‌سازی سورس.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    } finally {
      setModalSaving(false);
    }
  };

  // Delete Source — Also removes all historical data per user request
  const handleDeleteSource = async (src) => {
    if (!window.confirm(`آیا از حذف کامل سورس «${src.name}» و تمامی رکوردهای تاریخچه آن اطمینان دارید؟`)) return;
    try {
      const res = await apiDeletePriceSource(src.id);
      if (res.success) {
        showMsg(res.message || 'سورس و تمام تاریخچه قیمت آن با موفقیت حذف شد.', 'success');
        const remaining = sources.filter((s) => s.id !== src.id);
        setSources(remaining);
        if (selectedSourceId === src.id) {
          setSelectedSourceId(remaining[0]?.id || '');
        }
      } else {
        showMsg(res.message || 'خطا در حذف سورس.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    }
  };

  // Set Primary Source
  const handleSetPrimary = async (src) => {
    try {
      const res = await apiSetPrimarySource(src.id, src.priceType);
      if (res.success) {
        showMsg(`سورس «${src.name}» به عنوان مرجع قیمت تعیین شد.`, 'success');
        loadSources();
      } else {
        showMsg(res.message || 'خطا در تنظیم سورس مرجع.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    }
  };

  // Toggle Active State
  const handleToggleActive = async (src) => {
    try {
      const res = await apiSavePriceSource({
        ...src,
        isActive: !src.isActive,
      });
      if (res.success) {
        showMsg(`وضعیت سورس «${src.name}» بروز شد.`, 'success');
        loadSources();
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    }
  };

  // Test inside Modal
  const handleTestModalSource = async () => {
    setModalTesting(true);
    setModalTestResult(null);
    try {
      const endpoint = sourceForm.sourceType === 'telegram' ? sourceForm.channelUsername : sourceForm.apiUrl;
      const res = await apiTestPriceSource({
        ...sourceForm,
        endpoint,
      });
      setModalTestResult(res);
    } catch (err) {
      setModalTestResult({
        success: false,
        error: 'خطا در اتصال به سورس: ' + err.message,
      });
    } finally {
      setModalTesting(false);
    }
  };

  // Test Row Source with LIVE UPDATE to state & isolated history
  const handleTestRowSource = async (src) => {
    setRowTestingId(src.id);
    try {
      const res = await apiTestPriceSource(src);
      setRowTestResults((prev) => ({ ...prev, [src.id]: res }));

      if (res.success && res.price) {
        setSources((prev) =>
          prev.map((s) =>
            s.id === src.id
              ? {
                  ...s,
                  lastPrice: res.price,
                  lastFetched: res.datetime || new Date().toISOString(),
                }
              : s
          )
        );

        showMsg(`قیمت سورس «${src.name}» با موفقیت استخراج و ذخیره شد: ${formatNum(res.price, src.priceType)} ${getPriceUnit(src.priceType)}`, 'success');
      } else if (!res.success) {
        showMsg(`خطا در استخراج قیمت سورس «${src.name}»: ${res.error || 'قیمت استخراج نشد'}`, 'error');
      }
    } catch (err) {
      setRowTestResults((prev) => ({
        ...prev,
        [src.id]: { success: false, error: err.message },
      }));
      showMsg('خطا در تست سورس: ' + err.message, 'error');
    } finally {
      setRowTestingId(null);
    }
  };

  // Not logged in or not admin check
  if (authLoading) {
    return renderLayout(
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div>
          <RefreshCw size={28} className="spin-anim" style={{ color: 'var(--accent-blue)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)' }}>در حال بررسی دسترسی مدیریت...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return renderLayout(
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Card className="admin-container" padding="lg" style={{ textAlign: 'center', maxWidth: '460px' }}>
          <ShieldCheck size={48} style={{ color: 'var(--accent-amber, #f59e0b)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-heading)' }}>
            دسترسی محدود به مدیر کل
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.7' }}>
            صفحه مدیریت یکپارچه سورس‌های قیمت و نمودارهای تحلیلی تنها برای مدیران سیستم در دسترس است.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <Link to="/" className="btn-sm site-link" style={{ padding: '8px 16px', fontSize: '13px' }}>
              بازگشت به خانه
            </Link>
            <button
              onClick={triggerLogin}
              className="btn-sm btn-primary-action"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              ورود با حساب مدیر
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return renderLayout(
    <>
      {/* Top Page Title Strip */}
      <Card className="sources-page-hero-banner" padding="hero">
        <div className="hero-content-row">
          <div className="hero-title-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="hero-icon-badge">
                <Radio size={22} style={{ color: 'var(--accent-blue, #38bdf8)' }} />
              </div>
              <div>
                <h1 className="hero-page-title">
                  مدیریت سورس‌های بازار و تاریخچه نمودارها
                </h1>
                <p className="hero-page-desc">
                  پیکربندی استخراج قیمت، ثبت تاریخچه تفکیکی و گراف‌های اختصاصی بازار
                </p>
              </div>
            </div>
          </div>

          <div className="hero-actions-group">
            <button
              type="button"
              onClick={handleFetchAllNow}
              disabled={fetchingAll}
              className="btn-hero-action primary-glow"
              title="فراخوانی همزمان تمام سورس‌های فعال و ثبت در تاریخچه دیتابیس"
            >
              <Zap size={14} className={fetchingAll ? 'spin-anim' : ''} />
              <span>{fetchingAll ? 'در حال دریافت نرخ‌ها...' : 'دریافت آنی قیمت همه سورس‌ها'}</span>
            </button>

            {activeTabSection === 'single' ? (
              <button
                type="button"
                onClick={() => handleOpenAddSource(sourceFilter === 'all' ? 'usd' : sourceFilter)}
                className="btn-hero-action accent"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>افزودن سورس جدید</span>
              </button>
            ) : activeTabSection === 'derived' ? null : (
              <button
                type="button"
                onClick={handleOpenAddMultiFeed}
                className="btn-hero-action primary-glow"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>+ ایجاد فید چند خروجی هوشمند</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSourceTypePanel(p => !p)}
              className="btn-hero-action"
              style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-indigo, #6366f1)', border: '1px solid rgba(99,102,241,0.25)' }}
              title="مدیریت انواع سورس قیمت (دایناتیک)"
            >
              <Sliders size={14} />
              <span>مدیریت انواع سورس</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Global Notification Banner */}
      {message && (
        <AlertBanner
          type={message.type}
          message={message.text}
          onClose={() => setMessage(null)}
          style={{ margin: '0 0 16px' }}
        />
      )}

      {/* ── Source Types Management Panel ──────────────────────────────────── */}
      {showSourceTypePanel && (
        <Card padding="lg" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={16} style={{ color: 'var(--accent-indigo, #6366f1)' }} />
              <h3 style={{ fontSize: '14px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
                مدیریت انواع سورس قیمت (پویا)
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--surface-2, rgba(0,0,0,0.06))', padding: '2px 8px', borderRadius: '99px' }}>
                {sourceTypes.length} نوع
              </span>
            </div>
            <button type="button" onClick={() => setShowSourceTypePanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Existing source types list */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
            {sourceTypes.map(st => (
              <div key={st.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '5px 10px', borderRadius: '8px',
                background: 'var(--surface-2, rgba(0,0,0,0.05))',
                border: '1px solid var(--border, rgba(0,0,0,0.08))',
                fontSize: '12px',
              }}>
                <span style={{ fontWeight: '700', color: 'var(--text-heading)' }}>{st.id}</span>
                <span style={{ color: 'var(--text-muted)' }}>{st.label}</span>
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                  {st.category === 'multi_output' ? 'چند خروجی' : 'تک خروجی'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{st.unit}</span>
                {!st.isSystem && (
                  <button type="button" onClick={() => handleDeleteSourceType(st)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-rose, #f43f5e)', padding: '0', display: 'flex' }}>
                    <Trash2 size={12} />
                  </button>
                )}
                {st.isSystem && <span style={{ fontSize: '9px', color: 'var(--text-muted)', opacity: 0.6 }}>سیستمی</span>}
              </div>
            ))}
          </div>

          {/* Add new source type form */}
          <form onSubmit={handleSaveSourceType} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--border, rgba(0,0,0,0.08))' }}>
            <div className="form-group" style={{ margin: 0, flex: '0 0 120px' }}>
              <label style={{ fontSize: '11px' }}>شناسه (ID)</label>
              <input type="text" required placeholder="مثال: crypto" value={sourceTypeForm.id}
                onChange={e => setSourceTypeForm(p => ({ ...p, id: e.target.value.toLowerCase().trim() }))}
                style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace', fontSize: '12px' }} />
            </div>
            <div className="form-group" style={{ margin: 0, flex: '1 1 160px' }}>
              <label style={{ fontSize: '11px' }}>عنوان فارسی</label>
              <input type="text" required placeholder="مثال: رمزارز" value={sourceTypeForm.label}
                onChange={e => setSourceTypeForm(p => ({ ...p, label: e.target.value }))} style={{ fontSize: '12px' }} />
            </div>
            <div className="form-group" style={{ margin: 0, flex: '0 0 120px' }}>
              <label style={{ fontSize: '11px' }}>نوع خروجی</label>
              <select value={sourceTypeForm.category} onChange={e => setSourceTypeForm(p => ({ ...p, category: e.target.value }))} style={{ fontSize: '12px' }}>
                <option value="single">تک خروجی</option>
                <option value="multi_output">چند خروجی</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0, flex: '0 0 90px' }}>
              <label style={{ fontSize: '11px' }}>واحد</label>
              <input type="text" placeholder="تومان" value={sourceTypeForm.unit}
                onChange={e => setSourceTypeForm(p => ({ ...p, unit: e.target.value }))} style={{ fontSize: '12px' }} />
            </div>
            <div className="form-group" style={{ margin: 0, flex: '0 0 100px' }}>
              <label style={{ fontSize: '11px' }}>رنگ badge</label>
              <input type="text" placeholder="blue" value={sourceTypeForm.badgeColor}
                onChange={e => setSourceTypeForm(p => ({ ...p, badgeColor: e.target.value }))} style={{ fontSize: '12px', direction: 'ltr' }} />
            </div>
            <button type="submit" disabled={savingSourceType} className="btn-primary" style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={13} />
              <span>{savingSourceType ? 'در حال ذخیره...' : 'افزودن/بروزرسانی'}</span>
            </button>
          </form>
        </Card>
      )}

      {/* ── Top-Level View Switcher Bar (Base Rates vs Multi-Output Feeds Hub vs Derived Assets) ── */}
      <div className="sources-view-switcher-bar">
        <button
          type="button"
          className={`sources-view-tab ${activeTabSection === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTabSection('single')}
        >
          <Radio size={16} />
          <span>سورس‌های نرخ پایه (طلا، ارز، سکه)</span>
          <span className="sources-count-pill">{singleSources.length.toLocaleString('fa-IR')} سورس</span>
        </button>

        <button
          type="button"
          className={`sources-view-tab ${activeTabSection === 'multi' ? 'active' : ''}`}
          onClick={() => setActiveTabSection('multi')}
        >
          <Layers size={16} />
          <span>هاب سورس‌های چند خروجی و فیدها (Multi-Output Feeds)</span>
          <span className="sources-count-pill multi-glow">{multiSources.length.toLocaleString('fa-IR')} فید</span>
        </button>

        <button
          type="button"
          className={`sources-view-tab ${activeTabSection === 'derived' ? 'active' : ''}`}
          onClick={() => setActiveTabSection('derived')}
        >
          <Calculator size={16} />
          <span>اقلام محاسباتی و مشتق‌شده (فرمول‌ها و ضرایب)</span>
          <span className="sources-count-pill" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>
            فرمول‌های محاسباتی
          </span>
        </button>
      </div>

      {activeTabSection === 'single' ? (
        <>
        {/* ── SECTION 1: Unified Management Table ─────────────────────────── */}
        <section className="sources-table-section">
          <div className="table-header-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={17} style={{ color: 'var(--accent-blue)' }} />
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
                جدول مدیریت و پیکربندی سورس‌های نرخ پایه
              </h3>
            </div>

            {/* Dynamic Filter Pills based on actual sources */}
            <FilterPills
              options={dynamicFilterOptions}
              activeValue={sourceFilter}
              onChange={setSourceFilter}
            />
          </div>

          {/* Table Container */}
          <div className="users-table-wrap sources-fullscreen-table-wrap">
            <table className="users-table sources-table">
              <thead>
                <tr>
                  <th>نام سورس و آدرس</th>
                  <th>نوع نرخ</th>
                  <th>پروتکل</th>
                  <th>تنظیمات استخراج</th>
                  <th>آخرین قیمت استخراجی</th>
                  <th>سورس مرجع</th>
                  <th>وضعیت</th>
                  <th style={{ textAlign: 'center' }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSingleSources.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '24px' }}>
                      <EmptyState
                        title={loadingSources ? 'در حال دریافت لیست سورس‌ها...' : 'هیچ سورسی در این دسته‌بندی یافت نشد.'}
                        description={sourceFilter !== 'all' ? `برای مشاهده سایر سورس‌ها، فیلتر "${PRICE_TYPE_INFO[sourceFilter]?.label || sourceFilter}" را تغییر دهید.` : null}
                        action={
                          sourceFilter !== 'all' ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '12px', padding: '6px 14px' }}
                              onClick={() => setSourceFilter('all')}
                            >
                              مشاهده همه سورس‌ها
                            </button>
                          ) : null
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredSingleSources.map((src) => {
                    const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
                    const isRowTesting = rowTestingId === src.id;
                    const rowResult = rowTestResults[src.id];

                    return (
                      <React.Fragment key={src.id}>
                        <tr>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '13.5px', color: 'var(--text-heading)' }}>
                                  {src.name}
                                </strong>
                                {(() => {
                                  const dc = typeof src.displayConfig === 'string'
                                    ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
                                    : (src.displayConfig || {});
                                  return dc.showOnHomePage === false ? (
                                    <span style={{ fontSize: '10px', color: '#f43f5e', background: 'rgba(244,63,94,0.12)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                      مخفی از صفحه اول
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                      صفحه اول
                                    </span>
                                  );
                                })()}
                              </div>
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--text-muted)',
                                  direction: 'ltr',
                                  textAlign: 'right',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {src.sourceType === 'telegram'
                                  ? `@${(src.channelUsername || src.endpoint || '').replace(/^@/, '')}`
                                  : (src.apiUrl || src.endpoint || '')}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span className={`source-type-pill pill-${typeInfo.badgeColor}`}>
                                {typeInfo.label}
                              </span>
                              {typeInfo.category === 'multi_output' && (
                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', width: 'fit-content' }}>
                                  چند خروجی
                                </span>
                              )}
                              {Array.isArray(src.excludedOutputs) && src.excludedOutputs.length > 0 && (
                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', width: 'fit-content' }}>
                                  {src.excludedOutputs.length} مورد حذف‌شده
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className="source-proto-tag"
                              style={{
                                background:
                                  src.sourceType === 'telegram'
                                    ? 'rgba(0,136,204,0.12)'
                                    : 'rgba(16,185,129,0.12)',
                                color: src.sourceType === 'telegram' ? '#0088cc' : '#10b981',
                              }}
                            >
                              {src.sourceType === 'telegram' ? 'کانال تلگرام' : 'وب‌سرویس API'}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                direction: 'ltr',
                                display: 'block',
                                maxWidth: '220px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: 'var(--text-muted)',
                              }}
                              title={
                                src.sourceType === 'telegram'
                                  ? `Regex: ${src.regexPattern || src.regex} (group ${src.regexGroupIndex || 1})`
                                  : `JSON Path: ${src.jsonPath || 'بدون مسیر'}`
                              }
                            >
                              {src.sourceType === 'telegram'
                                ? (src.regexPattern || src.regex || 'پیش‌فرض')
                                : (src.jsonPath || '—')}
                            </span>
                          </td>
                          <td>
                            {src.lastPrice && Number(src.lastPrice) > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {src.priceType === 'forex' ? (
                                  <strong style={{ fontSize: '13px', color: 'var(--accent-blue)', fontWeight: '700' }}>
                                    {Number(src.lastPrice).toLocaleString('fa-IR')} ارز جهانی (EUR, TRY, ...)
                                  </strong>
                                ) : src.priceType === 'bourse_fund' ? (
                                  <strong style={{ fontSize: '13px', color: '#c084fc', fontWeight: '700' }}>
                                    {Number(src.lastPrice).toLocaleString('fa-IR')} صندوق فعال بورس
                                  </strong>
                                ) : src.priceType === 'bourse' ? (
                                  <strong style={{ fontSize: '13px', color: 'var(--accent-green, #10b981)', fontWeight: '700' }}>
                                    {Number(src.lastPrice).toLocaleString('fa-IR')} نماد فعال بورس
                                  </strong>
                                ) : (
                                  <strong
                                    style={{
                                      fontSize: '13.5px',
                                      color: 'var(--accent-green, #10b981)',
                                      fontWeight: '700',
                                    }}
                                  >
                                    {formatNum(src.lastPrice, src.priceType)} {getPriceUnit(src.priceType)}
                                  </strong>
                                )}
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  {formatPersianDate(src.lastFetched)}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                هنوز دریافت نشده
                              </span>
                            )}
                          </td>
                          <td>
                            {src.isPrimary ? (
                              <span className="primary-badge" title="سورس پیش‌فرض این نوع قیمت">
                                <Star size={11} fill="currentColor" />
                                <span>مرجع</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetPrimary(src)}
                                className="btn-set-primary"
                                title="تبدیل به سورس مرجع برای محاسبات سایت"
                              >
                                <Star size={11} />
                                <span>انتخاب مرجع</span>
                              </button>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(src)}
                              className={`source-toggle-btn ${src.isActive ? 'active' : 'inactive'}`}
                              title={src.isActive ? 'کلیک برای غیرفعال‌سازی' : 'کلیک برای فعال‌سازی'}
                            >
                              <span className="toggle-indicator" />
                              <span>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                            </button>
                          </td>
                          <td>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleTestRowSource(src)}
                                disabled={isRowTesting}
                                className="action-icon-btn test-btn"
                                title="تست استخراج قیمت و ذخیره در تاریخچه اختصاصی این سورس"
                              >
                                <PlayCircle
                                  size={15}
                                  className={isRowTesting ? 'spin-anim' : ''}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditSource(src)}
                                className="action-icon-btn edit-btn"
                                title="ویرایش تنظیمات سورس"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSource(src)}
                                className="action-icon-btn delete-btn"
                                title="حذف سورس و تمامی رکوردهای تاریخچه‌اش"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Inline Test Result Banner */}
                        {rowResult && (
                          <tr className="test-result-row">
                            <td colSpan="8" style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.06)' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  fontSize: '12px',
                                  gap: '8px',
                                }}
                              >
                                {rowResult.success ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green, #10b981)' }}>
                                    <CheckCircle2 size={14} />
                                    <span>
                                      {rowResult.message || (
                                        <>قیمت با موفقیت استخراج و ذخیره شد: <strong>{formatNum(rowResult.price, src.priceType)} {getPriceUnit(src.priceType)}</strong></>
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose, #f43f5e)' }}>
                                    <AlertCircle size={14} />
                                    <span>خطا در استخراج قیمت: {rowResult.error || 'عدم تطابق قیمت'}</span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRowTestResults((prev) => {
                                      const next = { ...prev };
                                      delete next[src.id];
                                      return next;
                                    })
                                  }
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        </>
      ) : activeTabSection === 'derived' ? (
        <DerivedAssetsPage embedded />
      ) : (
        /* ── SECTION 3: Multi-Output Feeds Hub Workspace ─────────────────── */
        <section className="multi-feeds-hub-wrap">
          {/* Header Card with Stats */}
          <div className="multi-feeds-header-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Sparkles size={18} style={{ color: '#818cf8' }} />
                  <h2 style={{ fontSize: '18px', fontWeight: '900', margin: 0, color: 'var(--text-heading)' }}>
                    هاب مدیریت سورس‌های چند خروجی و فیدهای تجمیعی
                  </h2>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.6' }}>
                  پشتیبانی از هر نوع خروجی چند آیتمی: بورس اوراق بهادار، قیمت روز خودرو، رمزارزها، کالاهای اساسی و APIهای سفارشی با نگاشت هوشمند
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddMultiFeed}
                className="btn-hero-action primary-glow"
                style={{ padding: '10px 20px', fontSize: '13px' }}
              >
                <Plus size={16} strokeWidth={2.5} />
                <span>+ ایجاد فید چند خروجی هوشمند</span>
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="multi-feeds-stats-grid">
              <div className="multi-stat-card">
                <div className="multi-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                  <Layers size={20} />
                </div>
                <div className="multi-stat-info">
                  <span className="multi-stat-val">{multiSources.length.toLocaleString('fa-IR')}</span>
                  <span className="multi-stat-lbl">فیدهای فعال و پیکربندی‌شده</span>
                </div>
              </div>

              <div className="multi-stat-card">
                <div className="multi-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                  <Table size={20} />
                </div>
                <div className="multi-stat-info">
                  <span className="multi-stat-val">
                    {multiSources.reduce((acc, s) => acc + (Number(s.lastPrice) || 0), 0).toLocaleString('fa-IR')}
                  </span>
                  <span className="multi-stat-lbl">مجموع اقلام و محصولات رصدشده</span>
                </div>
              </div>

              <div className="multi-stat-card">
                <div className="multi-stat-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}>
                  <X size={20} />
                </div>
                <div className="multi-stat-info">
                  <span className="multi-stat-val">
                    {multiSources.reduce((acc, s) => {
                      const excl = Array.isArray(s.excludedOutputs) ? s.excludedOutputs : (typeof s.excludedOutputs === 'string' ? JSON.parse(s.excludedOutputs || '[]') : []);
                      return acc + excl.length;
                    }, 0).toLocaleString('fa-IR')}
                  </span>
                  <span className="multi-stat-lbl">کل موارد مستثنی‌شده (Excluded)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Search Toolbar */}
          <div className="table-header-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={17} style={{ color: 'var(--accent-indigo, #6366f1)' }} />
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
                فهرست فیدهای چند خروجی
              </h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '260px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="جستجو در فیدها (نام، آدرس، نوع)..."
                  value={multiSearch}
                  onChange={(e) => setMultiSearch(e.target.value)}
                  style={{ width: '100%', paddingRight: '32px', fontSize: '12px', padding: '6px 32px 6px 12px' }}
                />
              </div>
            </div>
          </div>

          {/* Multi-Output Feeds Table */}
          <div className="users-table-wrap sources-fullscreen-table-wrap">
            <table className="users-table sources-table">
              <thead>
                <tr>
                  <th>نام فید و آدرس</th>
                  <th>دسته‌بندی</th>
                  <th>تعداد اقلام رصدشده</th>
                  <th>نگاشت ساختار ستون‌ها</th>
                  <th>موارد مستثنی‌شده</th>
                  <th>وضعیت</th>
                  <th style={{ textAlign: 'center' }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredMultiSources.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px' }}>
                      <EmptyState
                        title="هیچ فید چند خروجی یافت نشد."
                        description="برای اتصال به API خودرو، بورس، کریپتو یا وب‌سرویس دلخواه، یک فید جدید ایجاد کنید."
                        action={
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ fontSize: '12px', padding: '8px 16px' }}
                            onClick={handleOpenAddMultiFeed}
                          >
                            + ایجاد اولین فید هوشمند
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredMultiSources.map((src) => {
                    const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'indigo' };
                    const mapping = typeof src.fieldMapping === 'string' ? JSON.parse(src.fieldMapping || '{}') : (src.fieldMapping || {});
                    const labels = mapping.labels || {};
                    const excluded = Array.isArray(src.excludedOutputs)
                      ? src.excludedOutputs
                      : (typeof src.excludedOutputs === 'string' ? JSON.parse(src.excludedOutputs || '[]') : []);

                    return (
                      <tr key={src.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <strong style={{ fontSize: '13.5px', color: 'var(--text-heading)' }}>{src.name}</strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>
                              {src.endpoint || src.apiUrl || '-'}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className={`badge badge-${typeInfo.badgeColor || 'indigo'}`} style={{ fontSize: '11px' }}>
                            {typeInfo.label || src.priceType}
                          </span>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent-green, #10b981)' }}>
                              {Number(src.lastPrice || 0).toLocaleString('fa-IR')}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{typeInfo.unit || 'مورد'}</span>
                          </div>
                          {src.lastFetched && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                              {formatPersianDate(src.lastFetched)}
                            </span>
                          )}
                        </td>

                        <td>
                          {mapping.feedType === 'key_value' || src.priceType === 'forex' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', width: 'fit-content', fontWeight: '700' }}>
                                کلید-مقدار (Key-Value)
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                ریشه: <code style={{ color: 'var(--text-heading)' }}>{mapping.rootPath || mapping.arrayPath || 'rates'}</code>
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--accent-green, #10b981)' }}>
                                فرمول: <strong>{mapping.defaultMode === 'invert' ? 'معکوس (1/rate)' : (mapping.defaultMode === 'direct' ? 'مستقیم' : 'ضرب')}</strong>
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '280px' }}>
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                شناسه: <code style={{ color: 'var(--text-heading)' }}>{mapping.idField || mapping.symbolField || 'l18'}</code>
                                {labels.id ? ` (${labels.id})` : ''}
                              </span>
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                عنوان: <code style={{ color: 'var(--text-heading)' }}>{mapping.titleField || mapping.nameField || 'l30'}</code>
                                {labels.title ? ` (${labels.title})` : ''}
                              </span>
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--accent-green, #10b981)' }}>
                                قیمت: <code style={{ color: 'var(--accent-green, #10b981)' }}>{mapping.priceField || 'pl'}</code>
                                {labels.price ? ` (${labels.price})` : ''}
                              </span>
                              {mapping.altPriceField && (
                                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                  دوم: <code>{mapping.altPriceField}</code>
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td>
                          {mapping.selectionMode === 'whitelist' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '2px 8px', borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.12)', color: '#10b981',
                                fontSize: '11px', fontWeight: '700', width: 'fit-content',
                              }}>
                                فیلتر گزینشی (لیست سفید)
                              </span>
                              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                {(mapping.includedKeys || mapping.currencies || []).length.toLocaleString('fa-IR')} قلم انتخابی
                              </span>
                            </div>
                          ) : excluded.length > 0 ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '2px 8px', borderRadius: '6px',
                              background: 'rgba(244,63,94,0.12)', color: '#f43f5e',
                              fontSize: '11px', fontWeight: '700',
                            }}>
                              {excluded.length.toLocaleString('fa-IR')} مورد مستثنی
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>کامل (بدون فیلتر)</span>
                          )}
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span className={`status-dot ${src.isActive ? 'active' : 'inactive'}`} />
                              <span style={{ fontSize: '11px', marginRight: '4px' }}>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                            </div>
                            {(() => {
                              const dc = typeof src.displayConfig === 'string'
                                ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
                                : (src.displayConfig || {});
                              return dc.showOnHomePage === false ? (
                                <span style={{ fontSize: '9.5px', color: '#f43f5e', background: 'rgba(244,63,94,0.12)', padding: '1px 5px', borderRadius: '4px', width: 'fit-content' }}>
                                  مخفی در خانه
                                </span>
                              ) : (
                                <span style={{ fontSize: '9.5px', color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 5px', borderRadius: '4px', width: 'fit-content' }}>
                                  نمایش در خانه
                                </span>
                              );
                            })()}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            {/* Data Explorer button */}
                            <button
                              type="button"
                              className="btn-action-icon"
                              title="کاوشگر زنده داده‌ها (مشاهده و جستجو در اقلام)"
                              onClick={() => handleOpenExplorer(src)}
                              style={{ color: '#818cf8', background: 'rgba(99,102,241,0.12)' }}
                            >
                              <Eye size={15} />
                            </button>

                            {/* Live test button */}
                            <button
                              type="button"
                              className="btn-action-icon"
                              title="تست اتصال و استخراج آنی"
                              onClick={() => handleTestRowSource(src)}
                              disabled={rowTestingId === src.id}
                            >
                              <PlayCircle size={15} className={rowTestingId === src.id ? 'spin-anim' : ''} />
                            </button>

                            {/* Edit schema button */}
                            <button
                              type="button"
                              className="btn-action-icon"
                              title="ویرایش نگاشت و تنظیمات فید"
                              onClick={() => handleOpenEditMultiFeed(src)}
                            >
                              <Edit3 size={15} />
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              className="btn-action-icon danger"
                              title="حذف این فید"
                              onClick={() => handleDeleteSource(src.id, src.name)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

        {/* ── SECTION 4: Add/Edit Modal ───────────────────────────────────── */}
        <Modal
          isOpen={sourceModalOpen}
          onClose={() => setSourceModalOpen(false)}
          title={editingSourceId ? 'ویرایش سورس قیمت' : 'افزودن سورس قیمت جدید'}
          icon={<Radio size={16} style={{ color: 'var(--accent-blue)' }} />}
          maxWidth="640px"
          className="source-edit-modal-card"
          onSubmit={handleSaveModalSource}
          footer={
            <div className="modal-actions-right">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setSourceModalOpen(false)}
                disabled={modalSaving}
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={modalSaving}
                className="btn-primary"
              >
                <Save size={14} className={modalSaving ? 'spin-anim' : ''} />
                <span>{modalSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره سورس قیمت'}</span>
              </button>
            </div>
          }
        >
                <div className="form-group">
                  <label>نام سورس:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: دلار هرات فردایی، سبزه میدان، صرافی زرما..."
                    value={sourceForm.name}
                    onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                  />
                </div>

                {/* 2. Type & Unit */}
                <div className="form-row-2">
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0 }}>نوع / دسته‌بندی سورس (Type / Category):</label>
                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>تایپ آزاد دلخواه یا انتخاب از لیست</span>
                    </div>
                    <input
                      type="text"
                      list="dynamic-source-types-list"
                      required
                      placeholder="مثال: دلار، طلا، خودرو، مسکن، رمزارز، آهن‌آلات..."
                      value={sourceForm.priceType}
                      onChange={(e) => setSourceForm({ ...sourceForm, priceType: e.target.value.trim() })}
                    />
                    <datalist id="dynamic-source-types-list">
                      {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => (
                        <option key={key} value={key}>{info.label || key}</option>
                      ))}
                    </datalist>
                  </div>

                  <div className="form-group">
                    <label>واحد نمایشی قیمت (Unit):</label>
                    <input
                      type="text"
                      placeholder="مثال: تومان، دلار ($)، ریال، درصد..."
                      value={sourceForm.unit || 'تومان'}
                      onChange={(e) => setSourceForm({ ...sourceForm, unit: e.target.value })}
                    />
                  </div>
                </div>

                {/* 3. Protocol Selector */}
                <div className="form-group">
                  <label>پروتکل دریافت داده:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      className={`btn-secondary ${sourceForm.sourceType === 'telegram' ? 'btn-primary' : ''}`}
                      onClick={() => setSourceForm({ ...sourceForm, sourceType: 'telegram' })}
                      style={{ padding: '9px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Send size={14} />
                      <span>متن دریافتی (کانال عمومی تلگرام)</span>
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary ${sourceForm.sourceType === 'api_url' ? 'btn-primary' : ''}`}
                      onClick={() => setSourceForm({ ...sourceForm, sourceType: 'api_url' })}
                      style={{ padding: '9px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Globe size={14} />
                      <span>وب‌سرویس ساختاریافته (REST API JSON)</span>
                    </button>
                  </div>
                </div>

                {/* 4. Protocol Details */}
                {sourceForm.sourceType === 'telegram' ? (
                  <>
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ margin: 0 }}>آیدی کانال عمومی تلگرام:</label>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>بدون نیاز به توکن ربات</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span className="input-prefix" style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', color: 'var(--text-muted)' }}>@</span>
                        <input
                          type="text"
                          required
                          placeholder="herat_rate یا tahran_sabza"
                          value={sourceForm.channelUsername}
                          onChange={(e) => setSourceForm({ ...sourceForm, channelUsername: e.target.value.replace(/^@/, '').trim() })}
                          style={{ flex: 1, direction: 'ltr', textAlign: 'left' }}
                        />
                      </div>
                    </div>

                    {/* Live Telegram Text Viewer */}
                    {modalTestResult?.rawSnippet && sourceForm.sourceType === 'telegram' && (
                      <div className="live-text-viewer-card">
                        <div className="live-text-viewer-header">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Activity size={13} style={{ color: '#38bdf8' }} />
                            <span>آخرین پیام دریافتی از کانال:</span>
                          </span>
                          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>الگوی قیمت را بر اساس این متن بنویسید</span>
                        </div>
                        <pre className="live-text-viewer-pre">{modalTestResult.rawSnippet}</pre>
                      </div>
                    )}

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ margin: 0 }}>الگوی استخراج قیمت از متن (Regex Pattern):</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>فلگ چندخطی ims</span>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="مثال: ([\d,]+)\s*فروش یا فروش\s*:\s*([\d,]+)"
                        value={sourceForm.regexPattern}
                        onChange={(e) => setSourceForm({ ...sourceForm, regexPattern: e.target.value })}
                        style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                      />
                      <div className="quick-regex-chips-wrap">
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>الگوهای سریع و پرکاربرد:</span>
                        {[
                          { label: 'عدد قبل از «فروش»', p: '([\\d,]+)\\s*فروش' },
                          { label: 'فروش : عدد', p: 'فروش\\s*:\\s*([\\d,]+)' },
                          { label: 'قیمت : عدد', p: 'قیمت\\s*:\\s*([\\d,]+)' },
                          { label: 'نرخ : عدد', p: 'نرخ\\s*:\\s*([\\d,]+)' },
                          { label: 'اولین عدد در متن', p: '([\\d,]+)' },
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="quick-regex-chip"
                            onClick={() => setSourceForm({ ...sourceForm, regexPattern: chip.p })}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>آدرس وب‌سرویس (API URL):</label>
                      <input
                        type="url"
                        required
                        placeholder="https://api.example.com/rates/live"
                        value={sourceForm.apiUrl}
                        onChange={(e) => setSourceForm({ ...sourceForm, apiUrl: e.target.value.trim() })}
                        style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                      />
                    </div>

                    {/* Live JSON snippet */}
                    {modalTestResult?.rawSnippet && sourceForm.sourceType === 'api_url' && (
                      <div className="live-text-viewer-card">
                        <div className="live-text-viewer-header">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Code size={13} style={{ color: '#818cf8' }} />
                            <span>پاسخ خام وب‌سرویس JSON:</span>
                          </span>
                        </div>
                        <pre className="live-text-viewer-pre">{modalTestResult.rawSnippet}</pre>
                      </div>
                    )}

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ margin: 0 }}>مسیر فیلد قیمت در JSON (JSON Price Path):</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>مثال: price یا rates.USD یا data.val</span>
                      </div>
                      <input
                        type="text"
                        placeholder="price یا rates.USD یا data.price"
                        value={sourceForm.jsonPath}
                        onChange={(e) => setSourceForm({ ...sourceForm, jsonPath: e.target.value.trim() })}
                        style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                      />
                    </div>
                  </>
                )}

                {/* Multiplier & Interval */}
                <div className="form-row-2">
                  <div className="form-group">
                    <label>ضریب تبدیل ریاضی (اختیاری):</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="مثلاً ۰.۱ برای ریال به تومان یا ۱ برای بدون تغییر"
                      value={sourceForm.fieldMapping?.multiplier !== undefined ? sourceForm.fieldMapping.multiplier : ''}
                      onChange={(e) => setSourceForm({
                        ...sourceForm,
                        fieldMapping: { ...(sourceForm.fieldMapping || {}), multiplier: e.target.value ? Number(e.target.value) : '' },
                      })}
                      style={{ direction: 'ltr', textAlign: 'center' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>بازه استخراج خودکار (دقیقه):</label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={sourceForm.fetchIntervalMinutes}
                      onChange={(e) => setSourceForm({ ...sourceForm, fetchIntervalMinutes: e.target.value })}
                      style={{ direction: 'ltr', textAlign: 'center' }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ display: 'flex', gap: '24px', padding: '6px 0' }}>
                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={sourceForm.isActive}
                      onChange={(e) => setSourceForm({ ...sourceForm, isActive: e.target.checked })}
                    />
                    <span>سورس فعال باشد</span>
                  </label>

                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={sourceForm.isPrimary}
                      onChange={(e) => setSourceForm({ ...sourceForm, isPrimary: e.target.checked })}
                    />
                    <span>سورس مرجع این نرخ</span>
                  </label>

                  <label className="admin-checkbox-label" title="آیا این نماد در صفحه اول (نرخ و حباب) نمایش داده شود؟">
                    <input
                      type="checkbox"
                      checked={sourceForm.showOnHomePage !== false}
                      onChange={(e) => setSourceForm({ ...sourceForm, showOnHomePage: e.target.checked })}
                    />
                    <span style={{ fontWeight: '600', color: sourceForm.showOnHomePage !== false ? 'var(--accent-green, #10b981)' : 'var(--text-muted)' }}>
                      نمایش نماد در صفحه اول
                    </span>
                  </label>
                </div>

                {/* Modal Test Area */}
                <div className="modal-test-area">
                  <button
                    type="button"
                    onClick={handleTestModalSource}
                    disabled={modalTesting}
                    className="btn-sm site-link"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontWeight: '700' }}
                  >
                    <PlayCircle size={15} className={modalTesting ? 'spin-anim' : ''} />
                    <span>{modalTesting ? 'در حال برقراری ارتباط و پردازش...' : 'تست اتصال و استخراج قبل از ذخیره'}</span>
                  </button>

                  {modalTestResult && modalTestResult.success && (
                    <div className="live-extracted-price-callout" style={{ marginTop: '10px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                        <span>قیمت با موفقیت استخراج شد:</span>
                      </span>
                      <span className="live-extracted-price-val">
                        {modalTestResult.price !== undefined ? Number(modalTestResult.price).toLocaleString('fa-IR') : '-'} {sourceForm.unit || 'تومان'}
                      </span>
                    </div>
                  )}

                  {modalTestResult && !modalTestResult.success && (
                    <div className="error-callout" style={{ fontSize: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                      <AlertCircle size={16} style={{ color: '#f43f5e', flexShrink: 0 }} />
                      <span>{modalTestResult.error}</span>
                    </div>
                  )}
                </div>

        </Modal>

        {/* ── Multi-Output Feed Modal (Clean & Simple) ─────────────────────────── */}
        <Modal
          isOpen={multiWizardOpen}
          onClose={() => setMultiWizardOpen(false)}
          title={multiForm.id ? `ویرایش فید چند خروجی: ${multiForm.name}` : "افزودن فید داده چند خروجی (فارکس / بورس)"}
          icon={<Layers size={18} style={{ color: "var(--accent-indigo, #818cf8)" }} />}
          maxWidth="720px"
          className="source-edit-modal-card"
          onSubmit={handleSaveMultiSource}
          footer={
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: "10px" }}>
              <button
                type="button"
                onClick={handleTestMultiSource}
                disabled={multiTesting || !multiForm.apiUrl}
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "7px 14px" }}
              >
                <PlayCircle size={14} className={multiTesting ? "spin-anim" : ""} />
                <span>{multiTesting ? "در حال تست..." : "تست اتصال و پیش‌نمایش"}</span>
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setMultiWizardOpen(false)}
                  disabled={savingMultiSource}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={savingMultiSource || !multiForm.name || !multiForm.apiUrl}
                  className="btn-primary"
                  style={{ minWidth: "130px" }}
                >
                  <Save size={14} className={savingMultiSource ? "spin-anim" : ""} />
                  <span>{savingMultiSource ? "در حال ذخیره..." : "ذخیره فید"}</span>
                </button>
              </div>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="form-group">
              <label className="form-label">عنوان فید / سورس</label>
              <input
                type="text"
                placeholder="مثال: نرخ‌های فارکس یا بورس تهران"
                value={multiForm.name}
                onChange={(e) => setMultiForm(prev => ({ ...prev, name: e.target.value }))}
                className="form-input"
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">نوع فید</label>
                <select
                  value={multiForm.priceType}
                  onChange={(e) => {
                    const val = e.target.value;
                    let defaultUrl = multiForm.apiUrl;
                    if (val === "forex" && (!defaultUrl || defaultUrl.includes("brsapi"))) {
                      defaultUrl = "https://open.er-api.com/v6/latest/USD";
                    } else if (val === "bourse" && (!defaultUrl || defaultUrl.includes("open.er-api.com"))) {
                      defaultUrl = "https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1";
                    }
                    setMultiForm(prev => ({
                      ...prev,
                      priceType: val,
                      apiUrl: defaultUrl,
                    }));
                  }}
                  className="form-input"
                >
                  <option value="forex">ارزهای جهانی فارکس (Open ER-API)</option>
                  <option value="bourse">بورس اوراق بهادار تهران (TSETMC)</option>
                  <option value="custom">سایر فیدهای چند خروجی</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">دوره به‌روزرسانی (دقیقه)</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={multiForm.fetchIntervalMinutes}
                  onChange={(e) => setMultiForm(prev => ({ ...prev, fetchIntervalMinutes: parseInt(e.target.value, 10) || 60 }))}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">آدرس API Endpoint</label>
              <input
                type="text"
                dir="ltr"
                placeholder="https://..."
                value={multiForm.apiUrl}
                onChange={(e) => setMultiForm(prev => ({ ...prev, apiUrl: e.target.value }))}
                className="form-input"
                required
              />
              <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-sm"
                  style={{ fontSize: "11px" }}
                  onClick={() => setMultiForm(prev => ({
                    ...prev,
                    name: prev.name || "نرخ‌های جهانی فارکس (Open ER-API)",
                    priceType: "forex",
                    apiUrl: "https://open.er-api.com/v6/latest/USD",
                  }))}
                >
                  تنظیم آدرس فارکس
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  style={{ fontSize: "11px" }}
                  onClick={() => setMultiForm(prev => ({
                    ...prev,
                    name: prev.name || "بورس اوراق بهادار تهران (TSETMC)",
                    priceType: "bourse",
                    apiUrl: "https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1",
                  }))}
                >
                  تنظیم آدرس بورس
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <input
                type="checkbox"
                id="multi_active"
                checked={multiForm.isActive}
                onChange={(e) => setMultiForm(prev => ({ ...prev, isActive: e.target.checked }))}
              />
              <label htmlFor="multi_active" style={{ fontSize: "12px", cursor: "pointer" }}>
                فید فعال باشد و در فواصل زمانی مشخص داده‌ها به‌روزرسانی شوند
              </label>
            </div>

            {/* Test Results Display */}
            {multiTestResult && (
              <div style={{ marginTop: "10px", padding: "12px", borderRadius: "8px", background: multiTestResult.success ? "rgba(16, 185, 129, 0.08)" : "rgba(244, 63, 94, 0.08)", border: `1px solid ${multiTestResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: "700", color: multiTestResult.success ? "#10b981" : "#f43f5e" }}>
                    {multiTestResult.success ? `✓ ${multiTestResult.message}` : `✗ خطا: ${multiTestResult.error}`}
                  </span>
                </div>

                {multiTestResult.success && Array.isArray(multiTestResult.sampleItems) && (
                  <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                    <table className="users-table" style={{ width: "100%", fontSize: "11.5px" }}>
                      <thead>
                        <tr>
                          <th>نماد</th>
                          <th>اسم</th>
                          <th>قیمت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiTestResult.sampleItems.slice(0, 15).map((item, idx) => (
                          <tr key={idx}>
                            <td><strong>{item.s || item.symbol}</strong></td>
                            <td>{item.n || item.name}</td>
                            <td style={{ color: "#10b981", fontWeight: "700" }}>
                              {Number(item.p || item.price).toLocaleString("fa-IR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>

        {/* ── Feed Data Explorer Modal ────────────────────────────────────── */}
        <Modal
          isOpen={explorerModalOpen}
          onClose={() => setExplorerModalOpen(false)}
          title={`کاوشگر داده‌های زنده: ${explorerFeed?.name || ''}`}
          icon={<Eye size={18} style={{ color: '#818cf8' }} />}
          maxWidth="900px"
          className="source-edit-modal-card"
          footer={
            <div className="modal-actions-right">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setExplorerModalOpen(false)}
              >
                بستن
              </button>
            </div>
          }
        >
          {explorerFeed && (
            <div>
              {/* Toolbar */}
              <div className="data-explorer-toolbar">
                <div className="data-explorer-search">
                  <Search size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="جستجو در بین اقلام (کد، نام، دسته)..."
                    value={explorerSearch}
                    onChange={(e) => setExplorerSearch(e.target.value)}
                    style={{ width: '100%', paddingRight: '32px', fontSize: '12px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    مجموع: {explorerItems.length.toLocaleString('fa-IR')} رکورد
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenExplorer(explorerFeed)}
                    disabled={explorerLoading}
                    className="btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RefreshCw size={12} className={explorerLoading ? 'spin-anim' : ''} />
                    <span>بروزرسانی زنده</span>
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="data-explorer-table-wrap">
                {explorerLoading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="spin-anim" style={{ margin: '0 auto 8px', color: '#818cf8' }} />
                    <p>در حال دریافت آخرین داده‌های فید از منبع...</p>
                  </div>
                ) : explorerItems.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    هیچ رکوردی برای نمایش یافت نشد.
                  </div>
                ) : (
                  <table className="users-table" style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>نماد</th>
                        <th>نام دارایی</th>
                        <th>آخرین قیمت (تومان)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {explorerItems
                        .filter((item) => {
                          if (!explorerSearch.trim()) return true;
                          const q = explorerSearch.toLowerCase();
                          return (
                            (item.s && String(item.s).toLowerCase().includes(q)) ||
                            (item.n && String(item.n).toLowerCase().includes(q))
                          );
                        })
                        .slice(0, 100)
                        .map((item, idx) => (
                          <tr key={idx}>
                            <td><strong>{item.s}</strong></td>
                            <td>{item.n}</td>
                            <td style={{ color: 'var(--accent-green, #10b981)', fontWeight: '700' }}>
                              {Number(item.priceTomans || item.p || 0).toLocaleString('fa-IR')}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </Modal>
    </>
  );
}
