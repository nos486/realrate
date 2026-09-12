import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  LineChart,
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
  apiGetPriceHistory,
  apiGetSourceTypes,
  apiSaveSourceType,
  apiDeleteSourceType,
} from '../api/client.js';
import PriceHistoryChart from '../components/PriceHistoryChart.jsx';
import UniversalAssetSearch from '../components/UniversalAssetSearch.jsx';

// PRICE_TYPE_INFO is now computed dynamically inside the component from DB-loaded sourceTypes
// See: const PRICE_TYPE_INFO = useMemo(...) inside PriceSourcesPage()

// Generic empty fallback — types are 100% dynamic from DB or user input
const PRICE_TYPE_INFO_FALLBACK = {};


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
  priceType: '',
  unit: 'تومان',
  sourceType: 'api_url',
  apiUrl: '',
  fetchIntervalMinutes: 60,
  isActive: true,
  showOnHomePage: true,
  displayConfig: null,
  excludedOutputs: [],
  arrayPath: '',
  idField: '',
  idLabel: 'شناسه / کد',
  titleField: '',
  titleLabel: 'عنوان / نام',
  priceField: '',
  priceLabel: 'قیمت اصلی',
  altPriceField: '',
  altPriceLabel: 'قیمت دوم / مبنا',
  changePercentField: '',
  changePercentLabel: 'درصد تغییرات',
  categoryField: '',
  categoryLabel: 'دسته‌بندی / سازنده',
  extraField: '',
  extraLabel: 'اطلاعات تکمیلی',
  multiplier: 1,
  priceUnit: 'toman',
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
  const chartSectionRef = useRef(null);

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

  // View Switcher: 'single' (Base Rates) vs 'multi' (Multi-Output Feeds Hub)
  const [activeTabSection, setActiveTabSection] = useState('single');
  const [multiSearch, setMultiSearch] = useState('');

  // Multi-Output Wizard States
  const [multiWizardOpen, setMultiWizardOpen] = useState(false);
  const [multiForm, setMultiForm] = useState(DEFAULT_MULTI_FEED_FORM);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectResult, setInspectResult] = useState(null);
  const [multiTesting, setMultiTesting] = useState(false);
  const [multiTestResult, setMultiTestResult] = useState(null);
  const [savingMultiSource, setSavingMultiSource] = useState(false);
  const [newMultiExcludedEntry, setNewMultiExcludedEntry] = useState('');

  // Data Explorer Modal States
  const [explorerModalOpen, setExplorerModalOpen] = useState(false);
  const [explorerFeed, setExplorerFeed] = useState(null);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerItems, setExplorerItems] = useState([]);

  // Dedicated Source Selection for History Chart (Separate per source)
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [chartRange, setChartRange] = useState('24h');
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
        // If no source is selected yet, select the first single-output source
        if (!selectedSourceId && res.sources.length > 0) {
          const firstSingle = res.sources.find((s) => !isSourceMultiOutput(s, PRICE_TYPE_INFO));
          if (firstSingle) {
            setSelectedSourceId(firstSingle.id);
          } else {
            setSelectedSourceId(res.sources[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Error loading price sources:', e);
      showMsg('خطا در دریافت لیست سورس‌ها: ' + e.message, 'error');
    } finally {
      setLoadingSources(false);
    }
  };

  // Load History for the selected source strictly (only single-output sources)
  const loadPriceHistory = async (targetSourceId = selectedSourceId, range = chartRange) => {
    if (!targetSourceId) {
      setHistoryData([]);
      return;
    }
    const targetSource = sources.find((s) => s.id === targetSourceId);
    if (targetSource && isSourceMultiOutput(targetSource, PRICE_TYPE_INFO)) {
      setHistoryData([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await apiGetPriceHistory({
        sourceId: targetSourceId,
        range,
        limit: range === '1m' ? 1000 : 300,
      });
      if (res.success && Array.isArray(res.history)) {
        setHistoryData(res.history);
      } else {
        setHistoryData([]);
      }
    } catch (e) {
      console.error('Error loading price history for source:', e);
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadSourceTypes();
    loadSources();
  }, []);

  useEffect(() => {
    if (selectedSourceId) {
      loadPriceHistory(selectedSourceId, chartRange);
    }
  }, [selectedSourceId, chartRange]);

  // Partition sources into Single-Rate Base Sources vs Multi-Output Feeds
  const singleSources = useMemo(() => {
    return sources.filter((s) => !isSourceMultiOutput(s, PRICE_TYPE_INFO));
  }, [sources, PRICE_TYPE_INFO]);

  const multiSources = useMemo(() => {
    return sources.filter((s) => isSourceMultiOutput(s, PRICE_TYPE_INFO));
  }, [sources, PRICE_TYPE_INFO]);

  // Active Selected Source Object (strictly single-output source for chart/metrics)
  const activeSelectedSource = useMemo(() => {
    return singleSources.find((s) => s.id === selectedSourceId) || singleSources[0] || null;
  }, [singleSources, selectedSourceId]);

  // Price type info filtered strictly for single-output sources
  const singlePriceTypeInfo = useMemo(() => {
    const map = {};
    for (const [key, info] of Object.entries(PRICE_TYPE_INFO)) {
      if (info?.category !== 'multi_output' && key !== 'bourse' && key !== 'bourse_fund' && key !== 'forex') {
        map[key] = info;
      }
    }
    return map;
  }, [PRICE_TYPE_INFO]);

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
        if (selectedSourceId) {
          await loadPriceHistory(selectedSourceId, chartRange);
        }
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
      priceType: sourceTypes.find(st => st.category === 'multi_output')?.id || 'bourse',
      showOnHomePage: true,
    });
    setInspectResult(null);
    setMultiTestResult(null);
    setNewMultiExcludedEntry('');
    setMultiWizardOpen(true);
  };

  const handleOpenEditMultiFeed = (src) => {
    let mapping = {};
    if (src.fieldMapping) {
      mapping = typeof src.fieldMapping === 'string' ? JSON.parse(src.fieldMapping) : src.fieldMapping;
    }
    const labels = mapping.labels || {};
    let excluded = [];
    if (src.excludedOutputs) {
      excluded = Array.isArray(src.excludedOutputs)
        ? src.excludedOutputs
        : (typeof src.excludedOutputs === 'string' ? JSON.parse(src.excludedOutputs || '[]') : []);
    }
    const displayCfg = typeof src.displayConfig === 'string'
      ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
      : (src.displayConfig || {});
    const showOnHomePage = displayCfg.showOnHomePage !== undefined ? Boolean(displayCfg.showOnHomePage) : true;

    setMultiForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'bourse',
      sourceType: 'api_url',
      apiUrl: src.apiUrl || src.endpoint || '',
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 3600) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      showOnHomePage,
      displayConfig: src.displayConfig || null,
      excludedOutputs: excluded,
      arrayPath: mapping.arrayPath !== undefined ? mapping.arrayPath : '',
      idField: mapping.idField || mapping.symbolField || '',
      idLabel: labels.id || 'شناسه / کد',
      titleField: mapping.titleField || mapping.nameField || '',
      titleLabel: labels.title || 'عنوان / نام',
      priceField: mapping.priceField || '',
      priceLabel: labels.price || 'قیمت اصلی',
      altPriceField: mapping.altPriceField || '',
      altPriceLabel: labels.altPrice || 'قیمت مقایسه‌ای',
      changePercentField: mapping.changePercentField || '',
      changePercentLabel: labels.changePercent || 'درصد تغییرات',
      categoryField: mapping.categoryField || '',
      categoryLabel: labels.category || 'دسته‌بندی / برند',
      extraField: mapping.extraField || mapping.volumeField || '',
      extraLabel: labels.extra || 'مشخصات / حجم',
      priceUnit: mapping.priceUnit || 'toman',
      multiplier: mapping.multiplier !== undefined ? mapping.multiplier : (mapping.priceUnit === 'rial' ? 0.1 : 1),
    });
    setInspectResult(null);
    setMultiTestResult(null);
    setNewMultiExcludedEntry('');
    setMultiWizardOpen(true);
  };

  const handleInspectApi = async () => {
    if (!multiForm.apiUrl || !multiForm.apiUrl.startsWith('http')) {
      alert('لطفاً یک آدرس وب‌سرویس معتبر با http یا https وارد کنید.');
      return;
    }
    setInspectLoading(true);
    try {
      const res = await apiInspectApiSource(multiForm.apiUrl);
      if (res.success && res.candidateArrays && res.candidateArrays.length > 0) {
        setInspectResult(res);
        handleSelectCandidate(res.candidateArrays[0]);
        showMsg(`ساختار وب‌سرویس تحلیل شد: ${res.candidateArrays.length} آرایه کشف شد.`, 'success');
      } else {
        alert('هیچ آرایه‌ای از اشیاء در پاسخ وب‌سرویس یافت نشد.');
      }
    } catch (e) {
      alert('خطا در تحلیل ساختار وب‌سرویس: ' + e.message);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleSelectCandidate = (cand) => {
    if (!cand) return;
    const keys = cand.keys || [];
    const findKey = (candidates) => keys.find(k => candidates.includes(k.toLowerCase())) || '';

    const autoId = findKey(['id', 'symbol', 'code', 'slug', 'l18', 'key', 'ticker']);
    const autoTitle = findKey(['name', 'title', 'car_name', 'model', 'l30', 'fa_name', 'label', 'persian_name']);
    const autoPrice = findKey(['price', 'lastprice', 'pl', 'market_price', 'close', 'last_price', 'current_price']);
    const autoAltPrice = findKey(['alt_price', 'pc', 'factory_price', 'closeprice', 'open', 'prev_price']);
    const autoChangePct = findKey(['percent', 'change_percent', 'plp', 'change_pct', 'pct', 'diff_percent', 'plc']);
    const autoCategory = findKey(['brand', 'category', 'group', 'company', 'industry', 'market', 'type']);
    const autoExtra = findKey(['volume', 'tno', 'year', 'volume24h', 'count', 'specs']);

    setMultiForm(prev => ({
      ...prev,
      arrayPath: cand.path,
      idField: prev.idField || autoId || (keys[0] || ''),
      titleField: prev.titleField || autoTitle || (keys[1] || keys[0] || ''),
      priceField: prev.priceField || autoPrice || '',
      altPriceField: prev.altPriceField || autoAltPrice || '',
      changePercentField: prev.changePercentField || autoChangePct || '',
      categoryField: prev.categoryField || autoCategory || '',
      extraField: prev.extraField || autoExtra || '',
    }));
  };

  const previewMappedItems = useMemo(() => {
    if (!inspectResult || !inspectResult.candidateArrays) return [];
    const cand = inspectResult.candidateArrays.find(c => c.path === multiForm.arrayPath) || inspectResult.candidateArrays[0];
    if (!cand || !Array.isArray(cand.sampleItems)) return [];

    const isRial = multiForm.priceUnit === 'rial';
    const mult = Number(multiForm.multiplier) > 0 ? Number(multiForm.multiplier) : (isRial ? 0.1 : 1);
    const excludedSet = new Set((multiForm.excludedOutputs || []).map(x => String(x).toLowerCase().trim()));

    return cand.sampleItems.map((raw, idx) => {
      const idVal = String(raw[multiForm.idField] || raw.id || raw.symbol || raw.code || idx + 1);
      const titleVal = String(raw[multiForm.titleField] || raw.name || raw.title || idVal);
      const rawPrice = Number(raw[multiForm.priceField]) || 0;
      const finalPrice = Math.round(rawPrice * mult);
      const rawAlt = Number(raw[multiForm.altPriceField]) || 0;
      const finalAlt = rawAlt > 0 ? Math.round(rawAlt * mult) : 0;
      const changePct = Number(raw[multiForm.changePercentField]) || 0;
      const catVal = String(raw[multiForm.categoryField] || '');
      const extraVal = String(raw[multiForm.extraField] || '');

      const isExcluded = excludedSet.has(idVal.toLowerCase()) || excludedSet.has(titleVal.toLowerCase());

      return {
        id: idVal,
        title: titleVal,
        price: finalPrice,
        altPrice: finalAlt,
        changePct,
        category: catVal,
        extra: extraVal,
        isExcluded,
      };
    });
  }, [inspectResult, multiForm.arrayPath, multiForm.idField, multiForm.titleField, multiForm.priceField, multiForm.altPriceField, multiForm.changePercentField, multiForm.categoryField, multiForm.extraField, multiForm.priceUnit, multiForm.multiplier, multiForm.excludedOutputs]);

  const handleToggleExcludeInPreview = (item) => {
    const key = (item.id || item.title || '').trim().toLowerCase();
    if (!key) return;
    setMultiForm(prev => {
      const current = prev.excludedOutputs || [];
      if (current.includes(key)) {
        return { ...prev, excludedOutputs: current.filter(x => x !== key) };
      } else {
        return { ...prev, excludedOutputs: [...current, key] };
      }
    });
  };

  const handleTestMultiSource = async () => {
    if (!multiForm.apiUrl) {
      alert('لطفاً آدرس وب‌سرویس را وارد کنید.');
      return;
    }
    setMultiTesting(true);
    setMultiTestResult(null);
    try {
      const fieldMapping = {
        isMultiOutput: true,
        arrayPath: multiForm.arrayPath || '',
        idField: multiForm.idField,
        titleField: multiForm.titleField || multiForm.idField,
        priceField: multiForm.priceField,
        altPriceField: multiForm.altPriceField || '',
        changePercentField: multiForm.changePercentField || '',
        categoryField: multiForm.categoryField || '',
        extraField: multiForm.extraField || '',
        priceUnit: multiForm.priceUnit || 'toman',
        multiplier: Number(multiForm.multiplier) || 1,
        labels: {
          id: multiForm.idLabel || 'شناسه / کد',
          title: multiForm.titleLabel || 'عنوان / نام',
          price: multiForm.priceLabel || 'قیمت اصلی',
          altPrice: multiForm.altPriceLabel || 'قیمت مقایسه‌ای',
          changePercent: multiForm.changePercentLabel || 'درصد تغییرات',
          category: multiForm.categoryLabel || 'دسته‌بندی / برند',
          extra: multiForm.extraLabel || 'مشخصات / حجم',
        },
      };

      const res = await apiTestPriceSource({
        sourceType: 'api_url',
        priceType: multiForm.priceType,
        endpoint: multiForm.apiUrl,
        name: multiForm.name || 'تست فید',
        fieldMapping,
        excludedOutputs: multiForm.excludedOutputs || [],
      });
      setMultiTestResult(res);
    } catch (err) {
      setMultiTestResult({ success: false, error: err.message });
    } finally {
      setMultiTesting(false);
    }
  };

  const handleSaveMultiSource = async (e) => {
    if (e) e.preventDefault();
    if (!multiForm.name.trim()) {
      alert('لطفاً نام سورس را وارد کنید.');
      return;
    }
    if (!multiForm.apiUrl.trim()) {
      alert('لطفاً آدرس API وب‌سرویس را وارد کنید.');
      return;
    }
    if (!multiForm.idField || !multiForm.priceField) {
      alert('لطفاً حداقل فیلد شناسه و فیلد قیمت اصلی را انتخاب کنید.');
      return;
    }

    setSavingMultiSource(true);
    try {
      const fieldMapping = {
        isMultiOutput: true,
        arrayPath: multiForm.arrayPath || '',
        idField: multiForm.idField,
        titleField: multiForm.titleField || multiForm.idField,
        priceField: multiForm.priceField,
        altPriceField: multiForm.altPriceField || '',
        changePercentField: multiForm.changePercentField || '',
        categoryField: multiForm.categoryField || '',
        extraField: multiForm.extraField || '',
        priceUnit: multiForm.priceUnit || 'toman',
        multiplier: Number(multiForm.multiplier) || 1,
        labels: {
          id: multiForm.idLabel || 'شناسه / کد',
          title: multiForm.titleLabel || 'عنوان / نام',
          price: multiForm.priceLabel || 'قیمت اصلی',
          altPrice: multiForm.altPriceLabel || 'قیمت مقایسه‌ای',
          changePercent: multiForm.changePercentLabel || 'درصد تغییرات',
          category: multiForm.categoryLabel || 'دسته‌بندی / برند',
          extra: multiForm.extraLabel || 'مشخصات / حجم',
        },
      };

      const prevDisplay = typeof multiForm.displayConfig === 'string'
        ? (() => { try { return JSON.parse(multiForm.displayConfig); } catch { return {}; } })()
        : (multiForm.displayConfig || {});
      const displayConfig = {
        ...prevDisplay,
        showOnHomePage: multiForm.showOnHomePage !== false,
      };

      const payload = {
        id: multiForm.id,
        name: multiForm.name.trim(),
        priceType: multiForm.priceType || 'custom_feed',
        sourceType: 'api_url',
        endpoint: multiForm.apiUrl.trim(),
        fetchIntervalMinutes: Number(multiForm.fetchIntervalMinutes) || 60,
        isActive: multiForm.isActive,
        isPrimary: false,
        fieldMapping,
        excludedOutputs: multiForm.excludedOutputs || [],
        displayConfig,
      };

      const res = await apiSavePriceSource(payload);
      if (res.success) {
        showMsg(`سورس چند خروجی «${multiForm.name}» با موفقیت ذخیره شد.`, 'success');
        setMultiWizardOpen(false);
        await loadSources();
        if (multiForm.priceType && !sourceTypes.some(st => st.id === multiForm.priceType)) {
          apiSaveSourceType({
            id: multiForm.priceType,
            label: multiForm.priceType,
            category: 'multi_output',
            unit: multiForm.priceUnit === 'rial' ? 'ریال' : 'تومان',
            badgeColor: 'indigo',
          }).then(() => loadSourceTypes()).catch(() => {});
        }
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

    let items = [];
    if (src.lastMultiData) {
      const multi = typeof src.lastMultiData === 'string' ? JSON.parse(src.lastMultiData) : src.lastMultiData;
      items = multi.sampleItems || multi.items || multi.compactList || [];
    }

    if (items.length > 0) {
      setExplorerItems(items);
      return;
    }

    setExplorerLoading(true);
    try {
      const testRes = await apiTestPriceSource(src);
      if (testRes.success && (testRes.sampleItems || testRes.compactList)) {
        setExplorerItems(testRes.sampleItems || testRes.compactList || []);
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
        if (res.source?.id) {
          setSelectedSourceId(res.source.id);
        }
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

        if (selectedSourceId === src.id) {
          loadPriceHistory(src.id, chartRange);
        }
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

  // Select Source for Dedicated Chart (strictly single-output)
  const handleSelectSourceForChart = (src) => {
    if (isSourceMultiOutput(src, PRICE_TYPE_INFO)) {
      handleOpenExplorer(src);
      showMsg(`نمودار و تاریخچه قیمت فقط برای سورس‌های تک‌خروجی فعال است. کاوشگر داده‌های ${src.name} باز شد.`, 'info');
      return;
    }
    setSelectedSourceId(src.id);
    if (chartSectionRef.current) {
      chartSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            ) : (
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

      {/* ── Top-Level View Switcher Bar (Base Rates vs Multi-Output Feeds Hub) ── */}
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
                    const isSelectedInChart = src.id === selectedSourceId;

                    return (
                      <React.Fragment key={src.id}>
                        <tr className={isSelectedInChart ? 'active-chart-row' : ''}>
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
                                onClick={() => handleSelectSourceForChart(src)}
                                className="action-icon-btn chart-btn"
                                title="مشاهده نمودار اختصاصی این سورس"
                              >
                                <LineChart size={15} />
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
                                        <>قیمت با موفقیت استخراج و در تاریخچه اختصاصی ثبت شد: <strong>{formatNum(rowResult.price, src.priceType)} {getPriceUnit(src.priceType)}</strong></>
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

        {/* ── SECTION 2: Universal Data Explorer & Dedicated Analytical Chart (Moved to bottom) ───────── */}
        <section ref={chartSectionRef} className="sources-chart-section" style={{ marginTop: '28px' }}>
          <div className="chart-explorer-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '18px 20px' }}>
            <UniversalAssetSearch
              mode="explorer"
              sources={sources}
              priceTypeInfo={PRICE_TYPE_INFO}
              selectedAsset={activeSelectedSource}
              selectedAssetId={selectedSourceId}
              title="کاوشگر و تحلیل اختصاصی تمامی دارایی‌ها و سورس‌ها"
              subtitle="امکان جستجو و کاوش در تمامی سورس‌ها و رسم نمودار تحلیلی برای سورس‌های تک‌خروجی"
              onSelect={(item) => {
                const isMulti = item.isMultiItem || item.isMultiFeed || item.category === 'multi_output' || item.type === 'bourse' || item.category === 'bourse' || item.category === 'bourse_fund';
                if (isMulti) {
                  const parentFeed = multiSources.find((s) => s.id === item.sourceId || s.priceType === 'bourse' || s.priceType === 'bourse_fund' || isSourceMultiOutput(s, PRICE_TYPE_INFO));
                  if (parentFeed) {
                    handleOpenExplorer(parentFeed);
                    showMsg(`نمودار و تاریخچه قیمت فقط برای سورس‌های تک‌خروجی فعال است. کاوشگر داده‌های ${parentFeed.name} باز شد.`, 'info');
                  } else {
                    showMsg('نمودار و تاریخچه قیمت فقط برای سورس‌های تک‌خروجی در دسترس است.', 'info');
                  }
                  return;
                }

                if (item.type === 'source' || item.sourceId) {
                  const targetId = item.sourceId || item.id;
                  const targetSrc = sources.find((s) => s.id === targetId);
                  if (targetSrc && !isSourceMultiOutput(targetSrc, PRICE_TYPE_INFO)) {
                    setSelectedSourceId(targetId);
                    loadPriceHistory(targetId, chartRange);
                  }
                } else {
                  const matched = singleSources.find((s) => s.priceType === item.id || s.id === item.id);
                  if (matched) {
                    setSelectedSourceId(matched.id);
                    loadPriceHistory(matched.id, chartRange);
                  }
                }
                if (chartSectionRef.current) {
                  chartSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            />
          </div>

          {/* Interactive Chart for the active source (strictly single-output) */}
          {activeSelectedSource && !isSourceMultiOutput(activeSelectedSource, PRICE_TYPE_INFO) ? (
            <PriceHistoryChart
              history={historyData}
              loading={loadingHistory}
              title={`نمودار تحلیلی اختصاصی: ${activeSelectedSource.name}`}
              subtitle={`${PRICE_TYPE_INFO[activeSelectedSource.priceType]?.label || ''} — پروتکل: ${
                activeSelectedSource.sourceType === 'telegram'
                  ? `@${activeSelectedSource.channelUsername || activeSelectedSource.endpoint}`
                  : 'وب‌سرویس API'
              } ${activeSelectedSource.isPrimary ? '(سورس مرجع)' : ''}`}
              range={chartRange}
              onRangeChange={setChartRange}
              onRefresh={() => loadPriceHistory(activeSelectedSource.id, chartRange)}
              sources={singleSources}
              selectedSourceId={selectedSourceId}
              onSelectSource={(id) => {
                const target = singleSources.find((s) => s.id === id);
                if (target) setSelectedSourceId(id);
              }}
              selectedPriceType={activeSelectedSource.priceType}
              onSelectPriceType={(t) => {
                const firstOfType = singleSources.find((s) => s.priceType === t);
                if (firstOfType) setSelectedSourceId(firstOfType.id);
              }}
              priceTypeInfo={singlePriceTypeInfo}
            />
          ) : (
            <div className="chart-empty-state" style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '40px' }}>
              <Activity size={32} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
              <p>نمودار و تاریخچه قیمت فقط برای سورس‌های تک‌خروجی در دسترس است.</p>
              <span>برای مشاهده نمودار اختصاصی، یک سورس تک‌نرخی را از جدول بالا انتخاب کنید.</span>
            </div>
          )}
        </section>
        </>
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
                        </td>

                        <td>
                          {excluded.length > 0 ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '2px 8px', borderRadius: '6px',
                              background: 'rgba(244,63,94,0.12)', color: '#f43f5e',
                              fontSize: '11px', fontWeight: '700',
                            }}>
                              {excluded.length.toLocaleString('fa-IR')} مورد مستثنی
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>کامل (بدون حذف)</span>
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

        {/* ── Multi-Output Feed Smart Wizard Modal ─────────────────────────── */}
        <Modal
          isOpen={multiWizardOpen}
          onClose={() => setMultiWizardOpen(false)}
          title={multiForm.id ? `ویرایش فید چند خروجی: ${multiForm.name}` : 'ایجاد و نگاشت هوشمند فید چند خروجی (Multi-Item Feed Wizard)'}
          icon={<Layers size={18} style={{ color: 'var(--accent-indigo, #818cf8)' }} />}
          maxWidth="840px"
          className="source-edit-modal-card"
          onSubmit={handleSaveMultiSource}
          footer={
            <div className="modal-actions-right">
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
              >
                <Save size={14} className={savingMultiSource ? 'spin-anim' : ''} />
                <span>{savingMultiSource ? 'در حال ذخیره‌سازی فید...' : 'ذخیره سورس چند خروجی'}</span>
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Step 1: Base info & API URL */}
            <div className="form-row-2">
              <div className="form-group">
                <label>نام و عنوان فید:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: قیمت روز خودرو - بازار آزاد و کارخانه"
                  value={multiForm.name}
                  onChange={(e) => setMultiForm({ ...multiForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ margin: 0 }}>نوع / دسته‌بندی فید:</label>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>تایپ آزاد یا انتخاب از لیست</span>
                </div>
                <input
                  type="text"
                  list="dynamic-multi-types-datalist"
                  required
                  placeholder="مثال: خودرو، بورس، رمزارز، مسکن، کالا..."
                  value={multiForm.priceType}
                  onChange={(e) => setMultiForm({ ...multiForm, priceType: e.target.value.trim() })}
                />
                <datalist id="dynamic-multi-types-datalist">
                  {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => (
                    <option key={key} value={key}>{info.label || key}</option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* API URL + Inspect Button */}
            <div className="api-inspect-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ margin: 0, fontWeight: '700', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wand2 size={15} style={{ color: '#818cf8' }} />
                  <span>آدرس وب‌سرویس JSON (REST API Endpoint):</span>
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  هر وب‌سرویسی (بورس، خودرو، رمزارز، طلا و...) با پاسخ JSON
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="url"
                  required
                  placeholder="https://api.example.com/v1/data یا وب‌سرویس بورس"
                  value={multiForm.apiUrl}
                  onChange={(e) => setMultiForm({ ...multiForm, apiUrl: e.target.value.trim() })}
                  style={{ flex: 1, direction: 'ltr', textAlign: 'left', fontFamily: 'monospace', fontSize: '12px' }}
                />
                <button
                  type="button"
                  onClick={handleInspectApi}
                  disabled={inspectLoading || !multiForm.apiUrl}
                  className="btn-primary"
                  style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                >
                  <Wand2 size={14} className={inspectLoading ? 'spin-anim' : ''} />
                  <span>{inspectLoading ? 'در حال تحلیل API...' : 'تحلیل هوشمند ساختار API'}</span>
                </button>
              </div>

              {/* Detected Candidate Arrays */}
              {inspectResult && inspectResult.candidateArrays && inspectResult.candidateArrays.length > 0 && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--text-muted)' }}>
                    آرایه‌های داده کشف‌شده در پاسخ API (یکی را انتخاب کنید):
                  </span>
                  <div className="candidate-arrays-picker">
                    {inspectResult.candidateArrays.map((cand, idx) => {
                      const isSelected = (multiForm.arrayPath || '') === (cand.path || '');
                      return (
                        <button
                          key={idx}
                          type="button"
                          className={`candidate-array-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectCandidate(cand)}
                        >
                          <Table size={13} />
                          <span>{cand.path ? `مسیر: ${cand.path}` : 'ریشه اصلی آرایه []'}</span>
                          <span style={{ fontSize: '10px', opacity: 0.8 }}>({cand.length.toLocaleString('fa-IR')} رکورد)</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Interactive Field Mapper Grid */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SlidersHorizontal size={16} style={{ color: 'var(--accent-green, #10b981)' }} />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: 'var(--text-heading)' }}>
                  نگاشت تعاملی فیلدها و تعیین عنوان ستون‌ها
                </h4>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                کلیدهای شیء در API را انتخاب و نام نمایشی دلخواه آن را تعیین کنید
              </span>
            </div>

            <div className="schema-mapper-grid">
              {/* Field 1: ID / Symbol */}
              <div className="schema-field-card">
                <div className="schema-field-header">
                  <span className="schema-field-title">
                    <Hash size={13} style={{ color: '#818cf8' }} />
                    شناسه یا کد یکتا (ID / Symbol)
                  </span>
                  <span className="schema-field-req">الزامی</span>
                </div>
                <div className="schema-field-inputs-row">
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>کلید در JSON:</label>
                    <input
                      type="text"
                      list="api-keys-list"
                      placeholder="id یا symbol"
                      value={multiForm.idField}
                      onChange={(e) => setMultiForm({ ...multiForm, idField: e.target.value.trim() })}
                      style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>عنوان نمایشی ستون:</label>
                    <input
                      type="text"
                      placeholder="شناسه / کد"
                      value={multiForm.idLabel}
                      onChange={(e) => setMultiForm({ ...multiForm, idLabel: e.target.value })}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Field 2: Title / Name */}
              <div className="schema-field-card">
                <div className="schema-field-header">
                  <span className="schema-field-title">
                    <Tag size={13} style={{ color: '#38bdf8' }} />
                    عنوان یا نام اصلی (Title / Name)
                  </span>
                  <span className="schema-field-req">الزامی</span>
                </div>
                <div className="schema-field-inputs-row">
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>کلید در JSON:</label>
                    <input
                      type="text"
                      list="api-keys-list"
                      placeholder="name یا title"
                      value={multiForm.titleField}
                      onChange={(e) => setMultiForm({ ...multiForm, titleField: e.target.value.trim() })}
                      style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>عنوان نمایشی ستون:</label>
                    <input
                      type="text"
                      placeholder="عنوان / نام"
                      value={multiForm.titleLabel}
                      onChange={(e) => setMultiForm({ ...multiForm, titleLabel: e.target.value })}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Field 3: Primary Price */}
              <div className="schema-field-card">
                <div className="schema-field-header">
                  <span className="schema-field-title">
                    <DollarSign size={13} style={{ color: '#10b981' }} />
                    قیمت اصلی (Primary Price)
                  </span>
                  <span className="schema-field-req">الزامی</span>
                </div>
                <div className="schema-field-inputs-row">
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>کلید در JSON:</label>
                    <input
                      type="text"
                      list="api-keys-list"
                      placeholder="price یا last_price"
                      value={multiForm.priceField}
                      onChange={(e) => setMultiForm({ ...multiForm, priceField: e.target.value.trim() })}
                      style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>عنوان نمایشی ستون:</label>
                    <input
                      type="text"
                      placeholder="قیمت اصلی / بازار"
                      value={multiForm.priceLabel}
                      onChange={(e) => setMultiForm({ ...multiForm, priceLabel: e.target.value })}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Field 4: Secondary / Compare Price */}
              <div className="schema-field-card">
                <div className="schema-field-header">
                  <span className="schema-field-title">
                    <RotateCcw size={13} style={{ color: '#f59e0b' }} />
                    قیمت مقایسه‌ای / دوم (Alt Price)
                  </span>
                  <span className="schema-field-opt">اختیاری</span>
                </div>
                <div className="schema-field-inputs-row">
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>کلید در JSON:</label>
                    <input
                      type="text"
                      list="api-keys-list"
                      placeholder="factory_price یا pc"
                      value={multiForm.altPriceField}
                      onChange={(e) => setMultiForm({ ...multiForm, altPriceField: e.target.value.trim() })}
                      style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>عنوان نمایشی ستون:</label>
                    <input
                      type="text"
                      placeholder="قیمت کارخانه / مرجع"
                      value={multiForm.altPriceLabel}
                      onChange={(e) => setMultiForm({ ...multiForm, altPriceLabel: e.target.value })}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Field 5: Change % */}
              <div className="schema-field-card">
                <div className="schema-field-header">
                  <span className="schema-field-title">
                    <Percent size={13} style={{ color: '#ec4899' }} />
                    درصد تغییرات (Change %)
                  </span>
                  <span className="schema-field-opt">اختیاری</span>
                </div>
                <div className="schema-field-inputs-row">
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>کلید در JSON:</label>
                    <input
                      type="text"
                      list="api-keys-list"
                      placeholder="percent یا plp"
                      value={multiForm.changePercentField}
                      onChange={(e) => setMultiForm({ ...multiForm, changePercentField: e.target.value.trim() })}
                      style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>عنوان نمایشی ستون:</label>
                    <input
                      type="text"
                      placeholder="درصد تغییر"
                      value={multiForm.changePercentLabel}
                      onChange={(e) => setMultiForm({ ...multiForm, changePercentLabel: e.target.value })}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Field 6: Category / Brand */}
              <div className="schema-field-card">
                <div className="schema-field-header">
                  <span className="schema-field-title">
                    <Folder size={13} style={{ color: '#a855f7' }} />
                    دسته‌بندی یا برند (Category)
                  </span>
                  <span className="schema-field-opt">اختیاری</span>
                </div>
                <div className="schema-field-inputs-row">
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>کلید در JSON:</label>
                    <input
                      type="text"
                      list="api-keys-list"
                      placeholder="brand یا group"
                      value={multiForm.categoryField}
                      onChange={(e) => setMultiForm({ ...multiForm, categoryField: e.target.value.trim() })}
                      style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>عنوان نمایشی ستون:</label>
                    <input
                      type="text"
                      placeholder="شرکت / گروه"
                      value={multiForm.categoryLabel}
                      onChange={(e) => setMultiForm({ ...multiForm, categoryLabel: e.target.value })}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Datalist of detected keys for auto-completion */}
            {inspectResult && (
              <datalist id="api-keys-list">
                {(inspectResult.candidateArrays?.find(c => c.path === multiForm.arrayPath)?.keys || []).map(k => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            )}

            {/* Conversion & Unit Settings */}
            <div className="form-row-3" style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: '10px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px' }}>واحد عددی قیمت در وب‌سرویس:</label>
                <select
                  value={multiForm.priceUnit}
                  onChange={(e) => setMultiForm({
                    ...multiForm,
                    priceUnit: e.target.value,
                    multiplier: e.target.value === 'rial' ? 0.1 : 1,
                  })}
                  style={{ fontSize: '12px' }}
                >
                  <option value="toman">تومان (مستقیم، ضریب ۱)</option>
                  <option value="rial">ریال ایران (تبدیل به تومان با تقسیم بر ۱۰)</option>
                  <option value="dollar">دلار آمریکا ($)</option>
                  <option value="euro">یورو (€)</option>
                  <option value="custom">واحد دلخواه متنی</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px' }}>ضریب تبدیل قیمت (Multiplier):</label>
                <input
                  type="number"
                  step="any"
                  value={multiForm.multiplier}
                  onChange={(e) => setMultiForm({ ...multiForm, multiplier: e.target.value })}
                  style={{ direction: 'ltr', fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px' }}>دوره بروزرسانی (دقیقه):</label>
                <input
                  type="number"
                  min="1"
                  value={multiForm.fetchIntervalMinutes}
                  onChange={(e) => setMultiForm({ ...multiForm, fetchIntervalMinutes: e.target.value })}
                  style={{ fontSize: '12px' }}
                />
              </div>
            </div>

            {/* Live Interactive Preview Table with Inline Exclude Buttons */}
            {previewMappedItems.length > 0 && (
              <div className="live-preview-box">
                <div className="live-preview-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={15} style={{ color: 'var(--accent-green, #10b981)' }} />
                    <strong style={{ fontSize: '13px', color: 'var(--text-heading)' }}>
                      پیش‌نمایش زنده و اینترکتیو داده‌ها ({previewMappedItems.length} نمونه)
                    </strong>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    می‌توانید هر سطری را مستقیماً با دکمه «مستثنی کردن» حذف کنید
                  </span>
                </div>

                <div className="live-preview-table-wrap">
                  <table className="live-preview-table">
                    <thead>
                      <tr>
                        <th>{multiForm.idLabel || 'شناسه / کد'}</th>
                        <th>{multiForm.titleLabel || 'عنوان / نام'}</th>
                        <th>{multiForm.priceLabel || 'قیمت اصلی'}</th>
                        {multiForm.altPriceField && <th>{multiForm.altPriceLabel || 'قیمت دوم'}</th>}
                        {multiForm.changePercentField && <th>{multiForm.changePercentLabel || 'درصد تغییر'}</th>}
                        {multiForm.categoryField && <th>{multiForm.categoryLabel || 'دسته‌بندی'}</th>}
                        <th style={{ textAlign: 'center' }}>عملیات استثنا</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewMappedItems.map((item, idx) => (
                        <tr key={idx} className={item.isExcluded ? 'is-excluded' : ''}>
                          <td><strong>{item.id}</strong></td>
                          <td>{item.title}</td>
                          <td style={{ color: 'var(--accent-green, #10b981)', fontWeight: '700' }}>
                            {item.price.toLocaleString('fa-IR')} {multiForm.priceUnit === 'rial' ? 'تومان' : ''}
                          </td>
                          {multiForm.altPriceField && (
                            <td>{item.altPrice > 0 ? item.altPrice.toLocaleString('fa-IR') : '-'}</td>
                          )}
                          {multiForm.changePercentField && (
                            <td style={{ color: item.changePct > 0 ? 'var(--accent-green)' : (item.changePct < 0 ? 'var(--accent-rose)' : 'var(--text-muted)') }}>
                              {item.changePct > 0 ? '+' : ''}{Number(item.changePct).toFixed(2)}%
                            </td>
                          )}
                          {multiForm.categoryField && <td>{item.category || '-'}</td>}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={`btn-exclude-row ${item.isExcluded ? 'active' : ''}`}
                              onClick={() => handleToggleExcludeInPreview(item)}
                            >
                              {item.isExcluded ? 'بازگردانی' : 'مستثنی کن (Exclude)'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Excluded Outputs Section */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-heading)' }}>
                  اقلام مستثنی‌شده از خروجی نهایی (Excluded Outputs):
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {(multiForm.excludedOutputs || []).length} مورد
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', minHeight: '32px' }}>
                {(multiForm.excludedOutputs || []).length === 0 ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    هیچ موردی مستثنی نشده است (همه اقلام استخراج می‌شوند)
                  </span>
                ) : (
                  (multiForm.excludedOutputs || []).map((code) => (
                    <span
                      key={code}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px', borderRadius: '6px',
                        background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.25)',
                        fontSize: '11.5px', fontWeight: '700', color: '#f43f5e',
                      }}
                    >
                      {code}
                      <button
                        type="button"
                        onClick={() => setMultiForm(prev => ({
                          ...prev,
                          excludedOutputs: (prev.excludedOutputs || []).filter(x => x !== code),
                        }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e', padding: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="افزودن دستی کد یا عنوان برای حذف (مثال: پژو ۲۰۶ یا ذوب)"
                  value={newMultiExcludedEntry}
                  onChange={(e) => setNewMultiExcludedEntry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = newMultiExcludedEntry.trim().toLowerCase();
                      if (val && !(multiForm.excludedOutputs || []).includes(val)) {
                        setMultiForm(prev => ({ ...prev, excludedOutputs: [...(prev.excludedOutputs || []), val] }));
                        setNewMultiExcludedEntry('');
                      }
                    }
                  }}
                  style={{ flex: 1, fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => {
                    const val = newMultiExcludedEntry.trim().toLowerCase();
                    if (val && !(multiForm.excludedOutputs || []).includes(val)) {
                      setMultiForm(prev => ({ ...prev, excludedOutputs: [...(prev.excludedOutputs || []), val] }));
                      setNewMultiExcludedEntry('');
                    }
                  }}
                >
                  + افزودن
                </button>
              </div>
            </div>

            {/* Active and Show on Home Page options */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '6px 0', flexWrap: 'wrap' }}>
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={multiForm.isActive}
                  onChange={(e) => setMultiForm({ ...multiForm, isActive: e.target.checked })}
                />
                <span>فید فعال باشد</span>
              </label>

              <label className="admin-checkbox-label" title="آیا این فید در صفحه اول نمایش داده شود؟">
                <input
                  type="checkbox"
                  checked={multiForm.showOnHomePage !== false}
                  onChange={(e) => setMultiForm({ ...multiForm, showOnHomePage: e.target.checked })}
                />
                <span style={{ fontWeight: '600', color: multiForm.showOnHomePage !== false ? 'var(--accent-green, #10b981)' : 'var(--text-muted)' }}>
                  نمایش در صفحه اول
                </span>
              </label>
            </div>

            {/* Test Area */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleTestMultiSource}
                disabled={multiTesting || !multiForm.apiUrl}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <PlayCircle size={14} className={multiTesting ? 'spin-anim' : ''} />
                <span>{multiTesting ? 'در حال تست...' : 'تست کامل اتصال و پردازش'}</span>
              </button>

              {multiTestResult && (
                <span style={{ fontSize: '12px', color: multiTestResult.success ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
                  {multiTestResult.success ? multiTestResult.message : `خطا: ${multiTestResult.error}`}
                </span>
              )}
            </div>
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
                        <th>شناسه / کد</th>
                        <th>عنوان / نام</th>
                        <th>قیمت (تومان)</th>
                        <th>تغییرات</th>
                        <th>دسته / جزئیات</th>
                        <th style={{ textAlign: 'center' }}>وضعیت استثنا</th>
                      </tr>
                    </thead>
                    <tbody>
                      {explorerItems
                        .filter((item) => {
                          if (!explorerSearch.trim()) return true;
                          const q = explorerSearch.toLowerCase();
                          return (
                            (item.s && String(item.s).toLowerCase().includes(q)) ||
                            (item.n && String(item.n).toLowerCase().includes(q)) ||
                            (item.cat && String(item.cat).toLowerCase().includes(q))
                          );
                        })
                        .slice(0, 100)
                        .map((item, idx) => {
                          const currentExcluded = Array.isArray(explorerFeed.excludedOutputs)
                            ? explorerFeed.excludedOutputs
                            : (typeof explorerFeed.excludedOutputs === 'string' ? JSON.parse(explorerFeed.excludedOutputs || '[]') : []);
                          const isExcluded = currentExcluded.includes(String(item.s || '').toLowerCase()) ||
                            currentExcluded.includes(String(item.n || '').toLowerCase());

                          return (
                            <tr key={idx} style={{ opacity: isExcluded ? 0.4 : 1, textDecoration: isExcluded ? 'line-through' : 'none' }}>
                              <td><strong>{item.s}</strong></td>
                              <td>{item.n}</td>
                              <td style={{ color: 'var(--accent-green, #10b981)', fontWeight: '700' }}>
                                {Number(item.priceTomans || item.priceFinal || Math.round(item.p / 10)).toLocaleString('fa-IR')}
                              </td>
                              <td style={{ color: item.cp > 0 ? 'var(--accent-green)' : (item.cp < 0 ? 'var(--accent-rose)' : 'var(--text-muted)') }}>
                                {item.cp > 0 ? '+' : ''}{Number(item.cp || 0).toFixed(2)}%
                              </td>
                              <td>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {item.cat || item.extra || (item.f ? 'صندوق' : '-')}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className={`btn-exclude-row ${isExcluded ? 'active' : ''}`}
                                  onClick={() => handleExplorerToggleExclude(item.s || item.n)}
                                >
                                  {isExcluded ? 'بازگردانی' : 'مستثنی کن (Exclude)'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
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
