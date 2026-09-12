import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Radio,
  Plus,
  RefreshCw,
  ExternalLink,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit3,
  Star,
  Sparkles,
  Code,
  Check,
  X,
  Sliders,
  Users,
  LineChart,
  Activity,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Send,
  Globe,
  ChevronRight,
  Info,
  ShieldCheck,
  Zap,
  Save,
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
  apiFetchAllSourcesNow,
  apiGetPriceHistory,
} from '../api/client.js';
import PriceHistoryChart from '../components/PriceHistoryChart.jsx';

const PRICE_TYPE_INFO = {
  usd: { label: 'دلار (USD)', badgeColor: 'blue', unit: 'تومان' },
  gold_18k: { label: 'طلا ۱۸ عیار', badgeColor: 'gold', unit: 'تومان' },
  full_coin: { label: 'سکه تمام بهار', badgeColor: 'amber', unit: 'تومان' },
  half_coin: { label: 'نیم سکه بهار', badgeColor: 'orange', unit: 'تومان' },
  quarter_coin: { label: 'ربع سکه بهار', badgeColor: 'rose', unit: 'تومان' },
  mesghal: { label: 'مثقال طلا ۱۷ عیار', badgeColor: 'purple', unit: 'تومان' },
  ons_gold: { label: 'انس طلا جهانی (XAU)', badgeColor: 'gold', unit: '$' },
  ons_silver: { label: 'انس نقره جهانی (XAG)', badgeColor: 'blue', unit: '$' },
  forex: { label: 'نرخ‌های جهانی فارکس (چند ارزی)', badgeColor: 'indigo', unit: 'ارز' },
  bourse: { label: 'بورس اوراق بهادار تهران (سهام)', badgeColor: 'emerald', unit: 'نماد' },
  bourse_fund: { label: 'بورس اوراق بهادار تهران (صندوق)', badgeColor: 'purple', unit: 'صندوق' },
  eur: { label: 'یورو (EUR/USD)', badgeColor: 'blue', unit: '$' },
  try: { label: 'لیر ترکیه (USD/TRY)', badgeColor: 'rose', unit: '$' },
  aed: { label: 'درهم امارات (USD/AED)', badgeColor: 'emerald', unit: '$' },
  gbp: { label: 'پوند انگلیس (GBP/USD)', badgeColor: 'purple', unit: '$' },
  chf: { label: 'فرانک سوئیس (USD/CHF)', badgeColor: 'slate', unit: '$' },
  cad: { label: 'دلار کانادا (USD/CAD)', badgeColor: 'orange', unit: '$' },
  aud: { label: 'دلار استرالیا (AUD/USD)', badgeColor: 'cyan', unit: '$' },
  cny: { label: 'یوان چین (USD/CNY)', badgeColor: 'amber', unit: '$' },
};

const PRESET_REGEX_PATTERNS = {
  usd: [
    { label: 'عدد قبل از «فروش» (رایج در کانال‌های دلار)', pattern: '([\\d,]+)\\s*فروش' },
    { label: 'هرات فردایی تا فروش : عدد', pattern: 'هرات[^\\n]*?([\\d,]+)\\s*فروش' },
    { label: 'فروش : عدد (کانال‌های سبزه میدان و صرافی)', pattern: 'فروش\\s*:\\s*([\\d,]+)' },
    { label: 'دلار : عدد (کانال‌های تجمیعی نرخ ارز)', pattern: '(?:دلار|USD)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  gold_18k: [
    { label: '۱۸ عیار تا فروش : عدد (کانال زرما و طلا)', pattern: '(?:18|۱۸)\\s*عیار.*?فروش[:\\s]+([\\d,]+)' },
    { label: 'طلا ۱۸ عیار : عدد (فرمت ساده)', pattern: '(?:طلا|18\\s*عیار|۱۸\\s*عیار)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
    { label: 'فروش : عدد (کانال‌های تک‌نرخی طلا)', pattern: 'فروش\\s*:\\s*([\\d,]+)' },
  ],
  full_coin: [
    { label: 'سکه تمام تا فروش : عدد (کانال زرما و بازار سکه)', pattern: '(?:سکه\\s*تمام|سکه\\s*امامی|تمام\\s*سکه).*?فروش[:\\s]+([\\d,]+)' },
    { label: 'سکه تمام : عدد (فرمت ساده صرافی)', pattern: '(?:سکه\\s*تمام|سکه\\s*امامی|تمام\\s*سکه)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  half_coin: [
    { label: 'نیم سکه تا فروش : عدد (کانال زرما و صرافی)', pattern: 'نیم\\s*سکه.*?فروش[:\\s]+([\\d,]+)' },
    { label: 'نیم سکه : عدد (فرمت ساده)', pattern: 'نیم\\s*سکه[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  quarter_coin: [
    { label: 'ربع سکه تا فروش : عدد (کانال زرما و صرافی)', pattern: 'ربع\\s*سکه.*?فروش[:\\s]+([\\d,]+)' },
    { label: 'ربع سکه : عدد (فرمت ساده)', pattern: 'ربع\\s*سکه[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  mesghal: [
    { label: 'مثقال/آبشده تا فروش : عدد (کانال زرما و آبشده)', pattern: '(?:مثقال|آبشده).*?فروش[:\\s]+([\\d,]+)' },
    { label: 'مثقال یا آبشده : عدد (فرمت ساده)', pattern: '(?:مثقال|آبشده)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  ons_gold: [
    { label: 'Gold-API (وب‌سرویس استاندارد XAU/USD)', pattern: '', apiUrl: 'https://api.gold-api.com/price/XAU', jsonPath: 'price' },
  ],
  ons_silver: [
    { label: 'Gold-API (وب‌سرویس استاندارد XAG/USD)', pattern: '', apiUrl: 'https://api.gold-api.com/price/XAG', jsonPath: 'price' },
  ],
  forex: [
    { label: 'Open ER-API (تمام ۸ ارز با ۱ رکوست)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates' },
  ],
  bourse: [
    { label: 'BRS API بورس تهران (تمام نمادهای فعال)', pattern: '', apiUrl: 'https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1', jsonPath: '' },
  ],
  bourse_fund: [
    { label: 'BRS API صندوق‌های سرمایه‌گذاری و طلا (IME Fund)', pattern: '', apiUrl: 'https://Api.BrsApi.ir/IME/Fund.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd', jsonPath: '' },
  ],
  eur: [
    { label: 'Open ER-API (نرخ برابری EUR)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.EUR' },
  ],
  try: [
    { label: 'Open ER-API (نرخ برابری TRY)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.TRY' },
  ],
  aed: [
    { label: 'Open ER-API (نرخ برابری AED)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.AED' },
  ],
  gbp: [
    { label: 'Open ER-API (نرخ برابری GBP)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.GBP' },
  ],
  chf: [
    { label: 'Open ER-API (نرخ برابری CHF)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.CHF' },
  ],
  cad: [
    { label: 'Open ER-API (نرخ برابری CAD)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.CAD' },
  ],
  aud: [
    { label: 'Open ER-API (نرخ برابری AUD)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.AUD' },
  ],
  cny: [
    { label: 'Open ER-API (نرخ برابری CNY)', pattern: '', apiUrl: 'https://open.er-api.com/v6/latest/USD', jsonPath: 'rates.CNY' },
  ],
};

const DEFAULT_BOURSE_MAPPING = {
  arrayPath: '',
  symbolField: 'l18',
  nameField: 'l30',
  priceField: 'pl',
  altPriceField: 'pc',
  changeField: 'plc',
  changePercentField: 'plp',
  volumeField: 'tno',
  priceUnit: 'rial',
};

const DEFAULT_BOURSE_FUND_MAPPING = {
  arrayPath: 'data',
  symbolField: 'l18',
  nameField: 'l30',
  priceField: 'pl',
  altPriceField: 'pc',
  changeField: 'plc',
  changePercentField: 'plp',
  volumeField: 'tno',
  priceUnit: 'rial',
};

const DEFAULT_FOREX_MAPPING = {
  ratesPath: 'rates',
  currencies: [
    { key: 'eur', path: 'EUR', mode: 'invert', label: 'یورو اروپا' },
    { key: 'try', path: 'TRY', mode: 'invert', label: 'لیر ترکیه' },
    { key: 'aed', path: 'AED', mode: 'invert', label: 'درهم امارات' },
    { key: 'gbp', path: 'GBP', mode: 'invert', label: 'پوند انگلیس' },
    { key: 'chf', path: 'CHF', mode: 'invert', label: 'فرانک سوئیس' },
    { key: 'cad', path: 'CAD', mode: 'invert', label: 'دلار کانادا' },
    { key: 'aud', path: 'AUD', mode: 'invert', label: 'دلار استرالیا' },
    { key: 'cny', path: 'CNY', mode: 'invert', label: 'یوان چین' },
  ],
};

const DEFAULT_SOURCE_FORM = {
  id: null,
  name: '',
  priceType: 'usd',
  sourceType: 'telegram',
  channelUsername: '',
  apiUrl: '',
  jsonPath: '',
  fieldMapping: null,
  regexPattern: '',
  regexGroupIndex: 1,
  fetchIntervalMinutes: 5,
  isActive: true,
  isPrimary: false,
};

function formatNum(num, priceType = 'usd') {
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

  // Dynamic currency additions in modal for Forex
  const [newCurCode, setNewCurCode] = useState('');
  const [newCurLabel, setNewCurLabel] = useState('');
  const [newCurMode, setNewCurMode] = useState('invert');

  // Row Testing State
  const [rowTestingId, setRowTestingId] = useState(null);
  const [rowTestResults, setRowTestResults] = useState({});

  // Notifications / Messages
  const [message, setMessage] = useState(null);

  const showMsg = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Load Price Sources from API
  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const res = await apiGetPriceSources();
      if (res.success && Array.isArray(res.sources)) {
        setSources(res.sources);
        // If no source is selected yet, select the first one
        if (!selectedSourceId && res.sources.length > 0) {
          setSelectedSourceId(res.sources[0].id);
        }
      }
    } catch (e) {
      console.error('Error loading price sources:', e);
      showMsg('خطا در دریافت لیست سورس‌ها: ' + e.message, 'error');
    } finally {
      setLoadingSources(false);
    }
  };

  // Load History for the selected source strictly
  const loadPriceHistory = async (targetSourceId = selectedSourceId, range = chartRange) => {
    if (!targetSourceId) {
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
    loadSources();
  }, []);

  useEffect(() => {
    if (selectedSourceId) {
      loadPriceHistory(selectedSourceId, chartRange);
    }
  }, [selectedSourceId, chartRange]);

  // Active Selected Source Object
  const activeSelectedSource = useMemo(() => {
    return sources.find((s) => s.id === selectedSourceId) || sources[0] || null;
  }, [sources, selectedSourceId]);

  // Filtered Sources for Table
  const filteredSources = useMemo(() => {
    if (sourceFilter === 'all') return sources;
    if (sourceFilter === 'forex') {
      return sources.filter((s) => ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes(s.priceType));
    }
    return sources.filter((s) => s.priceType === sourceFilter);
  }, [sources, sourceFilter]);

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
  const handleOpenAddSource = (defaultType = 'usd') => {
    setEditingSourceId(null);
    let initialMapping = null;
    if (defaultType === 'bourse') initialMapping = DEFAULT_BOURSE_MAPPING;
    if (defaultType === 'bourse_fund') initialMapping = DEFAULT_BOURSE_FUND_MAPPING;
    if (defaultType === 'forex') initialMapping = DEFAULT_FOREX_MAPPING;

    setSourceForm({
      ...DEFAULT_SOURCE_FORM,
      priceType: defaultType,
      fieldMapping: initialMapping,
      regexPattern: PRESET_REGEX_PATTERNS[defaultType]?.[0]?.pattern || (defaultType === 'forex' || defaultType === 'bourse' || defaultType === 'bourse_fund' ? '' : '([\\d,]+)\\s*فروش'),
    });
    setModalTestResult(null);
    setNewCurCode('');
    setNewCurLabel('');
    setSourceModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditSource = (src) => {
    setEditingSourceId(src.id);
    let mapping = src.fieldMapping || null;
    if (!mapping) {
      if (src.priceType === 'bourse') mapping = DEFAULT_BOURSE_MAPPING;
      if (src.priceType === 'bourse_fund') mapping = DEFAULT_BOURSE_FUND_MAPPING;
      if (src.priceType === 'forex') mapping = DEFAULT_FOREX_MAPPING;
    }
    setSourceForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'usd',
      sourceType: src.sourceType || 'telegram',
      channelUsername: src.channelUsername || (src.sourceType === 'telegram' ? src.endpoint : ''),
      apiUrl: src.apiUrl || (src.sourceType === 'api_url' ? src.endpoint : ''),
      jsonPath: src.jsonPath || '',
      fieldMapping: mapping,
      regexPattern: src.regexPattern || src.regex || '',
      regexGroupIndex: src.regexGroupIndex || 1,
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 300) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      isPrimary: Boolean(src.isPrimary),
    });
    setModalTestResult(null);
    setNewCurCode('');
    setNewCurLabel('');
    setSourceModalOpen(true);
  };

  // Save Modal Source
  const handleSaveModalSource = async (e) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const payload = {
        ...sourceForm,
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

  // Select Source for Dedicated Chart
  const handleSelectSourceForChart = (src) => {
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

            <button
              type="button"
              onClick={() => handleOpenAddSource(sourceFilter === 'all' ? 'usd' : sourceFilter)}
              className="btn-hero-action accent"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>افزودن سورس جدید</span>
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

      {/* ── SECTION 1: Individual Source Dedicated Chart ───────── */}
      <section ref={chartSectionRef} className="sources-chart-section">

          {/* Interactive Chart for the active source */}
          {activeSelectedSource ? (
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
              sources={sources}
              selectedSourceId={selectedSourceId}
              onSelectSource={setSelectedSourceId}
              selectedPriceType={activeSelectedSource.priceType}
              onSelectPriceType={(t) => {
                const firstOfType = sources.find((s) => s.priceType === t);
                if (firstOfType) setSelectedSourceId(firstOfType.id);
              }}
              priceTypeInfo={PRICE_TYPE_INFO}
            />
          ) : (
            <div className="chart-empty-state" style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '40px' }}>
              <Activity size={32} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
              <p>هیچ سورسی برای نمایش نمودار یافت نشد.</p>
              <span>برای مشاهده نمودار اختصاصی، یک سورس از جدول زیر تعریف یا انتخاب کنید.</span>
            </div>
          )}
        </section>

        {/* ── SECTION 2: Unified Management Table ─────────────────────────── */}
        <section className="sources-table-section">
          <div className="table-header-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={17} style={{ color: 'var(--accent-blue)' }} />
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
                جدول مدیریت و پیکربندی سورس‌ها
              </h3>
            </div>

            {/* Reusable Filter Pills */}
            <FilterPills
              options={[
                { value: 'all', label: 'همه', badge: sources.length.toLocaleString('fa-IR') },
                {
                  value: 'forex',
                  label: 'ارزها و فارکس',
                  badge: sources.filter((s) => ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes(s.priceType)).length.toLocaleString('fa-IR'),
                },
                ...Object.entries(PRICE_TYPE_INFO).map(([key, info]) => ({
                  value: key,
                  label: info.label,
                  badge: sources.filter((s) => s.priceType === key).length.toLocaleString('fa-IR'),
                })),
              ]}
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
                {filteredSources.length === 0 ? (
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
                  filteredSources.map((src) => {
                    const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
                    const isRowTesting = rowTestingId === src.id;
                    const rowResult = rowTestResults[src.id];
                    const isSelectedInChart = src.id === selectedSourceId;

                    return (
                      <React.Fragment key={src.id}>
                        <tr className={isSelectedInChart ? 'active-chart-row' : ''}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <strong style={{ fontSize: '13.5px', color: 'var(--text-heading)' }}>
                                {src.name}
                              </strong>
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
                            <span className={`source-type-pill pill-${typeInfo.badgeColor}`}>
                              {typeInfo.label}
                            </span>
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

                <div className="form-row-2">
                  <div className="form-group">
                    <label>نوع قیمت:</label>
                    <select
                      value={sourceForm.priceType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        const isBourseLike = newType === 'bourse' || newType === 'bourse_fund';
                        const isGlobal = newType === 'ons_gold' || newType === 'ons_silver' || newType === 'forex' || isBourseLike || ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes(newType);
                        const defaultPreset = PRESET_REGEX_PATTERNS[newType]?.[0];
                        let defaultMapping = sourceForm.fieldMapping;
                        if (newType === 'bourse') defaultMapping = DEFAULT_BOURSE_MAPPING;
                        if (newType === 'bourse_fund') defaultMapping = DEFAULT_BOURSE_FUND_MAPPING;
                        if (newType === 'forex') defaultMapping = DEFAULT_FOREX_MAPPING;

                        setSourceForm({
                          ...sourceForm,
                          priceType: newType,
                          sourceType: isGlobal ? 'api_url' : sourceForm.sourceType,
                          apiUrl: isGlobal && defaultPreset?.apiUrl ? defaultPreset.apiUrl : sourceForm.apiUrl,
                          jsonPath: isGlobal && defaultPreset?.jsonPath !== undefined ? defaultPreset.jsonPath : sourceForm.jsonPath,
                          regexPattern: defaultPreset?.pattern || sourceForm.regexPattern,
                          fieldMapping: defaultMapping,
                          fetchIntervalMinutes: isBourseLike ? 1440 : sourceForm.fetchIntervalMinutes,
                        });
                      }}
                    >
                      {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => (
                        <option key={key} value={key}>
                          {info.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>پروتکل استخراج:</label>
                    <select
                      value={sourceForm.sourceType}
                      onChange={(e) => setSourceForm({ ...sourceForm, sourceType: e.target.value })}
                    >
                      <option value="telegram">کانال عمومی تلگرام (بدون نیاز به توکن)</option>
                      <option value="api_url">وب‌سرویس خارجی (REST API JSON)</option>
                    </select>
                  </div>
                </div>

                {(sourceForm.priceType === 'bourse' || sourceForm.priceType === 'bourse_fund') ? (
                  <>
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ margin: 0 }}>
                          {sourceForm.priceType === 'bourse_fund'
                            ? 'آدرس وب‌سرویس صندوق‌های بورس (API URL):'
                            : 'آدرس وب‌سرویس نمادهای بورس (API URL):'}
                        </label>
                        <button
                          type="button"
                          className="btn-text-action"
                          style={{ fontSize: '11px', color: 'var(--accent-blue)', cursor: 'pointer', background: 'none', border: 'none' }}
                          onClick={() => setSourceForm({ ...sourceForm, apiUrl: PRESET_REGEX_PATTERNS[sourceForm.priceType]?.[0]?.apiUrl || '' })}
                        >
                          {sourceForm.priceType === 'bourse_fund'
                            ? 'استفاده از وب‌سرویس پیش‌فرض IME Fund API'
                            : 'استفاده از وب‌سرویس پیش‌فرض BRS API'}
                        </button>
                      </div>
                      <input
                        type="url"
                        required
                        placeholder={sourceForm.priceType === 'bourse_fund' ? 'https://Api.BrsApi.ir/IME/Fund.php?key=...' : 'https://api.example.com/Tsetmc/AllSymbols'}
                        value={sourceForm.apiUrl}
                        onChange={(e) => setSourceForm({ ...sourceForm, apiUrl: e.target.value.trim() })}
                        style={{ direction: 'ltr', textAlign: 'left' }}
                      />
                    </div>

                    {/* Dynamic Bourse Schema Mapping */}
                    <div className="dynamic-schema-card">
                      <div className="dynamic-schema-header">
                        <div className="dynamic-schema-title">
                          <Sliders size={15} style={{ color: 'var(--accent-green)' }} />
                          <span>
                            {sourceForm.priceType === 'bourse_fund'
                              ? 'نگاشت هوشمند فیلدهای صندوق‌های بورس (Dynamic Schema Mapping)'
                              : 'نگاشت هوشمند فیلدهای بورس (Dynamic Schema Mapping)'}
                          </span>
                        </div>
                        <span className="dynamic-schema-hint">
                          {sourceForm.priceType === 'bourse_fund'
                            ? 'در صورت تغییر ساختار پاسخ وب‌سرویس صندوق‌ها یا استفاده از لینک اختصاصی، نام فیلدها را در اینجا تطبیق دهید:'
                            : 'در صورت تغییر ساختار پاسخ وب‌سرویس یا استفاده از لینک اختصاصی، نام فیلدها را در اینجا تطبیق دهید:'}
                        </span>
                      </div>

                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label>مسیر آرایه نمادها در JSON (اختیاری):</label>
                        <input
                          type="text"
                          placeholder={sourceForm.priceType === 'bourse_fund' ? 'مثال: data' : 'مثال: data.symbols یا خالی برای ریشه آرایه []'}
                          value={sourceForm.fieldMapping?.arrayPath !== undefined ? sourceForm.fieldMapping.arrayPath : (sourceForm.priceType === 'bourse_fund' ? 'data' : '')}
                          onChange={(e) => setSourceForm({
                            ...sourceForm,
                            fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), arrayPath: e.target.value.trim() },
                          })}
                          style={{ direction: 'ltr', textAlign: 'left' }}
                        />
                      </div>

                      <div className="dynamic-schema-grid">
                        <div className="form-group">
                          <label>فیلد شناسه / نماد سهم (Symbol Key):</label>
                          <input
                            type="text"
                            required
                            placeholder="l18 یا symbol"
                            value={sourceForm.fieldMapping?.symbolField || 'l18'}
                            onChange={(e) => setSourceForm({
                              ...sourceForm,
                              fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), symbolField: e.target.value.trim() },
                            })}
                            style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                          />
                        </div>

                        <div className="form-group">
                          <label>فیلد نام کامل شرکت (Name Key):</label>
                          <input
                            type="text"
                            placeholder="l30 یا title یا name"
                            value={sourceForm.fieldMapping?.nameField || 'l30'}
                            onChange={(e) => setSourceForm({
                              ...sourceForm,
                              fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), nameField: e.target.value.trim() },
                            })}
                            style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                          />
                        </div>

                        <div className="form-group">
                          <label>فیلد قیمت آخرین معامله (Price Key):</label>
                          <input
                            type="text"
                            required
                            placeholder="pl یا lastPrice"
                            value={sourceForm.fieldMapping?.priceField || 'pl'}
                            onChange={(e) => setSourceForm({
                              ...sourceForm,
                              fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), priceField: e.target.value.trim() },
                            })}
                            style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                          />
                        </div>

                        <div className="form-group">
                          <label>فیلد قیمت پایانی / جایگزین (Alt Price):</label>
                          <input
                            type="text"
                            placeholder="pc یا closePrice"
                            value={sourceForm.fieldMapping?.altPriceField || 'pc'}
                            onChange={(e) => setSourceForm({
                              ...sourceForm,
                              fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), altPriceField: e.target.value.trim() },
                            })}
                            style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                          />
                        </div>

                        <div className="form-group">
                          <label>فیلد درصد تغییرات (Change % Key):</label>
                          <input
                            type="text"
                            placeholder="plp یا percent"
                            value={sourceForm.fieldMapping?.changePercentField || 'plp'}
                            onChange={(e) => setSourceForm({
                              ...sourceForm,
                              fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), changePercentField: e.target.value.trim() },
                            })}
                            style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                          />
                        </div>

                        <div className="form-group">
                          <label>فیلد تعداد / حجم معاملات (Volume Key):</label>
                          <input
                            type="text"
                            placeholder="tno یا volume"
                            value={sourceForm.fieldMapping?.volumeField || 'tno'}
                            onChange={(e) => setSourceForm({
                              ...sourceForm,
                              fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), volumeField: e.target.value.trim() },
                            })}
                            style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                          />
                        </div>
                      </div>

                      <div className="form-group" style={{ marginTop: '8px' }}>
                        <label>واحد عددی قیمت در وب‌سرویس:</label>
                        <select
                          value={sourceForm.fieldMapping?.priceUnit || 'rial'}
                          onChange={(e) => setSourceForm({
                            ...sourceForm,
                            fieldMapping: { ...(sourceForm.fieldMapping || (sourceForm.priceType === 'bourse_fund' ? DEFAULT_BOURSE_FUND_MAPPING : DEFAULT_BOURSE_MAPPING)), priceUnit: e.target.value },
                          })}
                        >
                          <option value="rial">ریال ایران (محاسبه و تبدیل خودکار به تومان با تقسیم بر ۱۰)</option>
                          <option value="toman">تومان (مستقیم، بدون تقسیم بر ۱۰)</option>
                        </select>
                      </div>
                    </div>
                  </>
                ) : sourceForm.priceType === 'forex' ? (
                  <>
                    <div className="form-group">
                      <label>آدرس URL وب‌سرویس نرخ‌های فارکس (API URL):</label>
                      <input
                        type="url"
                        required
                        placeholder="https://open.er-api.com/v6/latest/USD"
                        value={sourceForm.apiUrl}
                        onChange={(e) => setSourceForm({ ...sourceForm, apiUrl: e.target.value.trim() })}
                        style={{ direction: 'ltr', textAlign: 'left' }}
                      />
                    </div>

                    {/* Dynamic Forex Currencies Manager */}
                    <div className="dynamic-schema-card">
                      <div className="dynamic-schema-header">
                        <div className="dynamic-schema-title">
                          <Globe size={15} style={{ color: 'var(--accent-blue)' }} />
                          <span>مدیریت ارزهای تجمیعی فارکس (Dynamic Currencies)</span>
                        </div>
                        <span className="dynamic-schema-hint">
                          می‌توانید هر ارز دلخواهی (JPY، KWD، RUB و ...) را به لیست اضافه کرده تا به‌طور خودکار استخراج شود:
                        </span>
                      </div>

                      <div className="form-group" style={{ marginBottom: '10px' }}>
                        <label>مسیر شیء نرخ‌ها در پاسخ JSON (Rates Path):</label>
                        <input
                          type="text"
                          placeholder="rates"
                          value={sourceForm.fieldMapping?.ratesPath || sourceForm.jsonPath || 'rates'}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setSourceForm({
                              ...sourceForm,
                              jsonPath: val,
                              fieldMapping: { ...(sourceForm.fieldMapping || DEFAULT_FOREX_MAPPING), ratesPath: val },
                            });
                          }}
                          style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                        />
                      </div>

                      <div className="forex-currencies-list">
                        {(sourceForm.fieldMapping?.currencies || DEFAULT_FOREX_MAPPING.currencies).map((cur) => (
                          <div key={cur.key} className="forex-cur-chip">
                            <span className="cur-code">{cur.key.toUpperCase()}</span>
                            <span className="cur-label">{cur.label || cur.key.toUpperCase()}</span>
                            <span className="cur-mode-tag">
                              {cur.mode === 'direct' ? 'مستقیم' : (cur.mode === 'multiply' ? `×${cur.multiplier}` : 'معکوس ۱/x')}
                            </span>
                            <button
                              type="button"
                              className="cur-remove-btn"
                              title="حذف این ارز"
                              onClick={() => {
                                const list = (sourceForm.fieldMapping?.currencies || DEFAULT_FOREX_MAPPING.currencies)
                                  .filter((c) => c.key.toLowerCase() !== cur.key.toLowerCase());
                                setSourceForm({
                                  ...sourceForm,
                                  fieldMapping: { ...(sourceForm.fieldMapping || DEFAULT_FOREX_MAPPING), currencies: list },
                                });
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="forex-add-currency-box">
                        <span className="add-box-title">افزودن ارز جدید به سورس فارکس:</span>
                        <div className="forex-add-currency-row">
                          <input
                            type="text"
                            placeholder="کد ارز (مثلاً JPY یا KWD)"
                            value={newCurCode}
                            onChange={(e) => setNewCurCode(e.target.value.toUpperCase().trim())}
                            style={{ direction: 'ltr', textAlign: 'center', width: '120px', fontFamily: 'monospace' }}
                          />
                          <input
                            type="text"
                            placeholder="عنوان فارسی (مثلاً ین ژاپن)"
                            value={newCurLabel}
                            onChange={(e) => setNewCurLabel(e.target.value)}
                            style={{ flex: 1 }}
                          />
                          <select
                            value={newCurMode}
                            onChange={(e) => setNewCurMode(e.target.value)}
                            style={{ width: '165px' }}
                          >
                            <option value="invert">معکوس (۱ / نرخ در API)</option>
                            <option value="direct">مستقیم (نرخ در API)</option>
                          </select>
                          <button
                            type="button"
                            className="btn-add-cur"
                            disabled={!newCurCode.trim()}
                            onClick={() => {
                              const code = newCurCode.trim().toLowerCase();
                              if (!code) return;
                              const currentList = sourceForm.fieldMapping?.currencies || DEFAULT_FOREX_MAPPING.currencies;
                              if (currentList.some((c) => c.key.toLowerCase() === code)) {
                                alert('این ارز قبلاً در لیست وجود دارد.');
                                return;
                              }
                              const updated = [
                                ...currentList,
                                {
                                  key: code,
                                  path: code.toUpperCase(),
                                  mode: newCurMode,
                                  label: newCurLabel.trim() || code.toUpperCase(),
                                },
                              ];
                              setSourceForm({
                                ...sourceForm,
                                fieldMapping: { ...(sourceForm.fieldMapping || DEFAULT_FOREX_MAPPING), currencies: updated },
                              });
                              setNewCurCode('');
                              setNewCurLabel('');
                            }}
                          >
                            <Plus size={14} />
                            <span>افزودن</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : sourceForm.sourceType === 'telegram' ? (
                  <div className="form-group">
                    <label>نام کاربری یا آیدی کانال تلگرام:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>@</span>
                      <input
                        type="text"
                        required
                        placeholder="tahran_sabza یا herat_rate"
                        value={sourceForm.channelUsername}
                        onChange={(e) =>
                          setSourceForm({
                            ...sourceForm,
                            channelUsername: e.target.value.replace(/^@/, '').trim(),
                          })
                        }
                        style={{ direction: 'ltr', textAlign: 'left', flex: 1 }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>آدرس URL وب‌سرویس API:</label>
                      <input
                        type="url"
                        required
                        placeholder="https://api.example.com/rates/live"
                        value={sourceForm.apiUrl}
                        onChange={(e) => setSourceForm({ ...sourceForm, apiUrl: e.target.value.trim() })}
                        style={{ direction: 'ltr', textAlign: 'left' }}
                      />
                    </div>

                    <div className="form-group">
                      <label>مسیر کلید در JSON (اختیاری):</label>
                      <input
                        type="text"
                        placeholder="data.usd.price یا stats[0].latest"
                        value={sourceForm.jsonPath}
                        onChange={(e) => setSourceForm({ ...sourceForm, jsonPath: e.target.value.trim() })}
                        style={{ direction: 'ltr', textAlign: 'left' }}
                      />
                    </div>
                  </>
                )}

                {/* Regex & Multiplier Configuration (For non-bourse/forex sources) */}
                {sourceForm.priceType !== 'bourse' && sourceForm.priceType !== 'bourse_fund' && sourceForm.priceType !== 'forex' && (
                  <>
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ margin: 0 }}>الگوی رجکس (Regex Pattern):</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>فلگ چندخطی <code>ims</code></span>
                      </div>
                      <input
                        type="text"
                        placeholder="مثال: ([\d,]+)\s*فروش"
                        value={sourceForm.regexPattern}
                        onChange={(e) => setSourceForm({ ...sourceForm, regexPattern: e.target.value })}
                        style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                      />

                      {PRESET_REGEX_PATTERNS[sourceForm.priceType] && (
                        <div className="regex-presets-box">
                          <span className="regex-preset-title">
                            <Sparkles size={11} style={{ color: 'var(--accent-amber)' }} />
                            الگوهای آماده برای {PRICE_TYPE_INFO[sourceForm.priceType]?.label}:
                          </span>
                          <div className="regex-chips-list">
                            {PRESET_REGEX_PATTERNS[sourceForm.priceType].map((preset, idx) => (
                              <button
                                key={idx}
                                type="button"
                                className="regex-preset-chip"
                                onClick={() => setSourceForm({ ...sourceForm, regexPattern: preset.pattern })}
                              >
                                <span>{preset.label}</span>
                                <code>{preset.pattern}</code>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="form-row-2">
                      <div className="form-group">
                        <label>گروه استخراج رجکس:</label>
                        <input
                          type="number"
                          min="1"
                          max="9"
                          value={sourceForm.regexGroupIndex}
                          onChange={(e) => setSourceForm({ ...sourceForm, regexGroupIndex: e.target.value })}
                          style={{ direction: 'ltr', textAlign: 'center' }}
                        />
                      </div>

                      <div className="form-group">
                        <label>ضریب تبدیل ریاضی (اختیاری):</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="مثلاً ۰.۱ برای ریال به تومان"
                          value={sourceForm.fieldMapping?.multiplier !== undefined ? sourceForm.fieldMapping.multiplier : ''}
                          onChange={(e) => setSourceForm({
                            ...sourceForm,
                            fieldMapping: { ...(sourceForm.fieldMapping || {}), multiplier: e.target.value ? Number(e.target.value) : '' },
                          })}
                          style={{ direction: 'ltr', textAlign: 'center' }}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="form-row-2">
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

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                        <span>به عنوان سورس مرجع این نرخ تنظیم شود</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Modal Test Area */}
                <div className="modal-test-area">
                  <button
                    type="button"
                    onClick={handleTestModalSource}
                    disabled={modalTesting}
                    className="btn-sm site-link"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px' }}
                  >
                    <PlayCircle size={14} className={modalTesting ? 'spin-anim' : ''} />
                    <span>{modalTesting ? 'در حال برقراری ارتباط و پردازش الگو...' : 'تست اتصال و استخراج قبل از ذخیره'}</span>
                  </button>

                  {modalTestResult && (
                    <div className={`modal-test-result-box ${modalTestResult.success ? 'success' : 'error'}`}>
                      {modalTestResult.success ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={16} style={{ color: 'var(--accent-green)' }} />
                            <strong>
                              {modalTestResult.message || `قیمت استخراج شده: ${formatNum(modalTestResult.price, sourceForm.priceType)} ${getPriceUnit(sourceForm.priceType)}`}
                            </strong>
                          </div>

                          {/* Bourse sample symbols live preview */}
                          {modalTestResult.sampleSymbols && modalTestResult.sampleSymbols.length > 0 && (
                            <div className="test-sample-bourse-box">
                              <div className="test-sample-title">
                                <Sparkles size={13} style={{ color: 'var(--accent-green)' }} />
                                <span>نمونه ۵ نماد استخراج‌شده با نگاشت فیلدهای فوق:</span>
                              </div>
                              <div className="test-sample-table-wrapper">
                                <table className="test-sample-table">
                                  <thead>
                                    <tr>
                                      <th>نماد</th>
                                      <th>نام شرکت</th>
                                      <th>قیمت (تومان)</th>
                                      <th>تغییر</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {modalTestResult.sampleSymbols.map((item, idx) => (
                                      <tr key={idx}>
                                        <td><strong>{item.s}</strong></td>
                                        <td>{item.n}</td>
                                        <td style={{ color: 'var(--accent-green)' }}>
                                          {Number(item.priceTomans || Math.round(item.p / 10)).toLocaleString('fa-IR')}
                                        </td>
                                        <td style={{ color: item.cp > 0 ? 'var(--accent-green)' : (item.cp < 0 ? 'var(--accent-rose)' : 'var(--text-muted)') }}>
                                          {item.cp > 0 ? '+' : ''}{Number(item.cp).toFixed(2)}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Forex currencies live preview */}
                          {modalTestResult.currencyList && modalTestResult.currencyList.length > 0 && (
                            <div className="test-sample-forex-box">
                              <div className="test-sample-title">
                                <Sparkles size={13} style={{ color: 'var(--accent-blue)' }} />
                                <span>ارزهای استخراج‌شده با نرخ برابری دلار:</span>
                              </div>
                              <div className="test-currency-chips-grid">
                                {modalTestResult.currencyList.map((c, idx) => (
                                  <div key={idx} className="test-currency-badge">
                                    <span className="code">{c.code}</span>
                                    <span className="label">{c.label}</span>
                                    <span className="rate">${c.usdCrossRate}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {modalTestResult.post_text && (
                            <div className="sample-snippet-box">
                              <pre>{modalTestResult.post_text.substring(0, 180)}...</pre>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertCircle size={16} style={{ color: 'var(--accent-rose)' }} />
                          <span>خطا: {modalTestResult.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

        </Modal>
    </>
  );
}
