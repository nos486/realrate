import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  RefreshCw,
  Sliders,
  Save,
  X,
  Zap,
  Info,
  Tag,
  Hash,
  CornerDownRight,
  TrendingUp,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import { useMarketData } from '../hooks/useMarketData.js';
import {
  apiAdminGetDerivedAssets,
  apiAdminSaveDerivedAsset,
  apiAdminDeleteDerivedAsset,
  apiGetPriceSources,
} from '../api/client.js';
import {
  calculateDerivedPrice,
  computeAllDerivedPrices,
  evaluateExpression,
  buildFormulaContext,
} from '../utils/formulaEvaluator.js';
import { formatThousands } from '../utils/formatters.js';

const PRESET_TEMPLATES = [
  {
    label: 'طلای ۲۴ عیار',
    name: 'طلای ۲۴ عیار',
    nameEn: 'Gold 24K',
    id: 'gold_24k',
    category: 'gold',
    unit: 'گرم',
    baseAssetId: 'gold_18k',
    formulaType: 'multiplier',
    multiplier: 1.33333333,
    formulaExpression: 'BASE * (24 / 18)',
    description: 'طلای ۲۴ عیار خالص بر مبنای ضریب ۲۴/۱۸ طلای ۱۸ عیار',
  },
  {
    label: 'طلای ۲۲ عیار',
    name: 'طلای ۲۲ عیار',
    nameEn: 'Gold 22K',
    id: 'gold_22k',
    category: 'gold',
    unit: 'گرم',
    baseAssetId: 'gold_18k',
    formulaType: 'multiplier',
    multiplier: 1.22222222,
    formulaExpression: 'BASE * (22 / 18)',
    description: 'طلای ۲۲ عیار با ضریب ۲۲/۱۸ طلای ۱۸ عیار',
  },
  {
    label: 'طلای آبشده',
    name: 'طلای آبشده',
    nameEn: 'Melted Gold',
    id: 'gold_melted',
    category: 'gold',
    unit: 'گرم',
    baseAssetId: 'gold_18k',
    formulaType: 'multiplier',
    multiplier: 1.0,
    formulaExpression: 'BASE',
    description: 'طلای آبشده بر مبنای هر گرم طلای ۱۸ عیار',
  },
  {
    label: 'مثقال طلا (مظنه)',
    name: 'مثقال طلا (مظنه)',
    nameEn: 'Gold Mesghal',
    id: 'mesghal',
    category: 'gold',
    unit: 'مثقال',
    baseAssetId: 'gold_18k',
    formulaType: 'multiplier',
    multiplier: 4.3318,
    formulaExpression: 'BASE * 4.3318',
    description: 'یک مثقال طلا معادل ۴.۳۳۱۸ گرم طلا ۱۸ عیار',
  },
  {
    label: 'نقره خام (ساچمه ۹۹۹)',
    name: 'نقره خام (ساچمه ۹۹۹)',
    nameEn: 'Silver Granule 999 (Gram)',
    id: 'silver_gram',
    category: 'silver',
    unit: 'گرم',
    baseAssetId: 'ons_silver',
    formulaType: 'expression',
    multiplier: 1.0,
    formulaExpression: '(BASE * USD) / 31.1034768',
    description: 'هر گرم نقره خام ۹۹۹ بر اساس انس جهانی نقره ضرب در دلار تقسیم بر ۳۱.۱۰۳۵',
  },
  {
    label: 'نقره ۹۲۵ استرلینگ',
    name: 'نقره استرلینگ ۹۲۵',
    nameEn: 'Sterling Silver 925 (Gram)',
    id: 'silver_925',
    category: 'silver',
    unit: 'گرم',
    baseAssetId: 'silver_gram',
    formulaType: 'multiplier',
    multiplier: 0.925,
    formulaExpression: 'BASE * 0.925',
    description: 'نقره ۹۲۵ عیار با ضریب ۰.۹۲۵ نقره خام ۹۹۹',
  },
];

const CATEGORY_OPTIONS = [
  { id: 'gold', label: 'طلا (Gold)' },
  { id: 'silver', label: 'نقره (Silver)' },
  { id: 'coin', label: 'سکه (Coin)' },
  { id: 'currency', label: 'ارز (Currency)' },
  { id: 'bourse', label: 'بورس و صندوق‌ها' },
  { id: 'crypto', label: 'ارز دیجیتال' },
  { id: 'other', label: 'سایر موارد' },
];

export default function DerivedAssetsPage({ embedded = false }) {
  const { rates, usdToman, goldUsd } = useMarketData();
  const [derivedAssets, setDerivedAssets] = useState([]);
  const [sourcesList, setSourcesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    nameEn: '',
    category: 'gold',
    unit: 'گرم',
    baseAssetId: 'gold_18k',
    formulaType: 'multiplier',
    multiplier: 1.0,
    formulaExpression: 'BASE',
    description: '',
    isActive: true,
    sortOrder: 10,
  });
  const [submitting, setSubmitting] = useState(false);

  // Load derived assets & base sources
  const loadData = async () => {
    setLoading(true);
    try {
      const [resDerived, resSources] = await Promise.all([
        apiAdminGetDerivedAssets().catch(() => ({ success: false })),
        apiGetPriceSources().catch(() => ({ success: false })),
      ]);

      if (resDerived && resDerived.derivedAssets) {
        setDerivedAssets(resDerived.derivedAssets);
      }
      if (resSources && resSources.sources) {
        setSourcesList(resSources.sources);
      }
    } catch (err) {
      console.error('Failed to load derived assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Build full price map from market rates
  const basePriceMap = useMemo(() => {
    const map = {};
    if (rates?.prices) {
      for (const [k, v] of Object.entries(rates.prices)) {
        if (v && v.price) {
          map[k] = Number(v.price) || 0;
        }
      }
    }
    if (rates?.live_usd_toman) {
      map.usd = Number(rates.live_usd_toman);
      map.usd_toman = Number(rates.live_usd_toman);
    } else if (usdToman) {
      const num = parseFloat(String(usdToman).replace(/,/g, ''));
      if (num) {
        map.usd = num;
        map.usd_toman = num;
      }
    }
    if (rates?.gold_usd) {
      map.ons_gold = Number(rates.gold_usd);
      map.gold_usd = Number(rates.gold_usd);
    }
    if (rates?.silver_usd) {
      map.ons_silver = Number(rates.silver_usd);
      map.silver_usd = Number(rates.silver_usd);
    }
    return map;
  }, [rates, usdToman, goldUsd]);

  // Compute all live prices for all derived assets in the list
  const computedPrices = useMemo(() => {
    return computeAllDerivedPrices(derivedAssets, basePriceMap);
  }, [derivedAssets, basePriceMap]);

  // Candidate base assets for dropdown
  const baseAssetOptions = useMemo(() => {
    const set = new Set();
    const list = [];

    // Add common defaults first
    const common = [
      { id: 'gold_18k', label: 'طلا ۱۸ عیار (gold_18k)' },
      { id: 'ons_gold', label: 'انس جهانی طلا (ons_gold)' },
      { id: 'ons_silver', label: 'انس جهانی نقره (ons_silver)' },
      { id: 'usd', label: 'دلار تهران (usd)' },
      { id: 'full_coin', label: 'سکه تمام بهار آزادی (full_coin)' },
      { id: 'half_coin', label: 'نیم سکه بهار آزادی (half_coin)' },
      { id: 'quarter_coin', label: 'ربع سکه بهار آزادی (quarter_coin)' },
    ];
    for (const c of common) {
      set.add(c.id);
      list.push(c);
    }

    // Add active price sources
    if (Array.isArray(sourcesList)) {
      for (const src of sourcesList) {
        if (src.priceType && !set.has(src.priceType)) {
          set.add(src.priceType);
          list.push({
            id: src.priceType,
            label: `${src.name || src.priceType} (${src.priceType})`,
          });
        }
      }
    }

    // Add other derived assets
    for (const d of derivedAssets) {
      if (!set.has(d.id)) {
        set.add(d.id);
        list.push({
          id: d.id,
          label: `[قلم محاسباتی] ${d.name} (${d.id})`,
        });
      }
    }

    return list;
  }, [sourcesList, derivedAssets]);

  // Live preview for the modal form
  const modalLivePrice = useMemo(() => {
    if (!formData.baseAssetId) return 0;
    const testMap = { ...basePriceMap, ...computedPrices };
    return calculateDerivedPrice(formData, testMap);
  }, [formData, basePriceMap, computedPrices]);

  // Open modal for new item or template
  const handleOpenAdd = (template = null) => {
    setEditingItem(null);
    if (template) {
      setFormData({
        id: template.id || '',
        name: template.name || '',
        nameEn: template.nameEn || '',
        category: template.category || 'gold',
        unit: template.unit || 'گرم',
        baseAssetId: template.baseAssetId || 'gold_18k',
        formulaType: template.formulaType || 'multiplier',
        multiplier: template.multiplier !== undefined ? template.multiplier : 1.0,
        formulaExpression: template.formulaExpression || 'BASE',
        description: template.description || '',
        isActive: true,
        sortOrder: derivedAssets.length + 1,
      });
    } else {
      setFormData({
        id: '',
        name: '',
        nameEn: '',
        category: 'gold',
        unit: 'گرم',
        baseAssetId: 'gold_18k',
        formulaType: 'multiplier',
        multiplier: 1.0,
        formulaExpression: 'BASE',
        description: '',
        isActive: true,
        sortOrder: derivedAssets.length + 1,
      });
    }
    setModalOpen(true);
  };

  // Open modal for editing existing item
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormData({
      id: item.id,
      name: item.name,
      nameEn: item.nameEn || item.name_en || '',
      category: item.category || 'gold',
      unit: item.unit || 'گرم',
      baseAssetId: item.baseAssetId || item.base_asset_id,
      formulaType: item.formulaType || item.formula_type || 'multiplier',
      multiplier: item.multiplier !== undefined ? item.multiplier : 1.0,
      formulaExpression: item.formulaExpression || item.formula_expression || 'BASE',
      description: item.description || '',
      isActive: item.isActive !== undefined ? item.isActive : true,
      sortOrder: item.sortOrder !== undefined ? item.sortOrder : 10,
    });
    setModalOpen(true);
  };

  // Save submit
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      setBanner({ type: 'danger', message: 'نام قلم الزامی است.' });
      return;
    }
    if (!formData.baseAssetId.trim()) {
      setBanner({ type: 'danger', message: 'انتخاب دارایی پایه الزامی است.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiAdminSaveDerivedAsset(formData);
      if (res && res.success) {
        setBanner({ type: 'success', message: 'قلم مشتق‌شده با موفقیت ذخیره شد.' });
        setModalOpen(false);
        loadData();
      } else {
        setBanner({ type: 'danger', message: res?.error || 'خطا در ذخیره قلم.' });
      }
    } catch (err) {
      setBanner({ type: 'danger', message: err.message || 'خطای شبکه' });
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (item) => {
    try {
      const updated = {
        ...item,
        isActive: !item.isActive,
      };
      await apiAdminSaveDerivedAsset(updated);
      setDerivedAssets((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, isActive: !a.isActive } : a))
      );
      setBanner({
        type: 'success',
        message: `وضعیت «${item.name}» به ${!item.isActive ? 'فعال' : 'غیرفعال'} تغییر یافت.`,
      });
    } catch (err) {
      setBanner({ type: 'danger', message: 'خطا در تغییر وضعیت قلم.' });
    }
  };

  // Delete item
  const handleDelete = async (item) => {
    if (!window.confirm(`آیا از حذف قلم مشتق‌شده «${item.name}» اطمینان دارید؟`)) {
      return;
    }
    try {
      const res = await apiAdminDeleteDerivedAsset(item.id);
      if (res && res.success) {
        setDerivedAssets((prev) => prev.filter((a) => a.id !== item.id));
        setBanner({ type: 'success', message: `«${item.name}» با موفقیت حذف شد.` });
      } else {
        setBanner({ type: 'danger', message: res?.error || 'خطا در حذف قلم.' });
      }
    } catch (err) {
      setBanner({ type: 'danger', message: err.message || 'خطای شبکه' });
    }
  };

  return (
    <div className={`derived-assets-container ${embedded ? 'embedded' : ''}`} dir="rtl">
      {/* Banner */}
      {banner && (
        <AlertBanner
          type={banner.type}
          message={banner.message}
          dismissible
          onDismiss={() => setBanner(null)}
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* Header Info & Actions */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
          padding: '16px',
          background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
          borderRadius: '12px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(245, 158, 11, 0.1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#eab308',
              border: '1px solid rgba(234, 179, 8, 0.3)',
            }}
          >
            <Calculator size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
              اقلام محاسباتی و مشتق‌شده (فرمول‌ها و ضرایب)
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              اقلامی نظیر طلای ۲۴ و ۲۲ عیار، آبشده، مثقال یا نقره خام گرمی بدون هاردکد، بر پایه سورس‌های اصلی و با فرمول ریاضی ذخیره و در کل سامانه محاسبه می‌شوند.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadData}
            title="بروزرسانی لیست"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>بروزرسانی</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOpenAdd()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #eab308, #ca8a04)',
              color: '#000',
              fontWeight: '700',
              border: 'none',
            }}
          >
            <Plus size={16} />
            <span>افزودن قلم محاسباتی جدید</span>
          </button>
        </div>
      </div>

      {/* Preset Quick Add Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
          الگوهای آماده:
        </span>
        {PRESET_TEMPLATES.map((tmpl) => {
          const exists = derivedAssets.some((d) => d.id === tmpl.id);
          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => handleOpenAdd(tmpl)}
              style={{
                background: exists ? 'rgba(255, 255, 255, 0.04)' : 'rgba(234, 179, 8, 0.08)',
                color: exists ? 'var(--text-muted)' : '#eab308',
                border: `1px solid ${exists ? 'rgba(255, 255, 255, 0.1)' : 'rgba(234, 179, 8, 0.25)'}`,
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.2s',
              }}
              title={exists ? 'قبلاً در دیتابیس موجود است (کلیک برای ایجاد یا ویرایش)' : 'ایجاد با الگو'}
            >
              <Sparkles size={12} />
              <span>{tmpl.label}</span>
              {exists && (
                <span style={{ fontSize: '10px', opacity: 0.6 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Derived Assets Table / Cards */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="sources-table" style={{ width: '100%', textAlign: 'right', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px' }}>نام قلم</th>
                <th style={{ padding: '12px 16px' }}>شناسه / واحد</th>
                <th style={{ padding: '12px 16px' }}>دارایی مبنا</th>
                <th style={{ padding: '12px 16px' }}>فرمول / ضریب</th>
                <th style={{ padding: '12px 16px' }}>نرخ زنده محاسبه‌شده</th>
                <th style={{ padding: '12px 16px' }}>وضعیت</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {derivedAssets.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {loading ? 'در حال بارگذاری...' : 'هیچ قلم محاسباتی ثبت نشده است. از الگوهای بالا یا دکمه افزودن استفاده فرمایید.'}
                  </td>
                </tr>
              ) : (
                derivedAssets.map((item) => {
                  const livePrice = computedPrices[item.id] || 0;
                  const isMultiplier = (item.formulaType || item.formula_type) === 'multiplier';

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
                        opacity: item.isActive ? 1 : 0.6,
                      }}
                    >
                      {/* Name & English */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-heading)' }}>
                          {item.name}
                        </div>
                        {item.nameEn && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {item.nameEn}
                          </div>
                        )}
                        {item.description && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {item.description}
                          </div>
                        )}
                      </td>

                      {/* ID & Unit */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#38bdf8' }}>
                          {item.id}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          واحد: <span style={{ color: 'var(--text-body)' }}>{item.unit || 'گرم'}</span>
                        </div>
                      </td>

                      {/* Base Asset */}
                      <td style={{ padding: '14px 16px' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(56, 189, 248, 0.1)',
                            color: '#38bdf8',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                          }}
                        >
                          <Tag size={11} />
                          <span>{item.baseAssetId || item.base_asset_id}</span>
                        </div>
                      </td>

                      {/* Formula / Multiplier */}
                      <td style={{ padding: '14px 16px' }}>
                        {isMultiplier ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ضریب:</span>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: '700',
                                color: '#eab308',
                                direction: 'ltr',
                              }}
                            >
                              × {item.multiplier}
                            </span>
                          </div>
                        ) : (
                          <div
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '12px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              direction: 'ltr',
                              color: '#a855f7',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={item.formulaExpression || item.formula_expression}
                          >
                            {item.formulaExpression || item.formula_expression}
                          </div>
                        )}
                      </td>

                      {/* Live Calculated Price */}
                      <td style={{ padding: '14px 16px' }}>
                        {livePrice > 0 ? (
                          <div>
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: '800',
                                color: 'var(--accent-green, #10b981)',
                                fontFamily: 'monospace',
                              }}
                            >
                              {formatThousands(Math.round(livePrice))}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>
                              تومان
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          style={{
                            border: 'none',
                            background: item.isActive
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                            color: item.isActive ? '#10b981' : '#ef4444',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {item.isActive ? (
                            <>
                              <CheckCircle2 size={12} />
                              <span>فعال</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={12} />
                              <span>غیرفعال</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => handleOpenEdit(item)}
                            title="ویرایش"
                            style={{ padding: '6px', borderRadius: '6px', color: 'var(--text-muted)' }}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => handleDelete(item)}
                            title="حذف"
                            style={{
                              padding: '6px',
                              borderRadius: '6px',
                              color: '#ef4444',
                              background: 'rgba(239, 68, 68, 0.1)',
                            }}
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
      </Card>

      {/* Modal: Add / Edit Derived Asset */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingItem ? `ویرایش قلم مشتق: ${editingItem.name}` : 'افزودن قلم محاسباتی جدید'}
        >
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} dir="rtl">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                  نام فارسی قلم *
                </label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثلاً: طلای ۲۴ عیار"
                  required
                />
              </div>

              {/* English Name */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                  نام انگلیسی (لاتین)
                </label>
                <input
                  type="text"
                  className="input"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="مثلاً: Gold 24K"
                  style={{ direction: 'ltr' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              {/* Slug ID */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                  شناسه یکتا (ID) *
                </label>
                <input
                  type="text"
                  className="input"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="مثلاً: gold_24k"
                  disabled={Boolean(editingItem)}
                  style={{ direction: 'ltr', fontFamily: 'monospace' }}
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  فقط حروف کوچک انگلیسی و خط زیر (_)
                </span>
              </div>

              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                  دسته‌بندی *
                </label>
                <select
                  className="input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                  واحد اندازه‌گیری *
                </label>
                <input
                  type="text"
                  className="input"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="مثلاً: گرم، مثقال، عدد"
                  required
                />
              </div>
            </div>

            {/* Base Asset Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                دارایی مبنا (Base Asset) *
              </label>
              <select
                className="input"
                value={formData.baseAssetId}
                onChange={(e) => setFormData({ ...formData, baseAssetId: e.target.value })}
              >
                {baseAssetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                قیمت این دارایی به عنوان متغیر <code>BASE</code> در فرمول شما قرار می‌گیرد.
              </span>
            </div>

            {/* Formula Type */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px' }}>
                نوع فرمول محاسباتی
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background:
                      formData.formulaType === 'multiplier'
                        ? 'rgba(234, 179, 8, 0.15)'
                        : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${
                      formData.formulaType === 'multiplier' ? '#eab308' : 'var(--border-color)'
                    }`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <input
                    type="radio"
                    name="formulaType"
                    value="multiplier"
                    checked={formData.formulaType === 'multiplier'}
                    onChange={() => setFormData({ ...formData, formulaType: 'multiplier' })}
                  />
                  <span>ضریب مستقیم (قیمت پایه × ضریب)</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background:
                      formData.formulaType === 'expression'
                        ? 'rgba(168, 85, 247, 0.15)'
                        : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${
                      formData.formulaType === 'expression' ? '#a855f7' : 'var(--border-color)'
                    }`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <input
                    type="radio"
                    name="formulaType"
                    value="expression"
                    checked={formData.formulaType === 'expression'}
                    onChange={() => setFormData({ ...formData, formulaType: 'expression' })}
                  />
                  <span>فرمول ریاضی سفارشی (Expression)</span>
                </label>
              </div>
            </div>

            {/* Multiplier input */}
            {formData.formulaType === 'multiplier' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                  ضریب عددی (Multiplier) *
                </label>
                <input
                  type="number"
                  step="any"
                  className="input"
                  value={formData.multiplier}
                  onChange={(e) => setFormData({ ...formData, multiplier: parseFloat(e.target.value) || 0 })}
                  placeholder="مثلاً: 1.33333333 یا 4.3318 یا 0.925"
                  style={{ direction: 'ltr', fontFamily: 'monospace' }}
                  required
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    onClick={() => setFormData({ ...formData, multiplier: 24 / 18 })}
                  >
                    ۲۴ عیار (24/18 = 1.3333)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    onClick={() => setFormData({ ...formData, multiplier: 22 / 18 })}
                  >
                    ۲۲ عیار (22/18 = 1.2222)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    onClick={() => setFormData({ ...formData, multiplier: 4.3318 })}
                  >
                    مثقال طلا (4.3318)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    onClick={() => setFormData({ ...formData, multiplier: 0.925 })}
                  >
                    نقره ۹۲۵ (0.925)
                  </button>
                </div>
              </div>
            )}

            {/* Expression input */}
            {formData.formulaType === 'expression' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                  عبارت ریاضی فرمول (Expression) *
                </label>
                <input
                  type="text"
                  className="input"
                  value={formData.formulaExpression}
                  onChange={(e) => setFormData({ ...formData, formulaExpression: e.target.value })}
                  placeholder="مثلاً: (BASE * USD) / 31.1034768"
                  style={{ direction: 'ltr', fontFamily: 'monospace' }}
                  required
                />

                {/* Clickable Variable Helper Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                    متغیرها و اعداد سریع:
                  </span>
                  {['BASE', 'USD', 'GOLD_USD', 'SILVER_USD', '31.1034768', '*', '/', '+', '-', '(', ')'].map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          formulaExpression: `${formData.formulaExpression} ${token}`.trim(),
                        })
                      }
                      style={{
                        padding: '3px 7px',
                        background: 'rgba(168, 85, 247, 0.1)',
                        color: '#c084fc',
                        border: '1px solid rgba(168, 85, 247, 0.25)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                      }}
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live Formula Preview Card */}
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#10b981' }}>
                  پیش‌نمایش زنده محاسبه نرخ:
                </span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  دارایی مبنا ({formData.baseAssetId}): {formatThousands(Math.round(basePriceMap[formData.baseAssetId] || 0))} تومان | دلار: {formatThousands(Math.round(basePriceMap.usd || 0))} تومان
                </div>
              </div>

              <div style={{ textAlign: 'left' }}>
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: '900',
                    color: '#10b981',
                    fontFamily: 'monospace',
                  }}
                >
                  {formatThousands(Math.round(modalLivePrice))}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '4px' }}>
                  تومان
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px' }}>
                توضیحات و فرمول به زبان ساده
              </label>
              <textarea
                className="input"
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="توضیح دلخواه در مورد نحوه محاسبه این قلم..."
              />
            </div>

            {/* Active & Sort Order */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span style={{ fontSize: '13px', fontWeight: '600' }}>قلم فعال باشد (در سرچ و پورتفو نمایش داده شود)</span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>اولویت ترتیب:</label>
                <input
                  type="number"
                  className="input"
                  style={{ width: '70px', padding: '4px 8px' }}
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 10 })}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
              >
                انصراف
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{
                  background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                  color: '#000',
                  fontWeight: '700',
                  border: 'none',
                }}
              >
                <Save size={16} />
                <span>{submitting ? 'در حال ذخیره...' : 'ذخیره قلم محاسباتی'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
