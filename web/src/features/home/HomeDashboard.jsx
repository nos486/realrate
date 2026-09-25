/**
 * HomeDashboard.jsx — The user's customizable home page
 *
 * The page is a list of sections; each section shows any market assets in one card style
 * (detailed or compact). "شخصی‌سازی" switches to edit mode: add/remove/reorder assets and
 * sections, rename, change card style, start from a ready-made preset, or reset to default.
 * The layout is saved per user on the server (synced across devices).
 */

import React, { useMemo, useState } from 'react';
import {
  SlidersHorizontal,
  Plus,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronLeft,
  X,
  Trash2,
  RotateCcw,
  Check,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import { SearchBar, EmptyState } from '../../shared/ui/index.js';
import { SkeletonCards } from '../../shared/ui/Skeleton.jsx';
import AlertBanner from '../../shared/ui/AlertBanner.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { HOME_LAYOUT_LIMITS } from '../../utils/homeLayout.js';
import HomeAssetCard from './HomeAssetCard.jsx';
import AssetPickerModal from './AssetPickerModal.jsx';
import { useHomeLayout } from './useHomeLayout.js';
import { buildAssetIndex, resolveHomeAsset } from './homeAssets.js';
import {
  HOME_PRESETS,
  buildDefaultLayout,
  addSection,
  removeSection,
  moveSection,
  updateSection,
  addItem,
  removeItem,
  moveItem,
} from './homeLayoutModel.js';

const STYLE_OPTIONS = [
  { id: 'detailed', label: 'کارت کامل', Icon: LayoutGrid },
  { id: 'compact', label: 'کارت فشرده', Icon: Rows3 },
];

const faCount = (n) => Number(n).toLocaleString('fa-IR');

function SectionEditBar({ section, index, count, onChange, onMove, onRemove }) {
  return (
    <div className="home-section-edit">
      <input
        className="home-section-title-input"
        value={section.title}
        maxLength={HOME_LAYOUT_LIMITS.titleLength}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="عنوان بخش"
        aria-label="عنوان بخش"
      />
      <div className="home-style-toggle" role="group" aria-label="سبک کارت‌ها">
        {STYLE_OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={section.style === id ? 'is-active' : ''}
            aria-pressed={section.style === id}
            onClick={() => onChange({ style: id })}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="home-section-tools">
        <button type="button" className="home-icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="انتقال بخش به بالا">
          <ArrowUp size={15} />
        </button>
        <button type="button" className="home-icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="انتقال بخش به پایین">
          <ArrowDown size={15} />
        </button>
        <button type="button" className="home-icon-btn is-danger" onClick={onRemove} aria-label="حذف بخش">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

export default function HomeDashboard({ analysis, currencies, recommendation, loading = false }) {
  const pricing = usePricing();
  const { confirm } = useFeedback();
  const { layout, isCustomized, setLayout, resetLayout, saveError } = useHomeLayout();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState(null);

  const assets = pricing?.resolvedAssets;
  const itemMap = pricing?.itemMap;

  const ctx = useMemo(() => ({ analysis: analysis || [], currencies: currencies || [], assets: assets || [] }), [analysis, currencies, assets]);
  const defaultLayout = useMemo(() => buildDefaultLayout(ctx), [ctx]);
  const effective = layout || defaultLayout;
  const index = useMemo(() => buildAssetIndex({ assets, itemMap, analysis, currencies }), [assets, itemMap, analysis, currencies]);

  const q = query.trim().toLowerCase();
  const sections = useMemo(() => effective.sections.map((section) => {
    const items = section.items.map((id) => resolveHomeAsset(id, index));
    return { ...section, resolved: q ? items.filter((a) => a.found && a.searchText.includes(q)) : items };
  }), [effective, index, q]);

  const commit = (fn) => setLayout(fn(effective));
  const pickerSection = effective.sections.find((s) => s.id === pickerSectionId) || null;
  const hasData = Boolean(analysis?.length || currencies?.length || assets?.length);

  const applyPreset = async (preset) => {
    const ok = await confirm({
      title: `قالب «${preset.label}»`,
      message: 'چیدمان فعلی صفحه اصلی با این قالب جایگزین می‌شود. بعد از آن می‌توانید دوباره آن را تغییر دهید.',
      confirmLabel: 'جایگزینی',
    });
    if (ok) setLayout(preset.build(ctx));
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'بازگشت به صفحه پیش‌فرض',
      message: 'همه تغییرات صفحه اصلی حذف می‌شود و صفحه پیش‌فرض نمایش داده می‌شود.',
      confirmLabel: 'بازگشت به پیش‌فرض',
      danger: true,
    });
    if (ok) resetLayout();
  };

  const handleRemoveSection = async (section) => {
    if (section.items.length > 0) {
      const ok = await confirm({
        title: 'حذف بخش',
        message: `بخش «${section.title || 'بدون عنوان'}» با ${faCount(section.items.length)} مورد حذف شود؟`,
        confirmLabel: 'حذف',
        danger: true,
      });
      if (!ok) return;
    }
    commit((l) => removeSection(l, section.id));
  };

  if (loading && !hasData) {
    return <SkeletonCards count={4} label="در حال دریافت قیمت‌ها" />;
  }

  const visibleSections = q ? sections.filter((s) => s.resolved.length > 0) : sections;

  return (
    <div className={`home-dashboard ${editing ? 'is-editing' : ''}`}>
      <div className="home-toolbar">
        <SearchBar
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder="جستجو در صفحه اصلی…"
          className="home-search"
        />
        {editing ? (
          <button type="button" className="btn-primary home-edit-toggle" onClick={() => setEditing(false)} aria-label="پایان شخصی‌سازی">
            <Check size={16} />
            <span>پایان شخصی‌سازی</span>
          </button>
        ) : (
          <button type="button" className="btn-secondary home-edit-toggle" onClick={() => setEditing(true)} aria-label="شخصی‌سازی صفحه">
            <SlidersHorizontal size={16} />
            <span>شخصی‌سازی صفحه</span>
          </button>
        )}
      </div>

      {saveError && <AlertBanner type="warning" message={saveError} />}

      {editing && (
        <div className="home-edit-panel">
          <div className="home-presets">
            <span className="home-presets-label">شروع از قالب آماده:</span>
            {HOME_PRESETS.map((preset) => (
              <button key={preset.key} type="button" className="tx-filter-pill" title={preset.description} onClick={() => applyPreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="home-edit-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => commit((l) => addSection(l))}
              disabled={effective.sections.length >= HOME_LAYOUT_LIMITS.sections}
            >
              <Plus size={15} />
              <span>بخش جدید</span>
            </button>
            {isCustomized && (
              <button type="button" className="btn-secondary" onClick={handleReset}>
                <RotateCcw size={15} />
                <span>بازگشت به پیش‌فرض</span>
              </button>
            )}
          </div>
          <p className="home-edit-hint">
            هر بخش می‌تواند هر دارایی‌ای داشته باشد و سبک کارت‌هایش را خودتان انتخاب می‌کنید. تغییرات خودکار ذخیره
            و روی همه دستگاه‌هایتان اعمال می‌شود.
          </p>
        </div>
      )}

      {visibleSections.length === 0 && (
        q ? (
          <EmptyState title="موردی یافت نشد" description={`در صفحه اصلی موردی با «${query}» نیست.`} />
        ) : (
          <EmptyState
            title="صفحه اصلی شما خالی است"
            description="بخشی بسازید و دارایی‌های دلخواهتان را به آن اضافه کنید."
            action={
              <button type="button" className="btn-primary" onClick={() => { setEditing(true); commit((l) => addSection(l, { title: 'دارایی‌های من' })); }}>
                ساخت اولین بخش
              </button>
            }
          />
        )
      )}

      {visibleSections.map((section, i) => (
        <section key={section.id} className="home-section" aria-label={section.title || 'بخش'}>
          {editing ? (
            <SectionEditBar
              section={section}
              index={i}
              count={visibleSections.length}
              onChange={(patch) => commit((l) => updateSection(l, section.id, patch))}
              onMove={(delta) => commit((l) => moveSection(l, section.id, delta))}
              onRemove={() => handleRemoveSection(section)}
            />
          ) : (
            section.title && (
              <div className="home-section-head">
                <h3>{section.title}</h3>
                <span className="home-section-count">{faCount(section.resolved.length)}</span>
              </div>
            )
          )}

          {section.resolved.length === 0 && !editing ? (
            <button type="button" className="home-empty-section" onClick={() => { setEditing(true); setPickerSectionId(section.id); }}>
              <Plus size={16} />
              <span>این بخش خالی است — دارایی اضافه کنید</span>
            </button>
          ) : (
            <div className={section.style === 'detailed' ? 'cards-modern-grid' : 'currency-cards-grid'}>
              {section.resolved.map((asset, itemIndex) => (
                <div key={asset.id} className="home-item">
                  <HomeAssetCard asset={asset} style={section.style} isBest={recommendation?.best_id === asset.id} />
                  {editing && (
                    <div className="home-item-tools">
                      <button type="button" className="home-icon-btn" onClick={() => commit((l) => moveItem(l, section.id, asset.id, -1))} disabled={itemIndex === 0} aria-label={`انتقال ${asset.name || asset.id} به قبل`}>
                        <ChevronRight size={15} />
                      </button>
                      <button type="button" className="home-icon-btn" onClick={() => commit((l) => moveItem(l, section.id, asset.id, 1))} disabled={itemIndex === section.resolved.length - 1} aria-label={`انتقال ${asset.name || asset.id} به بعد`}>
                        <ChevronLeft size={15} />
                      </button>
                      <button type="button" className="home-icon-btn is-danger" onClick={() => commit((l) => removeItem(l, section.id, asset.id))} aria-label={`حذف ${asset.name || asset.id}`}>
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {editing && section.items.length < HOME_LAYOUT_LIMITS.itemsPerSection && (
                <button type="button" className={`home-add-tile ${section.style === 'detailed' ? 'is-detailed' : ''}`} onClick={() => setPickerSectionId(section.id)}>
                  <Plus size={18} />
                  <span>افزودن دارایی</span>
                </button>
              )}
            </div>
          )}
        </section>
      ))}

      <AssetPickerModal
        isOpen={Boolean(pickerSection)}
        section={pickerSection}
        onClose={() => setPickerSectionId(null)}
        onToggle={(assetId, add) => commit((l) => (add ? addItem(l, pickerSectionId, assetId) : removeItem(l, pickerSectionId, assetId)))}
      />
    </div>
  );
}
