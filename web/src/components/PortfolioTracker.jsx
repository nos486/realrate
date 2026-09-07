import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  apiGetPortfolios,
  apiCreatePortfolio,
  apiUpdatePortfolio,
  apiDeletePortfolio,
  apiGetPortfolio,
  apiAddPortfolioHolding,
  apiUpdatePortfolioHolding,
  apiDeletePortfolioHolding,
} from '../api/client.js';
import UserSettingsModal from './UserSettingsModal.jsx';

export const ASSET_TYPES = [
  // طلا و مسکوکات
  { id: 'gold_18k', name: 'طلای ۱۸ عیار', unit: 'گرم', category: 'gold' },
  { id: 'gold_24k', name: 'طلای ۲۴ عیار', unit: 'گرم', category: 'gold' },
  { id: 'full_new', name: 'سکه امامی', unit: 'عدد', category: 'coin' },
  { id: 'full_old', name: 'سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'half', name: 'نیم سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'quarter', name: 'ربع سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'gram', name: 'سکه گرمی', unit: 'عدد', category: 'coin' },

  // نقره (Silver)
  { id: 'silver_999', name: 'نقره خام و ساچمه ۹۹۹', unit: 'گرم', category: 'silver' },
  { id: 'silver_925', name: 'نقره استرلینگ ۹۲۵', unit: 'گرم', category: 'silver' },
  { id: 'silver_ounce', name: 'انس جهانی نقره', unit: 'اونس', category: 'silver' },

  // ارزهای خارجی و رمزارزها
  { id: 'USD', name: 'دلار آمریکا', unit: 'دلار', category: 'currency' },
  { id: 'USDT', name: 'تتر', unit: 'تتر', category: 'crypto' },
  { id: 'EUR', name: 'یورو اروپا', unit: 'یورو', category: 'currency' },
  { id: 'AED', name: 'درهم امارات', unit: 'درهم', category: 'currency' },
  { id: 'TRY', name: 'لیر ترکیه', unit: 'لیر', category: 'currency' },
  { id: 'GBP', name: 'پوند انگلیس', unit: 'پوند', category: 'currency' },
  { id: 'CAD', name: 'دلار کانادا', unit: 'دلار', category: 'currency' },
  { id: 'BTC', name: 'بیت‌کوین', unit: 'عدد', category: 'crypto' },
  { id: 'ETH', name: 'اتریوم', unit: 'عدد', category: 'crypto' },

  // دارایی شخصی و سفارشی (Custom Asset)
  { id: 'custom', name: '✨ دارایی شخصی / سفارشی', unit: 'واحد', category: 'custom' },
];

export function formatAssetName(item) {
  if (!item) return '';
  const assetId = item.assetId || (typeof item === 'string' ? item : null);
  const matched = ASSET_TYPES.find((a) => a.id === assetId && a.id !== 'custom');
  if (matched) return matched.name;
  const raw = typeof item === 'string' ? item : (item.assetName || item.name || '');
  return raw.replace(/\s*\([^)]*\)/g, '').trim() || raw;
}

export const CATEGORY_DEFINITIONS = [
  {
    key: 'gold',
    name: 'طلا و آب‌شده',
    icon: '🥇',
    match: (item) => item.assetType === 'gold',
  },
  {
    key: 'coin',
    name: 'سکه‌های بهار آزادی',
    icon: '🪙',
    match: (item) => item.assetType === 'coin',
  },
  {
    key: 'silver',
    name: 'نقره و مسکوکات',
    icon: '🥈',
    match: (item) => item.assetType === 'silver',
  },
  {
    key: 'currency',
    name: 'ارزهای خارجی و رمزارزها',
    icon: '💵',
    match: (item) => item.assetType === 'currency' || item.assetType === 'crypto',
  },
  {
    key: 'custom',
    name: 'دارایی‌های شخصی و سفارشی',
    icon: '✨',
    match: (item) => item.assetType === 'custom' || (!['gold', 'coin', 'silver', 'currency', 'crypto'].includes(item.assetType)),
  },
];

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

function parseInputNumber(val) {
  if (!val) return 0;
  const pers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let s = String(val);
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(pers[i], 'g'), i);
  }
  return parseFloat(s.replace(/,/g, '')) || 0;
}

const PERSIAN_MONTHS = [
  { value: '01', label: 'فروردین' },
  { value: '02', label: 'اردیبهشت' },
  { value: '03', label: 'خرداد' },
  { value: '04', label: 'تیر' },
  { value: '05', label: 'مرداد' },
  { value: '06', label: 'شهریور' },
  { value: '07', label: 'مهر' },
  { value: '08', label: 'آبان' },
  { value: '09', label: 'آذر' },
  { value: '10', label: 'دی' },
  { value: '11', label: 'بهمن' },
  { value: '12', label: 'اسفند' }
];

const YEARS_LIST = Array.from({ length: 18 }, (_, i) => String(1390 + i)).reverse();
const DAYS_LIST = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

function getTodayShamsi() {
  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch (e) {
    return '';
  }
}

function gregorianToShamsi(dateStr) {
  try {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    return dateStr;
  }
}

function parseShamsiDate(str) {
  const parts = (str || '').split('/');
  if (parts.length === 3 && parts[0].length === 4) {
    return {
      year: parts[0].trim(),
      month: parts[1].trim().padStart(2, '0'),
      day: parts[2].trim().padStart(2, '0')
    };
  }
  const todayParts = getTodayShamsi().split('/');
  return {
    year: todayParts[0] || '1405',
    month: todayParts[1] || '01',
    day: todayParts[2] || '01'
  };
}

export default function PortfolioTracker({ calcData, rates, usdToman, goldUsd }) {
  const { user, loading: authLoading, triggerLogin } = useAuth();

  // Multi-portfolio State
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

  // Refs to avoid circular state-dependencies in fetchPortfoliosAndHoldings
  const activePortfolioIdRef = useRef(activePortfolioId);
  activePortfolioIdRef.current = activePortfolioId;
  const switchingRef = useRef(false);

  // New Portfolio Modal State
  const [newPortfolioModalOpen, setNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);

  const [holdings, setHoldings] = useState([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Active Portfolio Resolution
  const activePortfolio = useMemo(() => {
    return portfolios.find((p) => p.id === activePortfolioId) || portfolios[0] || null;
  }, [portfolios, activePortfolioId]);

  // Privacy Mode State (Mask values as ****)
  const [hideValues, setHideValues] = useState(() => {
    try {
      return localStorage.getItem('realrate_hide_values') === 'true';
    } catch {
      return false;
    }
  });

  const toggleHideValues = () => {
    setHideValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('realrate_hide_values', String(next));
      } catch {}
      return next;
    });
  };

  // Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Modal Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState('gold_18k');
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('واحد');
  const [customCurrentPrice, setCustomCurrentPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState('');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const nativeDateRef = useRef(null);

  const handleSetToday = () => {
    setBuyDate(getTodayShamsi());
  };

  const handleDatePartChange = (part, val) => {
    const current = parseShamsiDate(buyDate);
    const updated = { ...current, [part]: val };
    setBuyDate(`${updated.year}/${updated.month}/${updated.day}`);
  };

  // 1. Fetch Portfolios and Holdings for active portfolio
  const fetchPortfoliosAndHoldings = useCallback(async (targetPortfolioId = null) => {
    if (!user) {
      setPortfolios([]);
      setHoldings([]);
      setActivePortfolioId(null);
      setLoadingPortfolios(false);
      setLoadingHoldings(false);
      return;
    }

    // Extract valid string portfolioId, ignoring any settings objects or event objects passed in callbacks
    const validTargetId = (typeof targetPortfolioId === 'string' && targetPortfolioId.trim() && targetPortfolioId !== '[object Object]')
      ? targetPortfolioId.trim()
      : (typeof targetPortfolioId === 'object' && targetPortfolioId !== null && typeof targetPortfolioId.portfolioId === 'string' && targetPortfolioId.portfolioId.trim())
        ? targetPortfolioId.portfolioId.trim()
        : (typeof targetPortfolioId === 'object' && targetPortfolioId !== null && typeof targetPortfolioId.id === 'string' && targetPortfolioId.id.trim())
          ? targetPortfolioId.id.trim()
          : null;

    try {
      setLoadingPortfolios(true);
      const res = await apiGetPortfolios();
      if (res.success && Array.isArray(res.portfolios) && res.portfolios.length > 0) {
        setPortfolios(res.portfolios);

        // Keep current active if valid, or use target, or default/first
        const currentActive = activePortfolioIdRef.current;
        const exists = currentActive && res.portfolios.some((p) => p.id === currentActive);
        const targetExists = validTargetId && res.portfolios.some((p) => p.id === validTargetId);

        const resolvedId = targetExists
          ? validTargetId
          : (exists ? currentActive : (res.portfolios.find((p) => p.isDefault)?.id || res.portfolios[0]?.id));
        
        setActivePortfolioId(resolvedId);
        activePortfolioIdRef.current = resolvedId;

        setLoadingHoldings(true);
        const holdingsRes = await apiGetPortfolio(resolvedId);
        if (holdingsRes.success && Array.isArray(holdingsRes.holdings)) {
          setHoldings(holdingsRes.holdings);
        }
      }
    } catch (err) {
      console.error('Failed to fetch portfolios:', err);
    } finally {
      setLoadingPortfolios(false);
      setLoadingHoldings(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPortfoliosAndHoldings();
  }, [fetchPortfoliosAndHoldings]);

  // Lock background body scroll when any modal is open
  useEffect(() => {
    if (modalOpen || settingsModalOpen || newPortfolioModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [modalOpen, settingsModalOpen, newPortfolioModalOpen]);

  // Handle switching active portfolio
  const handleSelectPortfolio = async (portfolioId) => {
    if (!portfolioId || portfolioId === activePortfolioId || switchingRef.current) return;
    switchingRef.current = true;
    setActivePortfolioId(portfolioId);
    setLoadingHoldings(true);
    try {
      const res = await apiGetPortfolio(portfolioId);
      if (res.success && Array.isArray(res.holdings)) {
        setHoldings(res.holdings);
      }
    } catch (err) {
      console.error('Failed to load portfolio holdings:', err);
    } finally {
      setLoadingHoldings(false);
      switchingRef.current = false;
    }
  };

  // Handle creating a new portfolio
  const handleCreatePortfolio = async (e) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;
    setCreatingPortfolio(true);
    try {
      const res = await apiCreatePortfolio({ name: newPortfolioName.trim() });
      if (res.success && res.portfolio) {
        setNewPortfolioName('');
        setNewPortfolioModalOpen(false);
        await fetchPortfoliosAndHoldings(res.portfolio.id);
      }
    } catch (err) {
      alert('خطا در ساخت پورتفو: ' + (err.message || 'نامعتبر'));
    } finally {
      setCreatingPortfolio(false);
    }
  };

  // Handle setting active portfolio as default
  const handleSetDefaultPortfolio = async (portfolioId) => {
    if (!portfolioId || settingDefault) return;
    setSettingDefault(true);
    try {
      const res = await apiUpdatePortfolio({ id: portfolioId, isDefault: true });
      if (res.success) {
        setPortfolios((prev) =>
          prev.map((p) => ({
            ...p,
            isDefault: p.id === portfolioId,
          }))
        );
      } else {
        alert(res.message || 'خطا در تعیین پورتفوی پیش‌فرض');
      }
    } catch (err) {
      console.error('Error setting default portfolio:', err);
      alert('خطا در ارتباط با سرور.');
    } finally {
      setSettingDefault(false);
    }
  };

  // Handle deleting active portfolio
  const handleDeleteActivePortfolio = async () => {
    if (!activePortfolio) return;
    if (portfolios.length <= 1) {
      alert('امکان حذف تنها پورتفوی فعال وجود ندارد. هر کاربر باید حداقل یک پورتفو داشته باشد.');
      return;
    }
    const confirmMsg = `آیا از حذف پورتفوی «${activePortfolio.name}» و تمام دارایی‌های درون آن اطمینان دارید؟`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await apiDeletePortfolio(activePortfolio.id);
      if (res.success) {
        setSettingsModalOpen(false);
        await fetchPortfoliosAndHoldings();
      }
    } catch (err) {
      alert('خطا در حذف پورتفو: ' + (err.message || 'نامعتبر'));
    }
  };

  // Active USD & Spot Gold & Silver resolution
  const usdVal = useMemo(() => {
    return parseInputNumber(usdToman) || rates?.live_usd_toman || calcData?.inputs?.usd_toman || 0;
  }, [usdToman, rates, calcData]);

  const goldUsdVal = useMemo(() => {
    return parseInputNumber(goldUsd) || rates?.gold_usd || calcData?.inputs?.gold_usd || 2450;
  }, [goldUsd, rates, calcData]);

  const silverUsdVal = useMemo(() => {
    return calcData?.silver?.silver_usd || rates?.silver_usd || rates?.silver?.silver_usd || 33.5;
  }, [calcData, rates]);

  // 2. Real / Intrinsic Price Calculation (قیمت فقط بر اساس ارزش واقعی با طلا، نقره، دلار یا قیمت خود کالا)
  const realPriceMap = useMemo(() => {
    const map = {};
    if (!usdVal) return map;

    // A. Gold calculations (Pure intrinsic gold value)
    if (goldUsdVal) {
      const gold_24k_gram = (goldUsdVal / 31.1034768) * usdVal;
      map['gold_24k'] = Math.round(gold_24k_gram);
      map['gold_18k'] = Math.round(gold_24k_gram * 0.75);
      map['full_new'] = Math.round(gold_24k_gram * 7.3197);
      map['full_old'] = Math.round(gold_24k_gram * 7.3197);
      map['half'] = Math.round(gold_24k_gram * 3.6594);
      map['quarter'] = Math.round(gold_24k_gram * 1.8297);
      map['gram'] = Math.round(gold_24k_gram * 0.909);
    }

    // B. Silver calculations (Pure intrinsic silver value)
    if (silverUsdVal) {
      const silver_999_gram = (silverUsdVal / 31.1034768) * usdVal;
      map['silver_999'] = Math.round(silver_999_gram);
      map['silver_925'] = Math.round(silver_999_gram * 0.925);
      map['silver_ounce'] = Math.round(silverUsdVal * usdVal);
    }

    // C. Currencies (Cross rate * usdVal)
    map['USD'] = Math.round(usdVal);
    map['USDT'] = Math.round(usdVal);

    const currList = calcData?.currencies || rates?.currencies;
    if (currList && Array.isArray(currList)) {
      currList.forEach((c) => {
        if (c.code) {
          const cross = c.usd_cross_rate || 1;
          map[c.code] = Math.round(cross * usdVal);
        }
      });
    }

    return map;
  }, [usdVal, goldUsdVal, silverUsdVal, calcData, rates]);

  // 3. Open Modal for Adding
  const handleOpenAdd = () => {
    setEditingHolding(null);
    setSelectedAssetId('gold_18k');
    setCustomName('');
    setCustomUnit('واحد');
    setCustomCurrentPrice('');
    setAmount('');
    setBuyPrice('');
    setBuyDate('');
    setNotes('');
    setShowDatePicker(false);
    setModalOpen(true);
  };

  // 4. Open Modal for Editing
  const handleOpenEdit = (item) => {
    setEditingHolding(item);
    const isKnown = ASSET_TYPES.some((a) => a.id === item.assetId && a.id !== 'custom');
    if (isKnown) {
      setSelectedAssetId(item.assetId);
      setCustomName('');
      setCustomUnit(item.unit || 'واحد');
      setCustomCurrentPrice(item.currentPrice ? String(item.currentPrice) : '');
    } else {
      setSelectedAssetId('custom');
      setCustomName(item.assetName || '');
      setCustomUnit(item.unit || 'واحد');
      setCustomCurrentPrice(item.currentPrice ? String(item.currentPrice) : '');
    }
    setAmount(String(item.amount));
    setBuyPrice(item.buyPrice && Number(item.buyPrice) > 0 ? String(item.buyPrice) : '');
    setBuyDate(item.buyDate || '');
    setNotes(item.notes || '');
    setShowDatePicker(false);
    setModalOpen(true);
  };

  // 5. Handle Submit (Add or Edit)
  const handleSubmitHolding = async (e) => {
    e.preventDefault();
    const qty = parseInputNumber(amount);
    const rawPrice = buyPrice ? parseInputNumber(buyPrice) : 0;
    const price = rawPrice > 0 ? rawPrice : 0;

    if (qty <= 0) {
      alert('لطفاً مقدار یا وزن معتبری برای دارایی وارد فرمایید.');
      return;
    }

    if (rawPrice < 0) {
      alert('قیمت خرید نمی‌تواند عددی منفی باشد.');
      return;
    }

    const isCustom = selectedAssetId === 'custom';
    const assetMeta = ASSET_TYPES.find((a) => a.id === selectedAssetId);

    const finalName = isCustom
      ? (customName.trim() || 'دارایی شخصی')
      : (assetMeta?.name || selectedAssetId);

    const finalUnit = isCustom
      ? (customUnit.trim() || 'واحد')
      : (assetMeta?.unit || 'واحد');

    const finalCategory = isCustom
      ? 'custom'
      : (assetMeta?.category || 'custom');

    const finalCurrentPrice = isCustom
      ? (parseInputNumber(customCurrentPrice) || price || 0)
      : (realPriceMap[selectedAssetId] || price || 0);

    setSubmitting(true);

    try {
      const payload = {
        id: editingHolding ? editingHolding.id : undefined,
        portfolioId: activePortfolio?.id || null,
        assetId: isCustom ? (editingHolding?.assetId?.startsWith('custom_') ? editingHolding.assetId : `custom_${Date.now()}`) : selectedAssetId,
        assetName: finalName,
        assetType: finalCategory,
        unit: finalUnit,
        amount: qty,
        buyPrice: price,
        currentPrice: finalCurrentPrice,
        buyDate: buyDate.trim(),
        notes: notes.trim(),
      };

      if (editingHolding) {
        const res = await apiUpdatePortfolioHolding(payload);
        if (res.success && res.item) {
          setHoldings((prev) => prev.map((h) => (h.id === editingHolding.id ? res.item : h)));
          setModalOpen(false);
          setEditingHolding(null);
        } else {
          alert(res.message || 'خطا در ذخیره تغییرات دارایی');
        }
      } else {
        const res = await apiAddPortfolioHolding(payload);
        if (res.success && res.item) {
          setHoldings((prev) => [res.item, ...prev]);
          if (activePortfolio?.id) {
            setPortfolios((prev) =>
              prev.map((p) =>
                p.id === activePortfolio.id ? { ...p, itemCount: (p.itemCount || 0) + 1 } : p
              )
            );
          }
          setModalOpen(false);
        } else {
          alert(res.message || 'خطا در ثبت دارایی');
        }
      }
    } catch (err) {
      console.error('Error saving holding:', err);
      alert('خطا در برقراری ارتباط با سرور.');
    } finally {
      setSubmitting(false);
    }
  };

  // 6. Handle Delete Holding from Database
  const handleDeleteHolding = async (id) => {
    if (!window.confirm('آیا از حذف این دارایی از پورتفو اطمینان دارید؟')) return;

    setDeletingId(id);
    try {
      const res = await apiDeletePortfolioHolding(id);
      if (res.success) {
        setHoldings((prev) => prev.filter((h) => h.id !== id));
        if (activePortfolio?.id) {
          setPortfolios((prev) =>
            prev.map((p) =>
              p.id === activePortfolio.id
                ? { ...p, itemCount: Math.max(0, (p.itemCount || 1) - 1) }
                : p
            )
          );
        }
      } else {
        alert(res.message || 'خطا در حذف دارایی');
      }
    } catch (err) {
      console.error('Error deleting holding:', err);
      alert('خطا در حذف دارایی از سرور.');
    } finally {
      setDeletingId(null);
    }
  };

  // 7. Portfolio Metrics & Calculations (Based on Real / Intrinsic Value)
  const portfolioMetrics = useMemo(() => {
    let totalCost = 0;
    let totalRealValue = 0;

    const items = holdings.map((h) => {
      const amountNum = Number(h.amount) || 0;
      const buyPriceNum = Number(h.buyPrice) || 0;
      const hasBuyPrice = buyPriceNum > 0;
      const isCustomItem = h.assetType === 'custom' || h.assetId?.startsWith('custom_');

      // Unit real price: strictly based on spot gold/silver & USD, or custom price
      const unitRealPrice = isCustomItem
        ? (Number(h.currentPrice) || (hasBuyPrice ? buyPriceNum : 0))
        : (realPriceMap[h.assetId] || (hasBuyPrice ? buyPriceNum : 0));

      const itemCost = hasBuyPrice ? amountNum * buyPriceNum : 0;
      const itemRealVal = amountNum * unitRealPrice;
      const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
      const itemPnlPct = hasBuyPrice && itemCost > 0 ? (itemPnl / itemCost) * 100 : null;

      if (hasBuyPrice) {
        totalCost += itemCost;
      }
      totalRealValue += itemRealVal;

      return {
        ...h,
        hasBuyPrice,
        isCustomItem,
        unitRealPrice,
        itemCost,
        itemRealVal,
        itemPnl,
        itemPnlPct,
      };
    });

    const costedItems = items.filter((it) => it.hasBuyPrice);
    const hasAnyCost = costedItems.length > 0 && totalCost > 0;
    const totalPnl = costedItems.reduce((sum, it) => sum + (it.itemPnl || 0), 0);
    const totalPnlPct = hasAnyCost ? (totalPnl / totalCost) * 100 : 0;

    return {
      items,
      totalCost,
      totalRealValue,
      totalPnl,
      totalPnlPct,
      hasAnyCost,
    };
  }, [holdings, realPriceMap]);

  // 8. Grouped Categories with Sub-Totals (Real Value and PnL)
  const categoryGroups = useMemo(() => {
    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = portfolioMetrics.items.filter(cat.match);
      const costedGroupItems = groupItems.filter((it) => it.hasBuyPrice);
      const hasCostedItems = costedGroupItems.length > 0;
      const groupCost = costedGroupItems.reduce((acc, it) => acc + it.itemCost, 0);
      const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
      const groupPnl = costedGroupItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
      const groupPnlPct = groupCost > 0 ? (groupPnl / groupCost) * 100 : 0;
      return {
        ...cat,
        items: groupItems,
        totalCost: groupCost,
        totalRealValue: groupRealVal,
        totalPnl: hasCostedItems ? groupPnl : null,
        totalPnlPct: groupPnlPct,
        hasCostedItems,
      };
    }).filter((group) => group.items.length > 0);
  }, [portfolioMetrics.items]);

  const isModalCustom = selectedAssetId === 'custom';
  const selectedAssetMeta = ASSET_TYPES.find((a) => a.id === selectedAssetId);
  const currentModalRealPrice = realPriceMap[selectedAssetId] || 0;

  // 9. Export Portfolio to CSV with UTF-8 BOM
  const handleExportCSV = useCallback(() => {
    if (!activePortfolio || portfolioMetrics.items.length === 0) {
      alert('دارایی برای دریافت خروجی در این پورتفو وجود ندارد.');
      return;
    }

    const headers = [
      'نام دارایی',
      'دسته‌بندی',
      'نوع دارایی',
      'مقدار / وزن',
      'واحد',
      'قیمت خرید واحد (تومان)',
      'بهای تمام‌شده کل (تومان)',
      'قیمت واقعی روز واحد (تومان)',
      'ارزش واقعی روز کل (تومان)',
      'سود / زیان کل (تومان)',
      'درصد سود / زیان',
      'تاریخ خرید',
      'یادداشت / توضیحات'
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = portfolioMetrics.items.map((item) => {
      const assetTypeLabel =
        item.assetType === 'silver' ? 'نقره' :
        item.assetType === 'gold' ? 'طلا' :
        item.assetType === 'coin' ? 'سکه' :
        item.assetType === 'currency' ? 'ارز' :
        item.assetType === 'crypto' ? 'کریپتو' : 'سفارشی';

      const catLabel =
        item.assetType === 'gold' ? 'طلا و آب‌شده' :
        item.assetType === 'coin' ? 'سکه بهار آزادی' :
        item.assetType === 'silver' ? 'نقره ساچمه و شمش' :
        item.assetType === 'currency' || item.assetType === 'crypto' ? 'ارزهای خارجی و رمزارزها' : 'سایر دارایی‌ها';

      return [
        escapeCSV(formatAssetName(item)),
        escapeCSV(catLabel),
        escapeCSV(assetTypeLabel),
        escapeCSV(item.amount),
        escapeCSV(item.unit),
        escapeCSV(item.hasBuyPrice ? item.buyPrice : ''),
        escapeCSV(item.hasBuyPrice ? item.itemCost : ''),
        escapeCSV(item.unitRealPrice),
        escapeCSV(item.itemRealVal),
        escapeCSV(item.hasBuyPrice ? item.itemPnl : ''),
        escapeCSV(item.hasBuyPrice && item.itemPnlPct !== null ? item.itemPnlPct.toFixed(2) + '%' : ''),
        escapeCSV(item.buyDate || ''),
        escapeCSV(item.notes || '')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (activePortfolio.name || 'portfolio').replace(/[/\\?%*:|"<>]/g, '-');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `portfolio-${safeName}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activePortfolio, portfolioMetrics.items]);

  // ─── AUTH GATE (Required Login Screen) ──────────────────────────────────
  if (authLoading) {
    return (
      <div className="portfolio-loading-state">
        <div className="spinner-glow"></div>
        <p>در حال بارگذاری اطلاعات کاربری...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="portfolio-auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-badge">
            <span className="lock-icon">🔒</span>
            <span className="badge-text">نیازمند ورود به حساب کاربری</span>
          </div>

          <h3 className="auth-gate-title">مدیریت هوشمند پورتفوی سرمایه‌گذاری</h3>
          <p className="auth-gate-desc">
            اطلاعات دارایی‌های شما به صورت امن در پایگاه داده ابری ذخیره شده و ارزش واقعی آنها
            بر پایه نرخ لحظه‌ای انس جهانی طلا، نقره و دلار محاسبه می‌گردد.
          </p>

          <div className="auth-gate-features">
            <div className="gate-feature-item">
              <span className="feature-icon">☁️</span>
              <div className="feature-info">
                <strong>ذخیره ابری دائمی در دیتابیس</strong>
                <span>دسترسی به پورتفو از تمام دستگاه‌ها بدون از دست رفتن داده‌ها</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon">💎</span>
              <div className="feature-info">
                <strong>محاسبه بر پایه ارزش واقعی و خالص</strong>
                <span>محاسبه خالص ارزش طلا و نقره بر اساس انس جهانی و دلار بدون حباب</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon">✨</span>
              <div className="feature-info">
                <strong>پشتیبانی از طلا، نقره، ارز و دارایی‌های شخصی</strong>
                <span>امکان ثبت انواع سکه، طلا، نقره، ارزها و دارایی‌های دلخواه (بورس، مسکن و...)</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon">✏️</span>
              <div className="feature-info">
                <strong>امکان ویرایش، ثبت تاریخ و یادداشت</strong>
                <span>ویرایش آسان مقادیر، زمان دقیق خرید، قیمت تمام‌شده و توضیحات هر دارایی</span>
              </div>
            </div>
          </div>

          <div className="auth-gate-actions">
            <button className="btn-google-gate-login" onClick={triggerLogin}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>ورود سریع و امن با حساب گوگل</span>
            </button>
            <span className="gate-privacy-note">🔒 اطلاعات پورتفوی شما فقط برای خودتان قابل مشاهده است.</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── LOGGED IN VIEW ─────────────────────────────────────────────────────
  return (
    <div className="portfolio-section">
      {/* Portfolios Navigation Bar */}
      <div className="portfolio-nav-bar">
        <div className="portfolio-tabs-scroll">
          <span className="portfolio-nav-label">پورتفوها:</span>
          {portfolios.map((p) => {
            const isActive = p.id === activePortfolio?.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`portfolio-tab-pill ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectPortfolio(p.id)}
              >
                <span className="tab-pill-icon">{p.isDefault ? '⭐' : '📁'}</span>
                <span className="tab-pill-name">{p.name}</span>
                {p.shareEnabled && (
                  <span className="tab-pill-shared" title="لینک اشتراک‌گذاری عمومی فعال است">🔗</span>
                )}
                <span className="tab-pill-count">
                  {(p.id === activePortfolio?.id ? holdings.length : (p.itemCount ?? 0)).toLocaleString('fa-IR')}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="btn-new-portfolio-tab"
            onClick={() => setNewPortfolioModalOpen(true)}
            title="ایجاد پورتفوی جدید با نام دلخواه"
          >
            <span>+ پورتفوی جدید</span>
          </button>
        </div>

        {activePortfolio && (
          <div className="portfolio-bar-actions">
            <button
              type="button"
              className="btn-portfolio-settings"
              onClick={() => setSettingsModalOpen(true)}
              title="تنظیمات، اشتراک‌گذاری، پیش‌فرض و حذف پورتفو"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>تنظیمات پورتفو</span>
            </button>
          </div>
        )}
      </div>

      {/* Two Column Split: Right (Content & Holdings Tables), Left (Overview Summary Cards) */}
      <div className="portfolio-layout-split">
        {/* Right Column: Holdings List Grouped by Category */}
        <div className="portfolio-content-column">
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <h3>📋 جزئیات {activePortfolio?.name ? `پورتفوی «${activePortfolio.name}»` : 'سبد دارایی'} ({user.name || user.email})</h3>
                <span>
                  محاسبه بر پایه ارزش واقعی طلا (${goldUsdVal ? goldUsdVal.toLocaleString() : ''})، نقره (${silverUsdVal ? silverUsdVal.toFixed(2) : ''}) و نرخ دلار ({formatNum(usdVal)} تومان)
                </span>
              </div>
              <div className="portfolio-header-actions">
                <button
                  type="button"
                  className="btn-export-csv icon-only"
                  onClick={handleExportCSV}
                  title="دریافت خروجی اکسل / CSV از اقلام این پورتفو"
                  aria-label="خروجی CSV"
                  disabled={holdings.length === 0}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </button>
                <button
                  type="button"
                  className={`btn-privacy-toggle icon-only ${hideValues ? 'active' : ''}`}
                  onClick={toggleHideValues}
                  title={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی کردن مبالغ با ****'}
                  aria-label={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی کردن مبالغ با ****'}
                >
                  {hideValues ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {loadingHoldings ? (
              <div className="portfolio-empty-state">
                <div className="spinner-glow"></div>
                <p>در حال دریافت اطلاعات پورتفوی شما از دیتابیس...</p>
              </div>
            ) : portfolioMetrics.items.length === 0 ? (
              <div className="portfolio-empty-state">
                <div className="empty-icon">💼</div>
                <h4>هنوز دارایی در پورتفوی شما ثبت نشده است</h4>
                <p>
                  می‌توانید انواع طلا، سکه، نقره ساچمه و استرلینگ، ارزها یا دارایی‌های دلخواه خود (سهام بورس، صندوق، مسکن و...) را
                  ثبت کنید تا سود و زیان آنها بر مبنای ارزش واقعی رصد شود.
                </p>
                <button className="btn-add-asset-center" onClick={handleOpenAdd}>
                  + ثبت اولین دارایی
                </button>
              </div>
            ) : (
              <div className="portfolio-categories-container">
                {categoryGroups.map((group) => (
                  <div key={group.key} className="category-group-card">
                    {/* Category Subtotal Header */}
                    <div className="category-group-header">
                      <div className="cat-header-identity">
                        <span className="cat-group-icon">{group.icon}</span>
                        <div className="cat-group-titles">
                          <h4 className="cat-group-name">{group.name}</h4>
                          <span className="cat-group-count">{group.items.length.toLocaleString('fa-IR')} قلم</span>
                        </div>
                      </div>

                      <div className="cat-header-subtotals">
                        <div className="cat-subtotal-val">
                          <span className="subtotal-label">ارزش مجموعه:</span>
                          <strong className={`subtotal-amount ${hideValues ? 'is-masked' : ''}`}>
                            {hideValues ? '****' : formatNum(group.totalRealValue)}
                          </strong>
                          <span className="subtotal-unit">تومان</span>
                        </div>

                        {group.hasCostedItems && (
                          <div className={`cat-subtotal-pnl ${group.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                            <span className="subtotal-pnl-label">سود/زیان:</span>
                            <strong>
                              {hideValues ? '**** تومان' : `${group.totalPnl >= 0 ? '+' : ''}${formatNum(group.totalPnl)} تومان`}
                            </strong>
                            <span className="subtotal-pnl-pct">
                              {hideValues ? '(****)' : `(${group.totalPnl >= 0 ? '+' : ''}${group.totalPnlPct.toFixed(1).replace('-', '')}٪)`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* High-density Data Table for this category */}
                    <div className="portfolio-table-responsive">
                      <table className="portfolio-data-table">
                        <thead>
                          <tr>
                            <th className="th-asset">دارایی</th>
                            <th className="th-qty">مقدار / وزن</th>
                            <th className="th-buy-price">قیمت خرید (واحد)</th>
                            <th className="th-real-price">قیمت واقعی روز</th>
                            <th className="th-total-val">ارزش کل روز</th>
                            <th className="th-pnl">سود / زیان</th>
                            <th className="th-date">تاریخ خرید</th>
                            <th className="th-notes">یادداشت / توضیحات</th>
                            <th className="th-actions">عملیات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => {
                            const isProfit = (item.itemPnl || 0) >= 0;
                            const isDeleting = deletingId === item.id;
                            return (
                              <tr key={item.id} className="portfolio-table-row">
                                <td className="td-asset">
                                  <div className="asset-cell-compact">
                                    <span className="asset-name-text">{formatAssetName(item)}</span>
                                    <span className={`item-category-pill cat-${item.assetType || 'custom'}`}>
                                      {item.assetType === 'silver' ? '🥈 نقره' :
                                       item.assetType === 'gold' ? '🥇 طلا' :
                                       item.assetType === 'coin' ? '🪙 سکه' :
                                       item.assetType === 'currency' ? '💵 ارز' :
                                       item.assetType === 'crypto' ? '⚡ کریپتو' : '✨ سفارشی'}
                                    </span>
                                  </div>
                                </td>

                                <td className="td-qty">
                                  <span className="table-qty-badge">
                                    {hideValues ? '****' : `${Number(item.amount).toLocaleString('fa-IR')} ${item.unit}`}
                                  </span>
                                </td>

                                <td className="td-buy-price">
                                  {item.hasBuyPrice ? (
                                    <div className="cell-currency-wrap">
                                      <span className={`cell-val ${hideValues ? 'is-masked' : ''}`}>
                                        {hideValues ? '****' : formatNum(item.buyPrice)}
                                      </span>
                                      <span className="cell-unit">تومان</span>
                                    </div>
                                  ) : (
                                    <span className="table-notes-text" title="قیمت خرید وارد نشده است">—</span>
                                  )}
                                </td>

                                <td className="td-real-price">
                                  <div className="cell-currency-wrap">
                                    <span className={`cell-val real-val ${hideValues ? 'is-masked' : ''}`} title="محاسبه مستقیم بر مبنای ارزش واقعی">
                                      {hideValues ? '****' : formatNum(item.unitRealPrice)}
                                    </span>
                                    <span className="cell-unit">تومان</span>
                                  </div>
                                </td>

                                <td className="td-total-val">
                                  <div className="cell-currency-wrap">
                                    <strong className={`cell-val-bold gold-text ${hideValues ? 'is-masked' : ''}`}>
                                      {hideValues ? '****' : formatNum(item.itemRealVal)}
                                    </strong>
                                    <span className="cell-unit">تومان</span>
                                  </div>
                                </td>

                                <td className="td-pnl">
                                  {item.hasBuyPrice ? (
                                    <div className={`table-pnl-cell ${isProfit ? 'profit' : 'loss'}`}>
                                      <span className={`pnl-amount ${hideValues ? 'is-masked' : ''}`}>
                                        {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(item.itemPnl)} تومان`}
                                      </span>
                                      <span className="pnl-pct-badge">
                                        {hideValues ? '****' : `(${isProfit ? '+' : ''}${item.itemPnlPct?.toFixed(1).replace('-', '')}٪)`}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="table-notes-text" title="بدون قیمت خرید در سود و زیان محاسبه نمی‌شود">—</span>
                                  )}
                                </td>

                                <td className="td-date">
                                  <span className="table-date-text">
                                    {item.buyDate ? `📅 ${item.buyDate}` : '—'}
                                  </span>
                                </td>

                                <td className="td-notes">
                                  <span className="table-notes-text" title={item.notes || ''}>
                                    {item.notes ? `💬 ${item.notes}` : '—'}
                                  </span>
                                </td>

                                <td className="td-actions">
                                  <div className="row-actions-group">
                                    <button
                                      type="button"
                                      className="btn-table-action edit"
                                      title="ویرایش دارایی"
                                      onClick={() => handleOpenEdit(item)}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-table-action delete"
                                      title="حذف از پورتفو"
                                      disabled={isDeleting}
                                      onClick={() => handleDeleteHolding(item.id)}
                                    >
                                      {isDeleting ? (
                                        <div className="mini-spinner"></div>
                                      ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6"></polyline>
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Left Column: Summary Overview Cards */}
        <div className="portfolio-sidebar-column">
          <div className="portfolio-overview-grid">
            {/* Card 1: Total Real Value */}
            <div className="portfolio-stat-card main-val">
              <div className="stat-header">
                <span className="stat-label">ارزش واقعی کل {activePortfolio?.name ? `(«${activePortfolio.name}»)` : 'دارایی‌ها'}</span>
                <span className="real-pill">
                  🌐 انس طلا + نقره + دلار
                </span>
              </div>
              <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
                {hideValues ? '****' : formatNum(portfolioMetrics.totalRealValue)}
                <span className="stat-unit">تومان</span>
              </div>
              <div className="stat-sub">
                سرمایه اولیه خرید: {portfolioMetrics.hasAnyCost ? (hideValues ? '**** تومان' : `${formatNum(portfolioMetrics.totalCost)} تومان`) : 'ثبت‌نشده (محاسبه صرفاً به نرخ روز)'}
              </div>
            </div>

            {/* Card 2: Total PnL */}
            <div className={`portfolio-stat-card pnl-card ${portfolioMetrics.hasAnyCost ? (portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss') : 'neutral'}`}>
              <div className="stat-header">
                <span className="stat-label">سود / زیان واقعی کل</span>
                {portfolioMetrics.hasAnyCost ? (
                  <span className={`pnl-badge ${portfolioMetrics.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                    {hideValues ? '****' : `${portfolioMetrics.totalPnl >= 0 ? '+' : ''}${portfolioMetrics.totalPnlPct.toFixed(2).replace('-', '')}٪`}
                  </span>
                ) : (
                  <span className="pnl-badge neutral">—</span>
                )}
              </div>
              <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                {portfolioMetrics.hasAnyCost ? (
                  <>
                    {hideValues ? '****' : `${portfolioMetrics.totalPnl >= 0 ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`}
                    <span className="stat-unit">تومان</span>
                  </>
                ) : (
                  <span className="stat-sub" style={{ fontSize: '15px' }}>بدون قیمت خرید</span>
                )}
              </div>
              <div className="stat-sub">
                {portfolioMetrics.hasAnyCost ? (
                  portfolioMetrics.totalPnl >= 0 ? '🟢 پورتفوی شما در سود است' : '🔴 پورتفوی شما در زیان است'
                ) : (
                  'ارزش اقلام صرفاً به نرخ روز محاسبه می‌شود'
                )}
              </div>
            </div>

            {/* Card 3: Actions & Count */}
            <div className="portfolio-stat-card action-card">
              <div className="stat-header">
                <span className="stat-label">مدیریت سبد دارایی</span>
                <span className="count-pill">{holdings.length} قلم دارایی</span>
              </div>
              <button className="btn-add-asset" onClick={handleOpenAdd}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>افزودن دارایی جدید</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Asset Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => !submitting && setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingHolding ? '✏️ ویرایش دارایی در پورتفو' : '➕ افزودن دارایی به پورتفو'}</h3>
              <button
                className="modal-close-btn"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitHolding} className="modal-form">
              <div className="form-item">
                <label>نوع دارایی</label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="form-select"
                >
                  <optgroup label="طلا و مسکوکات">
                    <option value="gold_18k">طلای ۱۸ عیار</option>
                    <option value="gold_24k">طلای ۲۴ عیار</option>
                    <option value="full_new">سکه امامی</option>
                    <option value="full_old">سکه بهار آزادی</option>
                    <option value="half">نیم سکه بهار آزادی</option>
                    <option value="quarter">ربع سکه بهار آزادی</option>
                    <option value="gram">سکه گرمی</option>
                  </optgroup>

                  <optgroup label="نقره (Silver)">
                    <option value="silver_999">نقره خام و ساچمه ۹۹۹</option>
                    <option value="silver_925">نقره استرلینگ ۹۲۵</option>
                    <option value="silver_ounce">انس جهانی نقره</option>
                  </optgroup>

                  <optgroup label="ارزهای خارجی و کریپتو">
                    <option value="USD">دلار آمریکا</option>
                    <option value="USDT">تتر</option>
                    <option value="EUR">یورو اروپا</option>
                    <option value="AED">درهم امارات</option>
                    <option value="TRY">لیر ترکیه</option>
                    <option value="GBP">پوند انگلیس</option>
                    <option value="CAD">دلار کانادا</option>
                    <option value="BTC">بیت‌کوین</option>
                    <option value="ETH">اتریوم</option>
                  </optgroup>

                  <optgroup label="دارایی‌های دلخواه">
                    <option value="custom">✨ دارایی شخصی / سفارشی</option>
                  </optgroup>
                </select>
              </div>

              {/* Custom Asset Specific Fields */}
              {isModalCustom && (
                <div className="form-row-dual">
                  <div className="form-item flex-1">
                    <label>نام دارایی سفارشی</label>
                    <input
                      type="text"
                      placeholder="مثلاً صندوق طلای کهربا یا سهام فولاد"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-item flex-1">
                    <label>واحد شمارش</label>
                    <input
                      type="text"
                      placeholder="مثلاً سهم، واحد، متر، عدد"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-item">
                <label>
                  مقدار یا تعداد ({isModalCustom ? (customUnit || 'واحد') : selectedAssetMeta?.unit})
                </label>
                <input
                  type="text"
                  placeholder={`مثلاً ${selectedAssetMeta?.unit === 'گرم' ? '۱۵.۵' : '۲'}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-item">
                <label>
                  قیمت خرید هر واحد (اختیاری - به ازای هر {isModalCustom ? (customUnit || 'واحد') : selectedAssetMeta?.unit} - تومان)
                </label>
                <input
                  type="text"
                  placeholder="مثلاً ۵۴,۲۰۰,۰۰۰ (اختیاری)"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="form-input"
                />
                <span className="field-sub-note">در صورت خالی گذاشتن، دارایی در سود و زیان وارد نمی‌شود و صرفاً طبق قیمت روز در پورتفو محاسبه می‌گردد.</span>
              </div>

              {/* Custom Asset: Current Market Price field */}
              {isModalCustom && (
                <div className="form-item">
                  <label>قیمت روز هر واحد در بازار (تومان)</label>
                  <input
                    type="text"
                    placeholder="جهت محاسبه زنده ارزش و سود/زیان"
                    value={customCurrentPrice}
                    onChange={(e) => setCustomCurrentPrice(e.target.value)}
                    className="form-input"
                  />
                  <span className="field-sub-note">در صورت خالی ماندن، برابر با قیمت خرید در نظر گرفته می‌شود.</span>
                </div>
              )}

              <div className="form-row-dual">
                <div className="form-item flex-1">
                  <div className="label-with-action">
                    <label>تاریخ یا زمان خرید (اختیاری)</label>
                    <button
                      type="button"
                      className="btn-set-today"
                      onClick={handleSetToday}
                      title="تنظیم خودکار تاریخ امروز"
                    >
                      ⚡ امروز
                    </button>
                  </div>
                  <div className="date-input-wrap">
                    <input
                      type="text"
                      placeholder="مثلاً ۱۴۰۳/۱۱/۲۰ یا آبان ۱۴۰۳"
                      value={buyDate}
                      onChange={(e) => setBuyDate(e.target.value)}
                      className="form-input date-text-input"
                    />
                    <button
                      type="button"
                      className={`btn-toggle-datepicker ${showDatePicker ? 'active' : ''}`}
                      onClick={() => setShowDatePicker((prev) => !prev)}
                      title="انتخاب از تقویم شمسی"
                    >
                      📅
                    </button>
                    {/* Hidden native system date picker */}
                    <input
                      type="date"
                      ref={nativeDateRef}
                      className="hidden-native-date-picker"
                      onChange={(e) => {
                        if (e.target.value) {
                          setBuyDate(gregorianToShamsi(e.target.value));
                        }
                      }}
                    />
                  </div>

                  {/* Shamsi Date Selector Popover Box */}
                  {showDatePicker && (
                    <div className="shamsi-date-selector-box">
                      <div className="date-selector-row">
                        {/* Day Select */}
                        <div className="date-select-col">
                          <span className="select-col-label">روز:</span>
                          <select
                            value={parseShamsiDate(buyDate).day}
                            onChange={(e) => handleDatePartChange('day', e.target.value)}
                            className="form-select date-part-select"
                          >
                            {DAYS_LIST.map((d) => (
                              <option key={d} value={d}>
                                {Number(d).toLocaleString('fa-IR')}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Month Select */}
                        <div className="date-select-col">
                          <span className="select-col-label">ماه:</span>
                          <select
                            value={parseShamsiDate(buyDate).month}
                            onChange={(e) => handleDatePartChange('month', e.target.value)}
                            className="form-select date-part-select"
                          >
                            {PERSIAN_MONTHS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Year Select */}
                        <div className="date-select-col">
                          <span className="select-col-label">سال:</span>
                          <select
                            value={parseShamsiDate(buyDate).year}
                            onChange={(e) => handleDatePartChange('year', e.target.value)}
                            className="form-select date-part-select"
                          >
                            {YEARS_LIST.map((y) => (
                              <option key={y} value={y}>
                                {Number(y).toLocaleString('fa-IR')}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="date-selector-footer">
                        <button
                          type="button"
                          className="btn-date-today-mini"
                          onClick={() => handleSetToday()}
                        >
                          ⚡ امروز
                        </button>
                        <button
                          type="button"
                          className="btn-date-system-mini"
                          onClick={() => {
                            try {
                              nativeDateRef.current?.showPicker?.() || nativeDateRef.current?.click();
                            } catch {
                              nativeDateRef.current?.click();
                            }
                          }}
                          title="باز کردن تقویم سیستمی"
                        >
                          🗓️ تقویم سیستم
                        </button>
                        <button
                          type="button"
                          className="btn-date-done-mini"
                          onClick={() => setShowDatePicker(false)}
                        >
                          تأیید ✓
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-item flex-1">
                  <label>توضیحات و یادداشت (اختیاری)</label>
                  <input
                    type="text"
                    placeholder="مثلاً خرید از بورس یا بازار"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              {/* Real Price Hint Box (for standard assets) */}
              {!isModalCustom && currentModalRealPrice > 0 && (
                <div className="live-hint-box-detailed">
                  <div className="hint-row">
                    <span className="hint-label">💎 قیمت واقعی بر اساس طلای جهانی و دلار:</span>
                    <strong className="hint-val-sky">{formatNum(currentModalRealPrice)} تومان</strong>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  disabled={submitting}
                  onClick={() => setModalOpen(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submitting}>
                  {submitting
                    ? 'در حال ذخیره‌سازی...'
                    : editingHolding
                    ? 'ذخیره تغییرات'
                    : 'ثبت در دیتابیس پورتفو'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Portfolio Modal */}
      {newPortfolioModalOpen && (
        <div className="modal-backdrop" onClick={() => !creatingPortfolio && setNewPortfolioModalOpen(false)}>
          <div className="modal-content new-portfolio-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">📁</span>
                <h3>ایجاد پورتفوی جدید</h3>
              </div>
              <button
                className="modal-close-btn"
                disabled={creatingPortfolio}
                onClick={() => setNewPortfolioModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreatePortfolio} className="modal-form">
              <div className="form-item">
                <label>نام پورتفو (سبد دارایی)</label>
                <input
                  type="text"
                  placeholder="مثلاً: پس‌انداز طلا، سبد ارزی، صندوق بازنشستگی..."
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  className="form-input"
                  required
                  autoFocus
                />
                <span className="field-sub-note">
                  برای هر پورتفو می‌توانید لینک اشتراک‌گذاری و رمز عبور مستقل تنظیم کنید.
                </span>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  disabled={creatingPortfolio}
                  onClick={() => setNewPortfolioModalOpen(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn-modal-submit"
                  disabled={creatingPortfolio || !newPortfolioName.trim()}
                >
                  {creatingPortfolio ? 'در حال ایجاد...' : 'ایجاد پورتفو'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User & Share Settings Modal */}
      <UserSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        portfolio={activePortfolio}
        canDelete={portfolios.length > 1}
        onDelete={handleDeleteActivePortfolio}
        onSaved={(data) => {
          const targetId = (data && typeof data === 'object' && data.portfolioId)
            ? data.portfolioId
            : activePortfolio?.id;
          fetchPortfoliosAndHoldings(targetId);
        }}
      />
    </div>
  );
}
