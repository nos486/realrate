import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Award,
  Coins,
  Disc,
  Banknote,
  Zap,
  Sparkles,
  Lock,
  Unlock,
  Cloud,
  ShieldCheck,
  Pencil,
  Star,
  Folder,
  FolderPlus,
  Share2,
  Eye,
  EyeOff,
  AlertTriangle,
  Briefcase,
  Calendar,
  MessageSquare,
  Settings,
  Download,
  Trash2,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from './ui/Modal.jsx';
import NumericInput from './ui/NumericInput.jsx';
import {
  apiGetPortfolios,
  apiCreatePortfolio,
  apiDeletePortfolio,
  apiGetPortfolio,
  apiAddPortfolioHolding,
  apiUpdatePortfolioHolding,
  apiDeletePortfolioHolding,
  apiGetHistoricalBenchmarks,
} from '../api/client.js';
import UserSettingsModal from './UserSettingsModal.jsx';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  encryptHoldingForApi,
  decryptHoldingFromApi,
  saveVaultPassphraseToSession,
  getVaultPassphraseFromSession,
  clearVaultPassphraseFromSession,
} from '../lib/e2ee.js';

export const ASSET_TYPES = [
  // طلا و مسکوکات
  { id: 'gold_18k', name: 'طلای ۱۸ عیار', unit: 'گرم', category: 'gold' },
  { id: 'gold_melted', name: 'طلای آبشده (گرم ۱۸)', unit: 'گرم', category: 'gold' },
  { id: 'gold_24k', name: 'طلای ۲۴ عیار', unit: 'گرم', category: 'gold' },
  { id: 'full_new', name: 'سکه امامی', unit: 'عدد', category: 'coin' },
  { id: 'full_old', name: 'سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'half', name: 'نیم سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'quarter', name: 'ربع سکه بهار آزادی', unit: 'عدد', category: 'coin' },
  { id: 'bank_gram', name: 'سکه گرمی بانکی', unit: 'عدد', category: 'coin' },
  { id: 'gram', name: 'سکه گرمی بانکی', unit: 'عدد', category: 'coin' },

  // نقره (Silver)
  { id: 'silver_999', name: 'نقره خام و ساچمه ۹۹۹', unit: 'گرم', category: 'silver' },
  { id: 'silver_925', name: 'نقره استرلینگ ۹۲۵', unit: 'گرم', category: 'silver' },
  { id: 'silver_ounce', name: 'انس جهانی نقره', unit: 'اونس', category: 'silver' },

  // ارزهای خارجی و رمزارزها
  { id: 'USD', name: 'دلار آمریکا', unit: 'دلار', category: 'currency' },
  { id: 'USDT', name: 'تتر', unit: 'تتر', category: 'crypto' },
  { id: 'EUR', name: 'یورو اروپا', unit: 'یورو', category: 'currency' },
  { id: 'CHF', name: 'فرانک سوئیس', unit: 'فرانک', category: 'currency' },
  { id: 'AED', name: 'درهم امارات', unit: 'درهم', category: 'currency' },
  { id: 'TRY', name: 'لیر ترکیه', unit: 'لیر', category: 'currency' },
  { id: 'GBP', name: 'پوند انگلیس', unit: 'پوند', category: 'currency' },
  { id: 'CAD', name: 'دلار کانادا', unit: 'دلار', category: 'currency' },
  { id: 'BTC', name: 'بیت‌کوین', unit: 'عدد', category: 'crypto' },
  { id: 'ETH', name: 'اتریوم', unit: 'عدد', category: 'crypto' },

  // دارایی شخصی و سفارشی (Custom Asset)
  { id: 'custom', name: 'دارایی شخصی / سفارشی', unit: 'واحد', category: 'custom' },
];

export function CategoryIcon({ category, size = 18, className = '', style = {} }) {
  switch (category) {
    case 'gold':
      return <Award size={size} className={className} style={style} />;
    case 'coin':
      return <Coins size={size} className={className} style={style} />;
    case 'silver':
      return <Disc size={size} className={className} style={style} />;
    case 'currency':
      return <Banknote size={size} className={className} style={style} />;
    case 'crypto':
      return <Zap size={size} className={className} style={style} />;
    case 'custom':
    default:
      return <Sparkles size={size} className={className} style={style} />;
  }
}

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
    match: (item) => item.assetType === 'gold',
  },
  {
    key: 'coin',
    name: 'سکه‌های بهار آزادی',
    match: (item) => item.assetType === 'coin',
  },
  {
    key: 'silver',
    name: 'نقره و مسکوکات',
    match: (item) => item.assetType === 'silver',
  },
  {
    key: 'currency',
    name: 'ارزهای خارجی و رمزارزها',
    match: (item) => item.assetType === 'currency' || item.assetType === 'crypto',
  },
  {
    key: 'custom',
    name: 'دارایی‌های شخصی و سفارشی',
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

function parseDateToMs(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const parts = s.split('/');
  if (parts.length === 3 && parts[0].length === 4) {
    const jy = parseInt(parts[0], 10);
    const jm = parseInt(parts[1], 10);
    const jd = parseInt(parts[2], 10);
    if (jy > 1300 && jy < 1500) {
      const gy = jy + 621;
      return new Date(gy, Math.max(0, jm - 1), jd).getTime();
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export default function PortfolioTracker({ calcData, rates, usdToman, goldUsd, initialPortfolioId = null }) {
  const { user, loading: authLoading, triggerLogin } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  // Multi-portfolio State
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);

  // Refs to avoid circular state-dependencies in fetchPortfoliosAndHoldings
  const activePortfolioIdRef = useRef(activePortfolioId);
  useEffect(() => {
    activePortfolioIdRef.current = activePortfolioId;
  }, [activePortfolioId]);
  const switchingRef = useRef(false);

  // New Portfolio Modal State
  const [newPortfolioModalOpen, setNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);

  const [holdings, setHoldings] = useState([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // E2EE Vault State
  const [vaultKeys, setVaultKeys] = useState({}); // { [portfolioId]: CryptoKey }
  const vaultKeysRef = useRef(vaultKeys);
  useEffect(() => {
    vaultKeysRef.current = vaultKeys;
  }, [vaultKeys]);
  const [vaultUnlockPassInput, setVaultUnlockPassInput] = useState('');
  const [showVaultUnlockPass, setShowVaultUnlockPass] = useState(false);
  const [vaultUnlockError, setVaultUnlockError] = useState('');
  const [unlockingVault, setUnlockingVault] = useState(false);

  // Active Portfolio Resolution
  const activePortfolio = useMemo(() => {
    return portfolios.find((p) => p.id === activePortfolioId) || portfolios[0] || null;
  }, [portfolios, activePortfolioId]);

  const activeVaultKey = useMemo(() => {
    if (!activePortfolio?.id || !activePortfolio?.isE2ee) return null;
    return vaultKeys[activePortfolio.id] || null;
  }, [activePortfolio, vaultKeys]);

  const isVaultLocked = useMemo(() => {
    if (!activePortfolio?.id || !activePortfolio?.isE2ee) return false;
    return !activeVaultKey;
  }, [activePortfolio, activeVaultKey]);

  // Privacy Mode State (Mask values as ****)
  const [hideValues, setHideValues] = useState(() => {
    try {
      return localStorage.getItem('realrate_hide_values') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrivacyChange = () => {
      try {
        setHideValues(localStorage.getItem('realrate_hide_values') === 'true');
      } catch {}
    };
    window.addEventListener('realrate_privacy_change', onPrivacyChange);
    window.addEventListener('storage', onPrivacyChange);
    return () => {
      window.removeEventListener('realrate_privacy_change', onPrivacyChange);
      window.removeEventListener('storage', onPrivacyChange);
    };
  }, []);

  // Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Historical Benchmarks for 24h, 7d, 30d Portfolio Performance
  const [benchmarks, setBenchmarks] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // 'all', '24h', '7d', '30d'

  useEffect(() => {
    let isMounted = true;
    apiGetHistoricalBenchmarks()
      .then((res) => {
        if (isMounted && res?.success && res?.benchmarks) {
          setBenchmarks(res.benchmarks);
        }
      })
      .catch((err) => {
        console.warn('Failed to load historical benchmarks:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

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
      const res = await apiGetPortfolios();
      if (res.success && Array.isArray(res.portfolios) && res.portfolios.length > 0) {
        setPortfolios(res.portfolios);

        // Priority for resolving active portfolio:
        // 1. Explicit targetPortfolioId passed
        // 2. URL parameter :portfolioId or ?p= / ?id=
        // 3. initialPortfolioId prop
        // 4. Last visited portfolio in localStorage
        // 5. Default portfolio (isDefault) or first portfolio
        const urlParamId = params?.portfolioId || searchParams.get('p') || searchParams.get('id');
        let savedId = null;
        try {
          savedId = localStorage.getItem('realrate_last_portfolio_id');
        } catch {}

        const preferredId = validTargetId || urlParamId || initialPortfolioId || savedId;

        const currentActive = activePortfolioIdRef.current;
        const exists = currentActive && res.portfolios.some((p) => p.id === currentActive);
        const preferredExists = preferredId && res.portfolios.some((p) => p.id === preferredId);

        const resolvedId = preferredExists
          ? preferredId
          : (exists ? currentActive : (res.portfolios.find((p) => p.isDefault)?.id || res.portfolios[0]?.id));
        
        setActivePortfolioId(resolvedId);
        activePortfolioIdRef.current = resolvedId;
        try {
          localStorage.setItem('realrate_last_portfolio_id', resolvedId);
        } catch {}

        // Update URL path if on /portfolio and URL does not have resolvedId
        if (resolvedId && window.location.pathname.startsWith('/portfolio') && params?.portfolioId !== resolvedId) {
          navigate(`/portfolio/${resolvedId}`, { replace: true });
        }

        setLoadingHoldings(true);
        const holdingsRes = await apiGetPortfolio(resolvedId);
        if (holdingsRes.success && Array.isArray(holdingsRes.holdings)) {
          const rawItems = holdingsRes.holdings;
          const matchedP = res.portfolios.find((p) => p.id === resolvedId);
          if (matchedP?.isE2ee) {
            let key = vaultKeysRef.current[resolvedId];
            if (!key) {
              const sessionPass = getVaultPassphraseFromSession(resolvedId);
              if (sessionPass && matchedP.e2eeSalt) {
                try {
                  const derived = await deriveE2eeKey(sessionPass, matchedP.e2eeSalt);
                  const valid = await verifyE2eeKey(derived, matchedP.e2eeVerifier);
                  if (valid) {
                    key = derived;
                    setVaultKeys((prev) => ({ ...prev, [resolvedId]: derived }));
                  } else {
                    clearVaultPassphraseFromSession(resolvedId);
                  }
                } catch (e) {
                  console.error('Error auto-unlocking vault on fetch:', e);
                }
              }
            }

            if (key) {
              const decrypted = await Promise.all(rawItems.map((h) => decryptHoldingFromApi(key, h)));
              setHoldings(decrypted);
            } else {
              setHoldings(rawItems);
            }
          } else {
            setHoldings(rawItems);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch portfolios:', err);
    } finally {
      setLoadingHoldings(false);
    }
  }, [user, initialPortfolioId, params?.portfolioId, searchParams, navigate]);

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
  const handleSelectPortfolio = useCallback(async (portfolioId) => {
    if (!portfolioId || portfolioId === activePortfolioIdRef.current || switchingRef.current) return;
    switchingRef.current = true;
    setActivePortfolioId(portfolioId);
    activePortfolioIdRef.current = portfolioId;
    try {
      localStorage.setItem('realrate_last_portfolio_id', portfolioId);
    } catch {}

    if (window.location.pathname.startsWith('/portfolio')) {
      navigate(`/portfolio/${portfolioId}`, { replace: true });
    }

    setLoadingHoldings(true);
    setVaultUnlockPassInput('');
    setVaultUnlockError('');
    try {
      const res = await apiGetPortfolio(portfolioId);
      if (res.success && Array.isArray(res.holdings)) {
        const rawItems = res.holdings;
        const targetPortfolio = portfolios.find((p) => p.id === portfolioId);
        if (targetPortfolio?.isE2ee) {
          let key = vaultKeysRef.current[portfolioId];
          if (!key) {
            const sessionPass = getVaultPassphraseFromSession(portfolioId);
            if (sessionPass && targetPortfolio.e2eeSalt) {
              try {
                const derived = await deriveE2eeKey(sessionPass, targetPortfolio.e2eeSalt);
                const valid = await verifyE2eeKey(derived, targetPortfolio.e2eeVerifier);
                if (valid) {
                  key = derived;
                  setVaultKeys((prev) => ({ ...prev, [portfolioId]: derived }));
                } else {
                  clearVaultPassphraseFromSession(portfolioId);
                }
              } catch (e) {
                console.error('Error auto-unlocking vault on switch:', e);
              }
            }
          }

          if (key) {
            const decrypted = await Promise.all(rawItems.map((h) => decryptHoldingFromApi(key, h)));
            setHoldings(decrypted);
          } else {
            setHoldings(rawItems);
          }
        } else {
          setHoldings(rawItems);
        }
      }
    } catch (err) {
      console.error('Failed to load portfolio holdings:', err);
    } finally {
      setLoadingHoldings(false);
      switchingRef.current = false;
    }
  }, [portfolios, navigate]);

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
        try {
          localStorage.setItem('realrate_last_portfolio_id', res.portfolio.id);
        } catch {}
        if (window.location.pathname.startsWith('/portfolio')) {
          navigate(`/portfolio/${res.portfolio.id}`, { replace: true });
        }
        await fetchPortfoliosAndHoldings(res.portfolio.id);
      }
    } catch (err) {
      alert('خطا در ساخت پورتفو: ' + (err.message || 'نامعتبر'));
    } finally {
      setCreatingPortfolio(false);
    }
  };

  // Listen for browser Back/Forward navigation changing route portfolioId
  useEffect(() => {
    const routeId = params?.portfolioId;
    if (routeId && routeId !== activePortfolioIdRef.current && portfolios.length > 0) {
      const targetExists = portfolios.some((p) => p.id === routeId);
      if (targetExists) {
        handleSelectPortfolio(routeId);
      }
    }
  }, [params?.portfolioId, portfolios, handleSelectPortfolio]);

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
        try {
          localStorage.removeItem('realrate_last_portfolio_id');
        } catch {}
        await fetchPortfoliosAndHoldings();
      }
    } catch (err) {
      alert('خطا در حذف پورتفو: ' + (err.message || 'نامعتبر'));
    }
  };

  // Handle unlocking E2EE Vault
  const handleUnlockVault = async (e) => {
    if (e) e.preventDefault();
    if (!activePortfolio || !activePortfolio.isE2ee) return;
    const pass = vaultUnlockPassInput.trim();
    if (!pass) {
      setVaultUnlockError('لطفاً رمز عبور شخصی گاوصندوق را وارد فرمایید.');
      return;
    }
    setUnlockingVault(true);
    setVaultUnlockError('');
    try {
      const key = await deriveE2eeKey(pass, activePortfolio.e2eeSalt);
      const valid = await verifyE2eeKey(key, activePortfolio.e2eeVerifier);
      if (!valid) {
        setVaultUnlockError('رمز عبور وارد شده نادرست است.');
        setUnlockingVault(false);
        return;
      }
      saveVaultPassphraseToSession(activePortfolio.id, pass);
      setVaultKeys((prev) => ({ ...prev, [activePortfolio.id]: key }));

      // Decrypt holdings currently loaded in state
      const decrypted = await Promise.all(holdings.map((h) => decryptHoldingFromApi(key, h)));
      setHoldings(decrypted);
      setVaultUnlockPassInput('');
    } catch (err) {
      console.error('Unlock vault error:', err);
      setVaultUnlockError('خطا در بازگشایی گاوصندوق: ' + (err.message || 'نامعتبر'));
    } finally {
      setUnlockingVault(false);
    }
  };

  // Handle locking E2EE Vault
  const handleLockVault = async () => {
    if (!activePortfolio?.id) return;
    clearVaultPassphraseFromSession(activePortfolio.id);
    setVaultKeys((prev) => {
      const next = { ...prev };
      delete next[activePortfolio.id];
      return next;
    });
    try {
      setLoadingHoldings(true);
      const res = await apiGetPortfolio(activePortfolio.id);
      if (res.success && Array.isArray(res.holdings)) {
        setHoldings(res.holdings);
      }
    } catch (err) {
      console.error('Error locking vault:', err);
    } finally {
      setLoadingHoldings(false);
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

  // 2. Real / Intrinsic Price Calculation Helper (Pure, Zero Latency)
  const computePriceMap = useCallback((usd, goldUsd, silverUsd) => {
    const map = {};
    if (!usd || usd <= 0) return map;

    // A. Gold calculations (Pure intrinsic gold value)
    if (goldUsd && goldUsd > 0) {
      const gold_24k_gram = (goldUsd / 31.1034768) * usd;
      map['gold_24k'] = Math.round(gold_24k_gram);
      map['gold_18k'] = Math.round(gold_24k_gram * 0.75);
      map['gold_melted'] = Math.round(gold_24k_gram * 0.75);
      map['full_new'] = Math.round(gold_24k_gram * 7.3197);
      map['full_old'] = Math.round(gold_24k_gram * 7.3197);
      map['half'] = Math.round(gold_24k_gram * 3.6594);
      map['quarter'] = Math.round(gold_24k_gram * 1.8297);
      // سکه گرمی بانکی: وزن ۱.۰۱ گرم با عیار ۲۲ (۲۲/۲۴ = ۹۱۶.۶۶ در ۱۰۰۰)
      const bankGramVal = Math.round(gold_24k_gram * 1.01 * (22 / 24));
      map['bank_gram'] = bankGramVal;
      map['gram'] = bankGramVal;
    }

    // B. Silver calculations (Pure intrinsic silver value)
    if (silverUsd && silverUsd > 0) {
      const silver_999_gram = (silverUsd / 31.1034768) * usd;
      map['silver_999'] = Math.round(silver_999_gram);
      map['silver_925'] = Math.round(silver_999_gram * 0.925);
      map['silver_ounce'] = Math.round(silverUsd * usd);
    }

    // C. Currencies (Cross rate * usd)
    map['USD'] = Math.round(usd);
    map['USDT'] = Math.round(usd);
    map['EUR'] = Math.round((1 / 0.915) * usd);
    map['CHF'] = Math.round((1 / 0.865) * usd);
    map['AED'] = Math.round((1 / 3.6725) * usd);
    map['TRY'] = Math.round((1 / 33.5) * usd);
    map['GBP'] = Math.round((1 / 0.782) * usd);
    map['CAD'] = Math.round((1 / 1.37) * usd);

    return map;
  }, []);

  const realPriceMap = useMemo(() => {
    const map = computePriceMap(usdVal, goldUsdVal, silverUsdVal);
    const currList = calcData?.currencies || rates?.currencies;
    if (currList && Array.isArray(currList)) {
      currList.forEach((c) => {
        if (c.code) {
          const cross = c.usd_cross_rate || 1;
          map[c.code] = c.toman_price ? Math.round(c.toman_price) : Math.round(cross * usdVal);
        }
      });
    }
    return map;
  }, [usdVal, goldUsdVal, silverUsdVal, calcData, rates, computePriceMap]);

  // Historical price maps for 24h, 7d, and 30d performance tracking
  const historicalPriceMaps = useMemo(() => {
    const result = { '24h': {}, '7d': {}, '30d': {} };
    if (!usdVal || usdVal <= 0) return result;

    const periods = [
      { key: '24h', defUsdRatio: 0.995, defGoldRatio: 0.998 },
      { key: '7d',  defUsdRatio: 0.985, defGoldRatio: 0.992 },
      { key: '30d', defUsdRatio: 0.965, defGoldRatio: 0.980 },
    ];

    periods.forEach(({ key, defUsdRatio, defGoldRatio }) => {
      const bData = benchmarks?.[key] || {};
      const histUsd = bData.usd?.price || (usdVal * defUsdRatio);
      const histGold = bData.ons_gold?.price || (goldUsdVal * defGoldRatio);
      const histSilver = bData.ons_silver?.price || (silverUsdVal || 33.5);

      const map = computePriceMap(histUsd, histGold, histSilver);

      // Apply historical coin/gold overrides if explicitly recorded in benchmarks
      if (bData.gold_18k?.price) {
        map['gold_18k'] = Math.round(bData.gold_18k.price);
        map['gold_melted'] = Math.round(bData.gold_18k.price);
      }
      if (bData.full_coin?.price) {
        map['full_new'] = Math.round(bData.full_coin.price);
        map['full_old'] = Math.round(bData.full_coin.price);
      }
      if (bData.quarter_coin?.price) {
        map['quarter'] = Math.round(bData.quarter_coin.price);
      }

      result[key] = map;
    });

    return result;
  }, [benchmarks, usdVal, goldUsdVal, silverUsdVal, computePriceMap]);

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
      setSelectedAssetId(item.assetId === 'gram' ? 'bank_gram' : item.assetId);
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
      let payload = {
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

      if (activePortfolio?.isE2ee && activeVaultKey) {
        payload = await encryptHoldingForApi(activeVaultKey, payload);
      }

      if (editingHolding) {
        const res = await apiUpdatePortfolioHolding(payload);
        if (res.success && res.item) {
          let savedItem = res.item;
          if (activePortfolio?.isE2ee && activeVaultKey) {
            savedItem = await decryptHoldingFromApi(activeVaultKey, savedItem);
          }
          setHoldings((prev) => prev.map((h) => (h.id === editingHolding.id ? savedItem : h)));
          setModalOpen(false);
          setEditingHolding(null);
        } else {
          alert(res.message || 'خطا در ذخیره تغییرات دارایی');
        }
      } else {
        const res = await apiAddPortfolioHolding(payload);
        if (res.success && res.item) {
          let savedItem = res.item;
          if (activePortfolio?.isE2ee && activeVaultKey) {
            savedItem = await decryptHoldingFromApi(activeVaultKey, savedItem);
          }
          setHoldings((prev) => [savedItem, ...prev]);
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
      const itemPnlPct = hasBuyPrice && itemCost > 0 ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1)) : null;

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
    const totalCost = costedItems.reduce((acc, it) => acc + it.itemCost, 0);
    const totalRealValue = items.reduce((acc, it) => acc + it.itemRealVal, 0);
    const hasAnyCost = costedItems.length > 0 && totalCost > 0;
    const totalPnl = costedItems.reduce((sum, it) => sum + (it.itemPnl || 0), 0);
    const totalPnlPct = hasAnyCost ? parseFloat(((totalPnl / totalCost) * 100).toFixed(1)) : 0;

    // Periodic Performance Calculation (24h, 7d, 30d)
    const nowMs = Date.now();
    const cutoffs = {
      '24h': nowMs - 24 * 3600 * 1000,
      '7d': nowMs - 7 * 24 * 3600 * 1000,
      '30d': nowMs - 30 * 24 * 3600 * 1000,
    };

    const calcPeriodMetrics = (periodKey) => {
      const histMap = historicalPriceMaps[periodKey] || {};
      let pastTotalVal = 0;

      items.forEach((it) => {
        const qty = Number(it.amount) || 0;
        if (qty <= 0) return;

        let pastUnit = histMap[it.assetId];
        if (it.isCustomItem || !pastUnit) {
          pastUnit = it.hasBuyPrice ? Number(it.buyPrice) : it.unitRealPrice;
        }

        // If bought after period started, base is purchase cost
        if (it.hasBuyPrice && it.buyDate) {
          const buyMs = parseDateToMs(it.buyDate);
          if (buyMs && buyMs > cutoffs[periodKey]) {
            pastUnit = Number(it.buyPrice);
          }
        }

        pastTotalVal += (qty * pastUnit);
      });

      const diff = totalRealValue - pastTotalVal;
      const diffPct = pastTotalVal > 0 ? parseFloat(((diff / pastTotalVal) * 100).toFixed(1)) : 0;

      return {
        pastTotalVal,
        diff,
        diffPct,
        isProfit: diff >= 0,
      };
    };

    const perf24h = calcPeriodMetrics('24h');
    const perf7d = calcPeriodMetrics('7d');
    const perf30d = calcPeriodMetrics('30d');

    return {
      items,
      totalCost,
      totalRealValue,
      totalPnl,
      totalPnlPct,
      hasAnyCost,
      perf24h,
      perf7d,
      perf30d,
    };
  }, [holdings, realPriceMap, historicalPriceMaps]);

  // 8. Grouped Categories with Sub-Totals (Real Value and PnL)
  const categoryGroups = useMemo(() => {
    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = portfolioMetrics.items.filter(cat.match);
      const costedGroupItems = groupItems.filter((it) => it.hasBuyPrice);
      const hasCostedItems = costedGroupItems.length > 0;
      const groupCost = costedGroupItems.reduce((acc, it) => acc + it.itemCost, 0);
      const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
      const groupPnl = costedGroupItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
      const groupPnlPct = groupCost > 0 ? parseFloat(((groupPnl / groupCost) * 100).toFixed(1)) : 0;
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
        escapeCSV(item.hasBuyPrice && item.itemPnlPct !== null ? item.itemPnlPct.toFixed(1) + '%' : ''),
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
            <span className="lock-icon"><Lock size={15} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /></span>
            <span className="badge-text">نیازمند ورود به حساب کاربری</span>
          </div>

          <h3 className="auth-gate-title">مدیریت هوشمند پورتفوی سرمایه‌گذاری</h3>
          <p className="auth-gate-desc">
            اطلاعات دارایی‌های شما به صورت امن در پایگاه داده ابری ذخیره شده و ارزش روز آن‌ها
            بر پایه نرخ لحظه‌ای طلا، نقره و دلار محاسبه می‌گردد.
          </p>

          <div className="auth-gate-features">
            <div className="gate-feature-item">
              <span className="feature-icon"><Cloud size={18} /></span>
              <div className="feature-info">
                <strong>ذخیره ابری</strong>
                <span>دسترسی به پورتفو از تمام دستگاه‌ها با امنیت کامل</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><ShieldCheck size={18} /></span>
              <div className="feature-info">
                <strong>محاسبه ارزش واقعی</strong>
                <span>ارزش خالص طلا و نقره بر اساس قیمت جهانی و دلار</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Sparkles size={18} /></span>
              <div className="feature-info">
                <strong>تنوع دارایی‌ها</strong>
                <span>پشتیبانی از انواع طلا، سکه، نقره، ارزها و دارایی‌های شخصی</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Pencil size={18} /></span>
              <div className="feature-info">
                <strong>ثبت جزئیات</strong>
                <span>امکان ثبت تاریخ خرید، قیمت تمام‌شده و یادداشت</span>
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
              <span>ورود با گوگل</span>
            </button>
            <span className="gate-privacy-note">
              <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }} />
              اطلاعات پورتفو کاملاً محرمانه است.
            </span>
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
                <span className="tab-pill-icon">
                  {p.isDefault ? <Star size={13} style={{ verticalAlign: 'middle' }} /> : (p.isE2ee ? <Lock size={13} style={{ verticalAlign: 'middle' }} /> : <Folder size={13} style={{ verticalAlign: 'middle' }} />)}
                </span>
                <span className="tab-pill-name">{p.name}</span>
                {p.isE2ee && (
                  <span className="tab-pill-e2ee" title="گاوصندوق E2EE">
                    <Lock size={10} style={{ verticalAlign: 'middle' }} />
                  </span>
                )}
                {p.shareEnabled && (
                  <span className="tab-pill-shared" title="لینک اشتراک‌گذاری فعال است">
                    <Share2 size={10} style={{ verticalAlign: 'middle' }} />
                  </span>
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
            title="ایجاد پورتفوی جدید"
          >
            <Plus size={13} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
            <span>پورتفو</span>
          </button>
        </div>
      </div>

      {/* Two Column Split: Right (Content & Holdings Tables), Left (Overview Summary Cards) */}
      <div className="portfolio-layout-split">
        {/* Right Column: Holdings List Grouped by Category */}
        <div className="portfolio-content-column">
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <div className="table-title-main">
                  <h3>{activePortfolio?.name || 'سبد دارایی'}</h3>
                  {activePortfolio?.isE2ee && (
                    <span className={`portfolio-encryption-tag e2ee ${isVaultLocked ? 'locked' : 'unlocked'}`} title="داده‌ها با رمز اختصاصی شما در مرورگر رمزنگاری می‌شوند.">
                      {isVaultLocked ? (
                        <>
                          <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                          قفل
                        </>
                      ) : (
                        <>
                          <Unlock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                          باز
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="portfolio-header-actions">
                {activePortfolio?.isE2ee && !isVaultLocked && (
                  <button
                    type="button"
                    className="btn-lock-vault"
                    onClick={handleLockVault}
                    title="قفل کردن گاوصندوق"
                  >
                    <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                    <span>قفل</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn-export-csv icon-only"
                  onClick={handleExportCSV}
                  title="دریافت خروجی اکسل / CSV از اقلام این پورتفو"
                  aria-label="خروجی CSV"
                  disabled={isVaultLocked || holdings.length === 0}
                >
                  <Download size={15} strokeWidth={2} />
                </button>
                {activePortfolio && (
                  <button
                    type="button"
                    className="btn-portfolio-settings icon-only"
                    onClick={() => setSettingsModalOpen(true)}
                    title="تنظیمات پورتفو"
                    aria-label="تنظیمات پورتفو"
                  >
                    <Settings size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            {loadingHoldings ? (
              <div className="portfolio-empty-state">
                <div className="spinner-glow"></div>
                <p>در حال دریافت اطلاعات پورتفوی شما از دیتابیس...</p>
              </div>
            ) : isVaultLocked ? (
              <div className="vault-lock-container">
                <div className="vault-lock-card">
                  <div className="vault-lock-badge">
                    <Lock size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                    گاوصندوق E2EE
                  </div>
                  <h4 className="vault-lock-title">پورتفو قفل است</h4>
                  <p className="vault-lock-desc">
                    برای دسترسی به اطلاعات، رمز عبور پورتفوی «{activePortfolio?.name}» را وارد کنید.
                  </p>

                  <form className="vault-unlock-form" onSubmit={handleUnlockVault}>
                    <div className="vault-pass-input-wrapper">
                      <input
                        type={showVaultUnlockPass ? 'text' : 'password'}
                        className="vault-unlock-input"
                        placeholder="رمز عبور..."
                        value={vaultUnlockPassInput}
                        onChange={(e) => setVaultUnlockPassInput(e.target.value)}
                        autoFocus
                        dir="ltr"
                      />
                      <button
                        type="button"
                        className="btn-toggle-vault-eye"
                        onClick={() => setShowVaultUnlockPass((prev) => !prev)}
                        tabIndex={-1}
                        title={showVaultUnlockPass ? 'مخفی کردن' : 'نمایش رمز'}
                      >
                        {showVaultUnlockPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    {vaultUnlockError && (
                      <div className="vault-unlock-error">
                        <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }} />
                        {vaultUnlockError}
                      </div>
                    )}

                    <div className="vault-unlock-actions">
                      <button
                        type="submit"
                        className="btn-vault-unlock"
                        disabled={unlockingVault || !vaultUnlockPassInput}
                      >
                        {unlockingVault ? 'در حال بررسی...' : 'بازگشایی'}
                      </button>
                    </div>
                  </form>

                  <div className="vault-lock-footer-note">
                    رمزگشایی در مرورگر انجام می‌شود و رمز در سرور ذخیره نمی‌گردد.
                  </div>
                </div>
              </div>
            ) : portfolioMetrics.items.length === 0 ? (
              <div className="portfolio-empty-state">
                <div className="empty-icon"><Briefcase size={44} strokeWidth={1.5} color="var(--text-muted)" /></div>
                <h4>پورتفو خالی است</h4>
                <p>
                  دارایی‌های خود اعم از طلا، سکه، نقره یا ارز را ثبت کنید تا ارزش روز و سود/زیان آن‌ها محاسبه شود.
                </p>
                <button className="btn-add-asset-center" onClick={handleOpenAdd}>
                  <Plus size={15} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                  ثبت دارایی
                </button>
              </div>
            ) : (
              <div className="portfolio-categories-container">
                {categoryGroups.map((group) => (
                  <div key={group.key} className="category-group-card">
                    {/* Category Subtotal Header */}
                    <div className="category-group-header">
                      <div className="cat-header-identity">
                        <span className="cat-group-icon">
                          <CategoryIcon category={group.key} size={20} />
                        </span>
                        <div className="cat-group-titles">
                          <h4 className="cat-group-name">{group.name}</h4>
                          <span className="cat-group-count">{group.items.length.toLocaleString('fa-IR')} قلم</span>
                        </div>
                      </div>

                      <div className="cat-header-subtotals">
                        <div className="cat-subtotal-val">
                          <span className="subtotal-label">ارزش:</span>
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
                            <th className="th-qty">مقدار</th>
                            <th className="th-buy-price">قیمت خرید</th>
                            <th className="th-real-price">ارزش روز واحد</th>
                            <th className="th-total-val">ارزش کل</th>
                            <th className="th-pnl">سود / زیان</th>
                            <th className="th-date">تاریخ خرید</th>
                            <th className="th-notes">یادداشت</th>
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
                                      <CategoryIcon category={item.assetType} size={11} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                                      {item.assetType === 'silver' ? 'نقره' :
                                       item.assetType === 'gold' ? 'طلا' :
                                       item.assetType === 'coin' ? 'سکه' :
                                       item.assetType === 'currency' ? 'ارز' :
                                       item.assetType === 'crypto' ? 'کریپتو' : 'سفارشی'}
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
                                    {item.buyDate ? (
                                      <>
                                        <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                                        {item.buyDate}
                                      </>
                                    ) : '—'}
                                  </span>
                                </td>

                                <td className="td-notes">
                                  <span className="table-notes-text" title={item.notes || ''}>
                                    {item.notes ? (
                                      <>
                                        <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                                        {item.notes}
                                      </>
                                    ) : '—'}
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
                                      <Pencil size={13} strokeWidth={2} />
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
                                        <Trash2 size={13} strokeWidth={2} />
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
                <span className="stat-label">ارزش کل</span>
                <span className="real-pill">
                  ارزش روز
                </span>
              </div>
              <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
                {isVaultLocked ? (
                  <span className="locked-stat"><Lock size={16} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> قفل</span>
                ) : hideValues ? '****' : formatNum(portfolioMetrics.totalRealValue)}
                {!isVaultLocked && <span className="stat-unit">تومان</span>}
              </div>
              <div className="stat-sub">
                {isVaultLocked
                  ? 'گاوصندوق قفل است'
                  : `سرمایه اولیه: ${portfolioMetrics.hasAnyCost ? (hideValues ? '**** تومان' : `${formatNum(portfolioMetrics.totalCost)} تومان`) : 'ثبت‌نشده'}`}
              </div>
            </div>

            {/* Card 2: Total PnL & Period Switcher */}
            {(() => {
              const currentPnl = selectedPeriod === 'all'
                ? {
                    diff: portfolioMetrics.totalPnl,
                    diffPct: portfolioMetrics.totalPnlPct,
                    isProfit: portfolioMetrics.totalPnl >= 0,
                    hasData: portfolioMetrics.hasAnyCost,
                    label: 'از زمان خرید اولیه',
                  }
                : selectedPeriod === '24h'
                ? {
                    diff: portfolioMetrics.perf24h.diff,
                    diffPct: portfolioMetrics.perf24h.diffPct,
                    isProfit: portfolioMetrics.perf24h.isProfit,
                    hasData: true,
                    label: 'تغییرات ۲۴ ساعت گذشته',
                  }
                : selectedPeriod === '7d'
                ? {
                    diff: portfolioMetrics.perf7d.diff,
                    diffPct: portfolioMetrics.perf7d.diffPct,
                    isProfit: portfolioMetrics.perf7d.isProfit,
                    hasData: true,
                    label: 'تغییرات ۷ روز گذشته',
                  }
                : {
                    diff: portfolioMetrics.perf30d.diff,
                    diffPct: portfolioMetrics.perf30d.diffPct,
                    isProfit: portfolioMetrics.perf30d.isProfit,
                    hasData: true,
                    label: 'تغییرات ۳۰ روز گذشته',
                  };

              const cardStatusClass = isVaultLocked
                ? 'neutral'
                : currentPnl.hasData
                ? (currentPnl.isProfit ? 'profit' : 'loss')
                : 'neutral';

              return (
                <div className={`portfolio-stat-card pnl-card ${cardStatusClass}`}>
                  <div className="stat-header">
                    <span className="stat-label">سود / زیان</span>
                    {!isVaultLocked && (
                      <div className="period-tabs-segmented">
                        <button
                          type="button"
                          className={`period-pill-btn ${selectedPeriod === 'all' ? 'active' : ''}`}
                          onClick={() => setSelectedPeriod('all')}
                          title="کل سود و زیان از زمان خرید"
                        >
                          کل
                        </button>
                        <button
                          type="button"
                          className={`period-pill-btn ${selectedPeriod === '24h' ? 'active' : ''}`}
                          onClick={() => setSelectedPeriod('24h')}
                          title="تغییرات ۲۴ ساعت گذشته"
                        >
                          ۲۴س
                        </button>
                        <button
                          type="button"
                          className={`period-pill-btn ${selectedPeriod === '7d' ? 'active' : ''}`}
                          onClick={() => setSelectedPeriod('7d')}
                          title="تغییرات ۷ روز گذشته"
                        >
                          ۷ر
                        </button>
                        <button
                          type="button"
                          className={`period-pill-btn ${selectedPeriod === '30d' ? 'active' : ''}`}
                          onClick={() => setSelectedPeriod('30d')}
                          title="تغییرات ۳۰ روز گذشته"
                        >
                          ۳۰ر
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="stat-pnl-row">
                    <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
                      {isVaultLocked ? (
                        <span className="stat-sub" style={{ fontSize: '15px' }}><Lock size={14} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> قفل است</span>
                      ) : currentPnl.hasData ? (
                        <>
                          {hideValues ? '****' : `${currentPnl.isProfit ? '+' : ''}${formatNum(currentPnl.diff)}`}
                          <span className="stat-unit">تومان</span>
                        </>
                      ) : (
                        <span className="stat-sub" style={{ fontSize: '15px' }}>بدون قیمت خرید</span>
                      )}
                    </div>

                    {!isVaultLocked && currentPnl.hasData && (
                      <span className={`pnl-badge ${currentPnl.isProfit ? 'profit' : 'loss'}`}>
                        {currentPnl.isProfit ? <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} /> : <ArrowDownRight size={13} style={{ verticalAlign: 'middle' }} />}
                        {hideValues ? '****' : `${currentPnl.isProfit ? '+' : ''}${Math.abs(currentPnl.diffPct).toFixed(1)}٪`}
                      </span>
                    )}
                  </div>

                  <div className="stat-sub">
                    {isVaultLocked
                      ? 'گاوصندوق قفل است'
                      : currentPnl.label}
                  </div>
                </div>
              );
            })()}

            {/* Dedicated 3-Period Performance Widget Card */}
            {!isVaultLocked && holdings.length > 0 && (
              <div className="portfolio-stat-card periodic-perf-card">
                <div className="stat-header">
                  <div className="periodic-title-wrap">
                    <TrendingUp size={14} className="perf-header-icon" />
                    <span className="stat-label">تغییرات و بازدهی دوره‌ای</span>
                  </div>
                  <span className="perf-time-badge">
                    <Clock size={11} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                    زنده
                  </span>
                </div>

                <div className="periodic-columns-grid">
                  {/* 24 Hours */}
                  <div
                    className={`period-stat-col ${portfolioMetrics.perf24h.isProfit ? 'profit' : 'loss'} ${selectedPeriod === '24h' ? 'selected' : ''}`}
                    onClick={() => setSelectedPeriod('24h')}
                    role="button"
                    tabIndex={0}
                    title="کلیک برای تنظیم کارت اصلی روی ۲۴ ساعت"
                  >
                    <span className="period-col-title">۲۴ ساعت</span>
                    <div className="period-col-pct">
                      {portfolioMetrics.perf24h.isProfit ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      <span>{portfolioMetrics.perf24h.isProfit ? '+' : ''}{portfolioMetrics.perf24h.diffPct.toLocaleString('fa-IR')}%</span>
                    </div>
                    <span className={`period-col-diff ${hideValues ? 'is-masked' : ''}`}>
                      {hideValues ? '****' : `${portfolioMetrics.perf24h.isProfit ? '+' : ''}${formatNum(portfolioMetrics.perf24h.diff)} ت`}
                    </span>
                  </div>

                  <div className="period-divider" />

                  {/* 7 Days */}
                  <div
                    className={`period-stat-col ${portfolioMetrics.perf7d.isProfit ? 'profit' : 'loss'} ${selectedPeriod === '7d' ? 'selected' : ''}`}
                    onClick={() => setSelectedPeriod('7d')}
                    role="button"
                    tabIndex={0}
                    title="کلیک برای تنظیم کارت اصلی روی ۷ روز"
                  >
                    <span className="period-col-title">۷ روز</span>
                    <div className="period-col-pct">
                      {portfolioMetrics.perf7d.isProfit ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      <span>{portfolioMetrics.perf7d.isProfit ? '+' : ''}{portfolioMetrics.perf7d.diffPct.toLocaleString('fa-IR')}%</span>
                    </div>
                    <span className={`period-col-diff ${hideValues ? 'is-masked' : ''}`}>
                      {hideValues ? '****' : `${portfolioMetrics.perf7d.isProfit ? '+' : ''}${formatNum(portfolioMetrics.perf7d.diff)} ت`}
                    </span>
                  </div>

                  <div className="period-divider" />

                  {/* 30 Days */}
                  <div
                    className={`period-stat-col ${portfolioMetrics.perf30d.isProfit ? 'profit' : 'loss'} ${selectedPeriod === '30d' ? 'selected' : ''}`}
                    onClick={() => setSelectedPeriod('30d')}
                    role="button"
                    tabIndex={0}
                    title="کلیک برای تنظیم کارت اصلی روی ۳۰ روز"
                  >
                    <span className="period-col-title">۳۰ روز</span>
                    <div className="period-col-pct">
                      {portfolioMetrics.perf30d.isProfit ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      <span>{portfolioMetrics.perf30d.isProfit ? '+' : ''}{portfolioMetrics.perf30d.diffPct.toLocaleString('fa-IR')}%</span>
                    </div>
                    <span className={`period-col-diff ${hideValues ? 'is-masked' : ''}`}>
                      {hideValues ? '****' : `${portfolioMetrics.perf30d.isProfit ? '+' : ''}${formatNum(portfolioMetrics.perf30d.diff)} ت`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Card 3: Actions & Count */}
            <div className="portfolio-stat-card action-card">
              <div className="stat-header">
                <span className="stat-label">تعداد اقلام</span>
                <span className="count-pill">
                  {isVaultLocked ? <><Lock size={11} style={{ verticalAlign: 'middle', marginLeft: '3px' }} /> قفل</> : `${holdings.length} قلم`}
                </span>
              </div>
              <button
                className="btn-add-asset"
                onClick={handleOpenAdd}
                disabled={isVaultLocked}
                title={isVaultLocked ? 'ابتدا گاوصندوق را باز کنید' : 'افزودن دارایی'}
              >
                <Plus size={16} strokeWidth={2.5} />
                <span>{isVaultLocked ? 'قفل است' : 'ثبت دارایی'}</span>
              </button>
            </div>

            {/* Card 4: Asset Allocation Distribution Breakdown */}
            {categoryGroups.length > 0 && portfolioMetrics.totalRealValue > 0 && !isVaultLocked && (
              <div className="portfolio-stat-card allocation-card">
                <div className="stat-header">
                  <span className="stat-label">ترکیب دارایی‌ها</span>
                  <span className="count-pill">{categoryGroups.length.toLocaleString('fa-IR')} دسته</span>
                </div>
                <div className="allocation-bar" aria-label="نمودار تفکیک دارایی‌ها">
                  {categoryGroups.map((cat) => {
                    const pct = (cat.totalRealValue / portfolioMetrics.totalRealValue) * 100;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={cat.key}
                        className={`allocation-segment cat-${cat.key}`}
                        style={{ width: `${pct}%` }}
                        title={`${cat.name}: ${Number(pct).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}٪`}
                      />
                    );
                  })}
                </div>
                <div className="allocation-chips">
                  {categoryGroups.map((cat) => {
                    const pct = (cat.totalRealValue / portfolioMetrics.totalRealValue) * 100;
                    return (
                      <div key={cat.key} className="allocation-chip">
                        <span className={`chip-dot cat-${cat.key}`} />
                        <span className="chip-name">{cat.name}:</span>
                        <strong className="chip-pct">{Number(pct).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}٪</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Asset Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title={editingHolding ? 'ویرایش دارایی' : 'افزودن دارایی'}
        icon={<Coins size={18} />}
        maxWidth="500px"
        className="asset-modal-box"
        onSubmit={handleSubmitHolding}
        footer={
          <div className="modal-actions">
            <button
              type="button"
              className="btn-cancel"
              disabled={submitting}
              onClick={() => setModalOpen(false)}
            >
              انصراف
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting
                ? 'در حال ذخیره...'
                : editingHolding
                ? 'ذخیره'
                : 'ثبت دارایی'}
            </button>
          </div>
        }
      >
                <div className="form-item">
                <label>نوع دارایی</label>
                <select
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="form-select"
                >
                  <optgroup label="طلا و مسکوکات">
                    <option value="gold_18k">طلای ۱۸ عیار</option>
                    <option value="gold_melted">طلای آبشده (گرم ۱۸)</option>
                    <option value="gold_24k">طلای ۲۴ عیار</option>
                    <option value="full_new">سکه امامی</option>
                    <option value="full_old">سکه بهار آزادی</option>
                    <option value="half">نیم سکه بهار آزادی</option>
                    <option value="quarter">ربع سکه بهار آزادی</option>
                    <option value="bank_gram">سکه گرمی بانکی</option>
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
                    <option value="CHF">فرانک سوئیس</option>
                    <option value="AED">درهم امارات</option>
                    <option value="TRY">لیر ترکیه</option>
                    <option value="GBP">پوند انگلیس</option>
                    <option value="CAD">دلار کانادا</option>
                    <option value="BTC">بیت‌کوین</option>
                    <option value="ETH">اتریوم</option>
                  </optgroup>

                  <optgroup label="دارایی‌های دلخواه">
                    <option value="custom">سایر دارایی‌ها</option>
                  </optgroup>
                </select>
              </div>

              {/* Custom Asset Specific Fields */}
              {isModalCustom && (
                <div className="form-row-dual">
                  <div className="form-item flex-1">
                    <label>نام دارایی</label>
                    <input
                      type="text"
                      placeholder="مثلاً صندوق طلا یا سهام"
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
                      placeholder="مثلاً سهم، واحد، عدد"
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
                  مقدار ({isModalCustom ? (customUnit || 'واحد') : selectedAssetMeta?.unit})
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
                  قیمت خرید واحد (تومان)
                </label>
                <NumericInput
                  placeholder="مثلاً ۵۴,۲۰۰,۰۰۰ (اختیاری)"
                  value={buyPrice}
                  onValueChange={setBuyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="form-input"
                  allowDecimals={false}
                />
                <span className="field-sub-note">اختیاری؛ برای محاسبه سود و زیان.</span>
              </div>

              {/* Custom Asset: Current Market Price field */}
              {isModalCustom && (
                <div className="form-item">
                  <label>قیمت روز واحد (تومان)</label>
                  <NumericInput
                    placeholder="جهت محاسبه زنده ارزش و سود/زیان"
                    value={customCurrentPrice}
                    onValueChange={setCustomCurrentPrice}
                    onChange={(e) => setCustomCurrentPrice(e.target.value)}
                    className="form-input"
                    allowDecimals={false}
                  />
                  <span className="field-sub-note">اختیاری؛ پیش‌فرض برابر با قیمت خرید است.</span>
                </div>
              )}

              <div className="form-row-dual">
                <div className="form-item flex-1">
                  <div className="label-with-action">
                    <label>تاریخ خرید</label>
                    <button
                      type="button"
                      className="btn-set-today"
                      onClick={handleSetToday}
                      title="تنظیم تاریخ امروز"
                    >
                      امروز
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
                      title="انتخاب از تقویم"
                    >
                      <Calendar size={15} />
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
                          امروز
                        </button>
                        <button
                          type="button"
                          className="btn-date-system-mini"
                          onClick={() => {
                            try {
                              if (nativeDateRef.current?.showPicker) {
                                nativeDateRef.current.showPicker();
                              } else {
                                nativeDateRef.current?.click();
                              }
                            } catch {
                              nativeDateRef.current?.click();
                            }
                          }}
                          title="تقویم سیستم"
                        >
                          تقویم
                        </button>
                        <button
                          type="button"
                          className="btn-date-done-mini"
                          onClick={() => setShowDatePicker(false)}
                        >
                          تأیید
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-item flex-1">
                  <label>یادداشت</label>
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
                    <span className="hint-label">ارزش ذاتی بر مبنای طلا/دلار:</span>
                    <strong className="hint-val-sky">{formatNum(currentModalRealPrice)} تومان</strong>
                  </div>
                  {(selectedAssetId === 'bank_gram' || selectedAssetId === 'gram') && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', textAlign: 'right' }}>
                      ⚡ استاندارد بانک مرکزی: وزن ۱.۰۱ گرم طلای ۲۲ عیار (معادل ۰.۹۲۶ گرم طلای ۲۴ عیار خالص)
                    </div>
                  )}
                </div>
              )}
      </Modal>

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
