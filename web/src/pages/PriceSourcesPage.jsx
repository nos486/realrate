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
  Sliders,
  LineChart,
  Activity,
  ChevronRight,
  ShieldCheck,
  Zap,
  Save,
  X,
} from 'lucide-react';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { useMarketData } from '@/hooks/useMarketData.js';
import {
  apiGetPriceSources,
  apiSavePriceSource,
  apiDeletePriceSource,
  apiSetPrimarySource,
  apiTestPriceSource,
  apiFetchAllSourcesNow,
  apiGetPriceHistory,
} from '@/api/client.js';
import PriceHistoryChart from '@/components/PriceHistoryChart.jsx';

import { Button } from '@/components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Input, Label } from '@/components/ui/input.jsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table.jsx';
import { cn } from '@/lib/utils.js';

const PRICE_TYPE_INFO = {
  usd: { label: 'دلار (USD)', badgeColor: 'blue', dotColor: 'bg-sky-400' },
  gold_18k: { label: 'طلا ۱۸ عیار', badgeColor: 'gold', dotColor: 'bg-amber-400' },
  full_coin: { label: 'سکه تمام بهار', badgeColor: 'amber', dotColor: 'bg-amber-500' },
  half_coin: { label: 'نیم سکه بهار', badgeColor: 'orange', dotColor: 'bg-orange-400' },
  quarter_coin: { label: 'ربع سکه بهار', badgeColor: 'rose', dotColor: 'bg-rose-400' },
  mesghal: { label: 'مثقال طلا ۱۷ عیار', badgeColor: 'purple', dotColor: 'bg-purple-400' },
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
};

const DEFAULT_SOURCE_FORM = {
  id: null,
  name: '',
  priceType: 'usd',
  sourceType: 'telegram',
  channelUsername: '',
  apiUrl: '',
  jsonPath: '',
  regexPattern: '',
  regexGroupIndex: 1,
  fetchIntervalMinutes: 5,
  isActive: true,
  isPrimary: false,
};

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
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

export default function PriceSourcesPage() {
  const { user, loading: authLoading, triggerLogin } = useAuth();
  const { usdToman, gold18kPrice } = useMarketData();
  const navigate = useNavigate();
  const chartSectionRef = useRef(null);

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
        limit: 300,
      });
      if (res.success && Array.isArray(res.history)) {
        setHistoryData(res.history);
      } else {
        setHistoryData([]);
      }
    } catch (e) {
      console.error('Error loading price history:', e);
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (user?.role === 'admin') {
      loadSources();
    }
  }, [user]);

  // Load history whenever selectedSourceId or chartRange changes
  useEffect(() => {
    if (user?.role === 'admin' && selectedSourceId) {
      loadPriceHistory(selectedSourceId, chartRange);
    }
  }, [user, selectedSourceId, chartRange]);

  // Active Selected Source Object
  const activeSelectedSource = useMemo(() => {
    return sources.find((s) => s.id === selectedSourceId) || sources[0] || null;
  }, [sources, selectedSourceId]);

  // Filtered Sources for Table
  const filteredSources = useMemo(() => {
    if (sourceFilter === 'all') return sources;
    return sources.filter((s) => s.priceType === sourceFilter);
  }, [sources, sourceFilter]);

  // Force Refresh All Active Sources Now
  const handleFetchAllNow = async () => {
    setFetchingAll(true);
    try {
      const res = await apiFetchAllSourcesNow();
      if (res.success) {
        showMsg(res.message || 'تمامی سورس‌ها با موفقیت فراخوانی و در دیتابیس ثبت شدند.', 'success');
        if (Array.isArray(res.sources)) {
          setSources(res.sources);
        } else {
          loadSources();
        }
        if (selectedSourceId) {
          loadPriceHistory(selectedSourceId, chartRange);
        }
      } else {
        showMsg(res.message || 'خطا در فراخوانی سورس‌ها', 'error');
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
    setSourceForm({
      ...DEFAULT_SOURCE_FORM,
      priceType: defaultType,
      regexPattern: PRESET_REGEX_PATTERNS[defaultType]?.[0]?.pattern || '([\\d,]+)\\s*فروش',
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditSource = (src) => {
    setEditingSourceId(src.id);
    setSourceForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'usd',
      sourceType: src.sourceType || 'telegram',
      channelUsername: src.channelUsername || (src.sourceType === 'telegram' ? src.endpoint : ''),
      apiUrl: src.apiUrl || (src.sourceType === 'api_url' ? src.endpoint : ''),
      jsonPath: src.jsonPath || '',
      regexPattern: src.regexPattern || src.regex || '',
      regexGroupIndex: src.regexGroupIndex || 1,
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 300) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      isPrimary: Boolean(src.isPrimary),
    });
    setModalTestResult(null);
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

  // Delete Source
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

  // Test Row Source
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

        showMsg(`قیمت سورس «${src.name}» با موفقیت استخراج و ذخیره شد: ${formatNum(res.price)} تومان`, 'success');

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

  // Not logged in or loading check
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-app text-primary">
        <Header usdToman={usdToman} gold18kPrice={gold18kPrice} activeTab="sources" setActiveTab={() => navigate('/')} />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <RefreshCw size={32} className="animate-spin text-sky-400 mx-auto mb-3" />
            <p className="text-sm text-slate-400">در حال بررسی دسترسی مدیریت...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col bg-app text-primary">
        <Header usdToman={usdToman} gold18kPrice={gold18kPrice} activeTab="sources" setActiveTab={() => navigate('/')} />
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full text-center p-8 border-white/10 shadow-xl">
            <ShieldCheck size={48} className="text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white light:text-slate-900 mb-2">
              دسترسی محدود به مدیر کل
            </h2>
            <p className="text-xs text-slate-400 light:text-slate-600 mb-6 leading-relaxed">
              صفحه مدیریت یکپارچه سورس‌های قیمت و نمودارهای تحلیلی تنها برای مدیران سیستم در دسترس است.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link to="/">
                <Button variant="outline" size="sm">بازگشت به خانه</Button>
              </Link>
              <Button variant="primary" size="sm" onClick={triggerLogin}>
                ورود با حساب مدیر
              </Button>
            </div>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-app text-primary">
      {/* Universal Top Header */}
      <Header
        usdToman={usdToman}
        gold18kPrice={gold18kPrice}
        activeTab="sources"
        setActiveTab={(tab) => navigate(tab === 'portfolio' ? '/portfolio' : '/')}
      />

      {/* Main Full-Width Content Container */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 flex flex-col gap-6 sm:gap-8">
        {/* Top Breadcrumb & Page Title Banner */}
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-l from-[#141b2e] via-[#0f1524] to-[#0c101c] p-6 sm:p-7 shadow-2xl backdrop-blur-md light:from-white light:to-slate-50 light:border-slate-200">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-4 select-none">
            <Link to="/" className="hover:text-amber-400 transition-colors">خانه</Link>
            <ChevronRight size={13} className="text-slate-600" />
            <Link to="/admin" className="hover:text-amber-400 transition-colors">پنل مدیریت و کاربران</Link>
            <ChevronRight size={13} className="text-slate-600" />
            <span className="text-amber-400 font-semibold">مدیریت سورس‌ها و نمودارها</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 shadow-lg shadow-sky-500/10">
                <Radio size={28} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white light:text-slate-900 tracking-tight">
                  مدیریت سورس‌های بازار و تاریخچه نمودارها
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 light:text-slate-500 mt-1.5 leading-relaxed">
                  پیکربندی استخراج قیمت از کانال‌های تلگرام و وب‌سرویس‌های API، ثبت تاریخچه تفکیکی و گراف‌های اختصاصی
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                type="button"
                variant="primary"
                size="default"
                onClick={handleFetchAllNow}
                disabled={fetchingAll}
                isLoading={fetchingAll}
                className="h-11 px-5 shadow-lg shadow-sky-500/10 font-bold"
                title="فراخوانی همزمان تمام سورس‌های فعال و ثبت در تاریخچه دیتابیس"
              >
                <Zap size={16} />
                <span>{fetchingAll ? 'در حال دریافت نرخ‌ها...' : 'دریافت آنی قیمت همه سورس‌ها'}</span>
              </Button>

              <Button
                type="button"
                variant="gold"
                size="default"
                onClick={() => handleOpenAddSource(sourceFilter === 'all' ? 'usd' : sourceFilter)}
                className="h-11 px-5 shadow-lg shadow-amber-500/10 font-bold"
              >
                <Plus size={17} strokeWidth={2.5} />
                <span>افزودن سورس جدید</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Global Notification Banner */}
        {message && (
          <div
            className={cn(
              'flex items-center gap-2.5 p-4 rounded-2xl text-xs font-semibold animate-in fade-in duration-200 shadow-lg',
              message.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-emerald-500/5'
                : message.type === 'error'
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-rose-500/5'
                : 'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sky-500/5'
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
            ) : message.type === 'error' ? (
              <AlertCircle size={18} className="shrink-0 text-rose-400" />
            ) : (
              <Activity size={18} className="shrink-0 text-sky-400" />
            )}
            <span className="text-xs sm:text-sm">{message.text}</span>
          </div>
        )}

        {/* ── SECTION 1: Individual Source Selector & Dedicated Chart ───────── */}
        <section ref={chartSectionRef} className="flex flex-col gap-4">
          {/* Source Tabs Bar */}
          <div className="flex flex-col gap-3 p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-[#0f1422]/95 light:bg-white light:border-slate-200 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-extrabold text-slate-200 light:text-slate-800">
                <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <LineChart size={14} />
                </div>
                <span>انتخاب سورس برای مشاهده نمودار تحلیلی:</span>
              </div>
              <span className="text-xs text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/5">
                {sources.length.toLocaleString('fa-IR')} سورس تعریف‌شده
              </span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {sources.map((src) => {
                const isSelected = src.id === selectedSourceId;
                const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, dotColor: 'bg-sky-400' };
                return (
                  <button
                    key={src.id}
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap select-none',
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30'
                        : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08] hover:border-white/15 light:bg-slate-100 light:text-slate-700 light:border-slate-200'
                    )}
                    onClick={() => setSelectedSourceId(src.id)}
                  >
                    <span className={cn('w-2 h-2 rounded-full shrink-0', typeInfo.dotColor, isSelected && 'animate-pulse ring-2 ring-amber-400/30')} />
                    <span className="font-bold">{src.name}</span>
                    {src.lastPrice > 0 && (
                      <span className="bg-black/30 light:bg-slate-200 px-2 py-0.5 rounded-md font-mono text-[11px] font-black text-amber-400 light:text-amber-700">
                        {formatNum(src.lastPrice)}
                      </span>
                    )}
                    {src.isPrimary && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded font-bold">
                        <Star size={10} className="fill-amber-400 text-amber-400" />
                        مرجع
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

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
            <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-white/[0.08] bg-[#0f1422] text-center text-slate-400 shadow-xl">
              <Activity size={36} className="text-slate-500 mb-3" />
              <p className="text-sm sm:text-base font-bold text-white">هیچ سورسی برای نمایش نمودار یافت نشد.</p>
              <span className="text-xs text-slate-400 mt-1">برای مشاهده نمودار اختصاصی، یک سورس از جدول زیر تعریف یا انتخاب کنید.</span>
            </div>
          )}
        </section>

        {/* ── SECTION 2: Sources Overview Cards Grid ──────────────────────── */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-extrabold text-slate-200 light:text-slate-800">
              <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Activity size={14} />
              </div>
              <span>نمای کلی سورس‌های فعال بازار</span>
            </div>
            <span className="text-xs text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/5">
              {sources.length.toLocaleString('fa-IR')} سورس
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-5">
            {sources.map((src) => {
              const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
              const isSelected = src.id === selectedSourceId;

              return (
                <Card
                  key={src.id}
                  onClick={() => handleSelectSourceForChart(src)}
                  className={cn(
                    'cursor-pointer border-white/[0.08] bg-[#0f1422] hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/5 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between rounded-2xl',
                    isSelected && 'ring-2 ring-amber-500/50 border-amber-500/50 bg-[#121829]'
                  )}
                >
                  <CardHeader className="p-4 sm:p-5 pb-2 flex flex-row items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[11px] font-semibold">
                        {typeInfo.label}
                      </Badge>
                      {src.isPrimary && (
                        <Badge variant="gold" className="text-[10px] gap-1 font-bold">
                          <Star size={10} className="fill-amber-400 text-amber-400" />
                          <span>مرجع</span>
                        </Badge>
                      )}
                    </div>
                    <Badge variant={src.isActive ? 'success' : 'default'} className="text-[10px] font-bold">
                      {src.isActive ? 'فعال' : 'غیرفعال'}
                    </Badge>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-5 py-2 flex flex-col gap-2">
                    <h4 className="text-sm sm:text-base font-extrabold text-white light:text-slate-900 truncate">
                      {src.name}
                    </h4>
                    <span className="text-xs text-slate-400 font-mono dir-ltr text-end truncate block bg-black/25 px-2.5 py-1 rounded-lg border border-white/5">
                      {src.sourceType === 'telegram'
                        ? `@${(src.channelUsername || src.endpoint || '').replace(/^@/, '')}`
                        : (src.apiUrl || src.endpoint || 'API URL')}
                    </span>

                    <div className="mt-2 flex items-baseline gap-2">
                      {src.lastPrice > 0 ? (
                        <>
                          <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono tracking-tight">
                            {formatNum(src.lastPrice)}
                          </span>
                          <span className="text-xs text-slate-400 font-normal">تومان</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500 italic py-1">هنوز دریافت نشده</span>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="p-4 sm:p-5 pt-3 flex items-center justify-between text-xs text-slate-400 border-t border-white/[0.06] light:border-slate-100">
                    <span className="text-[11px] text-slate-400">
                      {src.lastFetched ? formatPersianDate(src.lastFetched) : 'بدون ثبت تاریخچه'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs font-semibold text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 rounded-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSourceForChart(src);
                      }}
                    >
                      <LineChart size={13} className="me-1.5" />
                      <span>نمودار</span>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── SECTION 3: Unified Management Table ─────────────────────────── */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-[#0f1422] light:bg-white light:border-slate-200 shadow-xl">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-extrabold text-slate-200 light:text-slate-800">
              <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Sliders size={14} />
              </div>
              <h3 className="text-sm sm:text-base font-extrabold m-0">جدول مدیریت و پیکربندی سورس‌ها</h3>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                className={cn(
                  'px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none',
                  sourceFilter === 'all'
                    ? 'bg-amber-500 text-slate-950 font-black border-amber-500 shadow-md shadow-amber-500/20'
                    : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08] light:bg-slate-100 light:text-slate-700 light:border-slate-200'
                )}
                onClick={() => setSourceFilter('all')}
              >
                <span>همه</span>
                <span className="ms-1 opacity-80">({sources.length.toLocaleString('fa-IR')})</span>
              </button>
              {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => {
                const count = sources.filter((s) => s.priceType === key).length;
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      'px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none',
                      sourceFilter === key
                        ? 'bg-amber-500 text-slate-950 font-black border-amber-500 shadow-md shadow-amber-500/20'
                        : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08] light:bg-slate-100 light:text-slate-700 light:border-slate-200'
                    )}
                    onClick={() => setSourceFilter(key)}
                  >
                    <span>{info.label}</span>
                    <span className="ms-1 opacity-80">({count.toLocaleString('fa-IR')})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table Container */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f1422] overflow-hidden shadow-2xl light:bg-white light:border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام سورس و آدرس</TableHead>
                  <TableHead>نوع نرخ</TableHead>
                  <TableHead>پروتکل</TableHead>
                  <TableHead>تنظیمات استخراج</TableHead>
                  <TableHead>آخرین قیمت استخراجی</TableHead>
                  <TableHead>سورس مرجع</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-center">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-slate-400">
                      {loadingSources ? 'در حال دریافت لیست سورس‌ها...' : 'هیچ سورسی در این دسته‌بندی یافت نشد.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSources.map((src) => {
                    const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
                    const isRowTesting = rowTestingId === src.id;
                    const rowResult = rowTestResults[src.id];
                    const isSelectedInChart = src.id === selectedSourceId;

                    return (
                      <React.Fragment key={src.id}>
                        <TableRow className={cn(isSelectedInChart && 'bg-amber-500/[0.04]')}>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <strong className="text-sm font-bold text-white light:text-slate-900">
                                {src.name}
                              </strong>
                              <span className="text-xs text-slate-400 font-mono dir-ltr text-end truncate max-w-[180px]">
                                {src.sourceType === 'telegram'
                                  ? `@${(src.channelUsername || src.endpoint || '').replace(/^@/, '')}`
                                  : (src.apiUrl || src.endpoint || '')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={src.sourceType === 'telegram' ? 'telegram' : 'success'}>
                              {src.sourceType === 'telegram' ? 'کانال تلگرام' : 'وب‌سرویس API'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span
                              className="text-xs font-mono dir-ltr text-end block max-w-[200px] truncate text-slate-400"
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
                          </TableCell>
                          <TableCell>
                            {src.lastPrice && Number(src.lastPrice) > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                <strong className="text-sm font-bold text-emerald-400">
                                  {formatNum(src.lastPrice)} تومان
                                </strong>
                                <span className="text-[10px] text-slate-400">
                                  {formatPersianDate(src.lastFetched)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">هنوز دریافت نشده</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {src.isPrimary ? (
                              <Badge variant="gold" className="gap-1">
                                <Star size={11} className="fill-amber-400" />
                                <span>مرجع</span>
                              </Badge>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetPrimary(src)}
                                title="تبدیل به سورس مرجع"
                                className="h-7 px-2 text-xs"
                              >
                                <Star size={11} />
                                <span>انتخاب مرجع</span>
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(src)}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer select-none',
                                src.isActive
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : 'bg-white/5 text-slate-400 border-white/10'
                              )}
                              title={src.isActive ? 'کلیک برای غیرفعال‌سازی' : 'کلیک برای فعال‌سازی'}
                            >
                              <span className={cn('w-1.5 h-1.5 rounded-full', src.isActive ? 'bg-emerald-400' : 'bg-slate-500')} />
                              <span>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleTestRowSource(src)}
                                disabled={isRowTesting}
                                title="تست استخراج قیمت"
                                className="text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                              >
                                <PlayCircle size={15} className={isRowTesting ? 'animate-spin' : ''} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleSelectSourceForChart(src)}
                                title="مشاهده نمودار"
                                className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                              >
                                <LineChart size={15} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleOpenEditSource(src)}
                                title="ویرایش"
                                className="text-slate-300 hover:text-white"
                              >
                                <Edit3 size={15} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleDeleteSource(src)}
                                title="حذف سورس"
                                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                              >
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Inline Test Result Banner */}
                        {rowResult && (
                          <TableRow className="bg-black/30 light:bg-slate-50">
                            <TableCell colSpan={8} className="py-2.5 px-4">
                              <div className="flex items-center justify-between text-xs gap-2">
                                {rowResult.success ? (
                                  <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                    <CheckCircle2 size={15} className="shrink-0" />
                                    <span>
                                      قیمت با موفقیت استخراج و ثبت شد: <strong>{formatNum(rowResult.price)} تومان</strong>
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-rose-400 font-medium">
                                    <AlertCircle size={15} className="shrink-0" />
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
                                  className="text-slate-400 hover:text-white p-1"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* ── SECTION 4: Add/Edit Modal (Dialog) ─────────────────────────────── */}
        <Dialog open={sourceModalOpen} onOpenChange={setSourceModalOpen}>
          <DialogContent onClose={() => setSourceModalOpen(false)}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Radio className="text-sky-400 w-5 h-5" />
                <DialogTitle>
                  {editingSourceId ? 'ویرایش سورس قیمت' : 'افزودن سورس قیمت جدید'}
                </DialogTitle>
              </div>
              <DialogDescription>
                مشخصات استخراج قیمت از کانال تلگرام یا وب‌سرویس API و الگوی تطابق را تنظیم کنید.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveModalSource}>
              <DialogBody className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <Label>نام سورس:</Label>
                  <Input
                    required
                    placeholder="مثال: دلار هرات فردایی، سبزه میدان، صرافی زرما..."
                    value={sourceForm.name}
                    onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>نوع قیمت:</Label>
                    <select
                      className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 light:bg-slate-50 light:border-slate-200 light:text-slate-900"
                      value={sourceForm.priceType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        const defaultPattern = PRESET_REGEX_PATTERNS[newType]?.[0]?.pattern || '';
                        setSourceForm({
                          ...sourceForm,
                          priceType: newType,
                          regexPattern: defaultPattern || sourceForm.regexPattern,
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

                  <div className="flex flex-col gap-1.5">
                    <Label>پروتکل استخراج:</Label>
                    <select
                      className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 light:bg-slate-50 light:border-slate-200 light:text-slate-900"
                      value={sourceForm.sourceType}
                      onChange={(e) => setSourceForm({ ...sourceForm, sourceType: e.target.value })}
                    >
                      <option value="telegram">کانال عمومی تلگرام (بدون نیاز به توکن)</option>
                      <option value="api_url">وب‌سرویس خارجی (REST API JSON)</option>
                    </select>
                  </div>
                </div>

                {sourceForm.sourceType === 'telegram' ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>نام کاربری یا آیدی کانال تلگرام:</Label>
                    <div className="flex items-center gap-2 dir-ltr">
                      <span className="text-slate-400 font-mono text-sm">@</span>
                      <Input
                        required
                        placeholder="tahran_sabza یا herat_rate"
                        value={sourceForm.channelUsername}
                        onChange={(e) =>
                          setSourceForm({
                            ...sourceForm,
                            channelUsername: e.target.value.replace(/^@/, '').trim(),
                          })
                        }
                        className="dir-ltr text-start flex-1"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label>آدرس URL وب‌سرویس API:</Label>
                      <Input
                        type="url"
                        required
                        placeholder="https://api.example.com/rates/live"
                        value={sourceForm.apiUrl}
                        onChange={(e) => setSourceForm({ ...sourceForm, apiUrl: e.target.value.trim() })}
                        className="dir-ltr text-start font-mono text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label>مسیر کلید در JSON (اختیاری):</Label>
                      <Input
                        placeholder="data.usd.price یا stats[0].latest"
                        value={sourceForm.jsonPath}
                        onChange={(e) => setSourceForm({ ...sourceForm, jsonPath: e.target.value.trim() })}
                        className="dir-ltr text-start font-mono text-xs"
                      />
                    </div>
                  </>
                )}

                {/* Regex Configuration */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <Label>الگوی رجکس (Regex Pattern):</Label>
                    <span className="text-[11px] text-slate-400">فلگ چندخطی <code className="text-amber-400">ims</code></span>
                  </div>
                  <Input
                    placeholder="مثال: ([\d,]+)\s*فروش"
                    value={sourceForm.regexPattern}
                    onChange={(e) => setSourceForm({ ...sourceForm, regexPattern: e.target.value })}
                    className="dir-ltr text-start font-mono text-xs"
                  />

                  {PRESET_REGEX_PATTERNS[sourceForm.priceType] && (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 light:bg-slate-50 light:border-slate-100 flex flex-col gap-2 mt-1">
                      <span className="text-xs font-semibold text-slate-300 light:text-slate-700 flex items-center gap-1.5">
                        <Sparkles size={13} className="text-amber-400" />
                        الگوهای آماده برای {PRICE_TYPE_INFO[sourceForm.priceType]?.label}:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_REGEX_PATTERNS[sourceForm.priceType].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-white/[0.04] border border-white/10 hover:border-amber-500/50 hover:bg-amber-500/10 transition-colors text-slate-300 light:bg-white light:border-slate-200 light:text-slate-700 cursor-pointer"
                            onClick={() => setSourceForm({ ...sourceForm, regexPattern: preset.pattern })}
                          >
                            <span>{preset.label}</span>
                            <code className="text-amber-400 opacity-90 text-[10px]">{preset.pattern}</code>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>گروه استخراج رجکس:</Label>
                    <Input
                      type="number"
                      min="1"
                      max="9"
                      value={sourceForm.regexGroupIndex}
                      onChange={(e) => setSourceForm({ ...sourceForm, regexGroupIndex: e.target.value })}
                      className="dir-ltr text-center"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>بازه استخراج خودکار (دقیقه):</Label>
                    <Input
                      type="number"
                      min="1"
                      max="1440"
                      value={sourceForm.fetchIntervalMinutes}
                      onChange={(e) => setSourceForm({ ...sourceForm, fetchIntervalMinutes: e.target.value })}
                      className="dir-ltr text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300 light:text-slate-700 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourceForm.isActive}
                      onChange={(e) => setSourceForm({ ...sourceForm, isActive: e.target.checked })}
                      className="rounded border-white/20 text-amber-500 focus:ring-amber-500/40 w-4 h-4 cursor-pointer"
                    />
                    <span>سورس فعال باشد</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300 light:text-slate-700 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourceForm.isPrimary}
                      onChange={(e) => setSourceForm({ ...sourceForm, isPrimary: e.target.checked })}
                      className="rounded border-white/20 text-amber-500 focus:ring-amber-500/40 w-4 h-4 cursor-pointer"
                    />
                    <span>به عنوان سورس مرجع این نرخ تنظیم شود</span>
                  </label>
                </div>

                {/* Modal Test Area */}
                <div className="flex flex-col gap-2 pt-2 border-t border-white/5 light:border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestModalSource}
                    disabled={modalTesting}
                    isLoading={modalTesting}
                    className="self-start text-xs"
                  >
                    <PlayCircle size={14} />
                    <span>{modalTesting ? 'در حال برقراری ارتباط...' : 'تست اتصال و استخراج قبل از ذخیره'}</span>
                  </Button>

                  {modalTestResult && (
                    <div
                      className={cn(
                        'p-3 rounded-xl text-xs font-medium border animate-in fade-in duration-150',
                        modalTestResult.success
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      )}
                    >
                      {modalTestResult.success ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-400" />
                            <strong>قیمت استخراج شده: {formatNum(modalTestResult.price)} تومان</strong>
                          </div>
                          {modalTestResult.post_text && (
                            <div className="bg-black/30 p-2 rounded-lg border border-white/10 font-mono text-[11px] text-slate-300 max-h-24 overflow-y-auto">
                              <pre className="whitespace-pre-wrap">{modalTestResult.post_text.substring(0, 200)}...</pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertCircle size={16} className="text-rose-400" />
                          <span>خطا: {modalTestResult.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </DialogBody>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setSourceModalOpen(false)}>
                  انصراف
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={modalSaving}
                  isLoading={modalSaving}
                >
                  <Save size={15} />
                  <span>{modalSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره سورس قیمت'}</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>

      <Footer />
    </div>
  );
}
