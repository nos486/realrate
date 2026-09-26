/**
 * HomeDashboard.jsx — The user's customizable home page
 *
 * The page is a list of sections; each section shows any market assets in one card style
 * (detailed or compact). The header holds search, the base rates (USD / ounce inputs) and
 * "شخصی‌سازی", which switches to edit mode: drag cards and sections to reorder them, add or
 * remove assets, rename, change card style, start from a ready-made preset, or reset to default.
 * The layout is saved per user on the server (synced across devices); collapsed sections are
 * remembered per browser.
 */

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SlidersHorizontal,
  Search,
  Plus,
  X,
  Trash2,
  RotateCcw,
  Check,
  LayoutGrid,
  Rows3,
  GripVertical,
  ChevronDown,
  Coins,
  LayoutTemplate,
  TrendingUp,
} from 'lucide-react';
import { SearchBar, EmptyState, Modal } from '../../shared/ui/index.js';
import { SkeletonCards } from '../../shared/ui/Skeleton.jsx';
import AlertBanner from '../../shared/ui/AlertBanner.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { HOME_LAYOUT_LIMITS } from '../../utils/homeLayout.js';
import HomeAssetCard from './HomeAssetCard.jsx';
import AssetPickerModal from './AssetPickerModal.jsx';
import { useHomeLayout } from './useHomeLayout.js';
import { useTrends } from './useTrends.js';
import { buildAssetIndex, resolveHomeAsset } from './homeAssets.js';
import {
  HOME_PRESETS,
  buildDefaultLayout,
  normalizeLayoutIds,
  addSection,
  removeSection,
  updateSection,
  addItem,
  removeItem,
  reorderSections,
  reorderItems,
} from './homeLayoutModel.js';

const STYLE_OPTIONS = [
  { id: 'detailed', label: 'کامل', Icon: LayoutGrid },
  { id: 'compact', label: 'فشرده', Icon: Rows3 },
  { id: 'trend', label: 'روند', Icon: TrendingUp },
];

const COLLAPSED_KEY = 'realrate_home_collapsed';

const faCount = (n) => Number(n).toLocaleString('fa-IR');

/** Collapsed sections, remembered in this browser */
function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch { /* storage unavailable: keep it for this visit only */ }
    return next;
  });
  return [collapsed, toggle];
}

function useDndSensors() {
  return useSensors(
    // A small distance keeps taps on buttons inside a card from starting a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function useSortableStyle(id) {
  const sortable = useSortable({ id });
  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  };
  return { ...sortable, style };
}

/** The trend props of one card (only trend sections use them) */
function trendProps(section, asset, trends) {
  if (section.style !== 'trend' || !trends) return {};
  return {
    trend: trends.trends[String(asset.id).toLowerCase()] || null,
    trendStatus: trends.status,
    bucketSec: trends.bucketSec,
  };
}

function SortableItem({ asset, section, isBest, trends, onRemove }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, style, isDragging } = useSortableStyle(asset.id);
  const name = asset.name || asset.id;
  return (
    <div ref={setNodeRef} style={style} className={`home-item ${isDragging ? 'is-dragging' : ''}`}>
      <HomeAssetCard asset={asset} style={section.style} isBest={isBest} {...trendProps(section, asset, trends)} />
      <div className="home-item-tools">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="home-item-tool is-grip"
          aria-label={`جابه‌جایی ${name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>
        <button type="button" className="home-item-tool is-danger" onClick={onRemove} aria-label={`حذف ${name}`}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function SectionItems({ section, editing, recommendation, trends, onReorder, onRemoveItem, onAdd }) {
  const sensors = useDndSensors();
  const gridClass = section.style === 'compact' ? 'currency-cards-grid home-compact-list' : 'cards-modern-grid';
  const ids = section.resolved.map((a) => a.id);

  if (!editing) {
    return (
      <div className={gridClass}>
        {section.resolved.map((asset) => (
          <div key={asset.id} className="home-item">
            <HomeAssetCard
              asset={asset}
              style={section.style}
              isBest={recommendation?.best_id === asset.id}
              {...trendProps(section, asset, trends)}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => over && active.id !== over.id && onReorder(active.id, over.id)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={gridClass}>
          {section.resolved.map((asset) => (
            <SortableItem
              key={asset.id}
              asset={asset}
              section={section}
              isBest={recommendation?.best_id === asset.id}
              trends={trends}
              onRemove={() => onRemoveItem(asset.id)}
            />
          ))}
          {section.items.length < HOME_LAYOUT_LIMITS.itemsPerSection && (
            <button type="button" className={`home-add-tile ${section.style !== 'compact' ? 'is-detailed' : ''}`} onClick={onAdd}>
              <Plus size={18} />
              <span>افزودن دارایی</span>
            </button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function EditableSection({ section, children, onChange, onRemove }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, style, isDragging } = useSortableStyle(section.id);
  return (
    <section ref={setNodeRef} style={style} className={`home-section is-editable ${isDragging ? 'is-dragging' : ''}`} aria-label={section.title || 'بخش'}>
      <div className="home-section-edit">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="home-section-grip"
          aria-label={`جابه‌جایی بخش ${section.title || ''}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
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
              aria-label={`کارت ${label}`}
              title={`کارت ${label}`}
              onClick={() => onChange({ style: id })}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="home-icon-btn is-danger" onClick={onRemove} aria-label="حذف بخش" title="حذف بخش">
          <Trash2 size={15} />
        </button>
      </div>
      {children}
    </section>
  );
}

function PresetsModal({ isOpen, onClose, onPick }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="قالب‌های آماده" icon={<LayoutTemplate size={18} />} subtitle="از یک چیدمان آماده شروع کنید و بعد تغییرش دهید." maxWidth="460px">
      <ul className="home-preset-list">
        {HOME_PRESETS.map((preset) => (
          <li key={preset.key}>
            <button type="button" className="home-preset-row" onClick={() => onPick(preset)}>
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function HomeDashboard({
  analysis,
  currencies,
  recommendation,
  loading = false,
  ratesPanel = null,
  needsRates = false,
}) {
  const pricing = usePricing();
  const { confirm } = useFeedback();
  const { layout, isCustomized, setLayout, resetLayout, saveError } = useHomeLayout();
  const [editing, setEditing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // null = automatic: open while there is no USD rate, so it is clear where to enter it
  const [ratesChoice, setRatesChoice] = useState(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState(null);
  const [collapsed, toggleCollapsed] = useCollapsedSections();
  const sectionSensors = useDndSensors();
  const ratesOpen = ratesChoice ?? needsRates;

  const assets = pricing?.resolvedAssets;
  const itemMap = pricing?.itemMap;

  const ctx = useMemo(() => ({ analysis: analysis || [], currencies: currencies || [], assets: assets || [] }), [analysis, currencies, assets]);
  const defaultLayout = useMemo(() => buildDefaultLayout(ctx), [ctx]);
  const storedLayout = useMemo(() => normalizeLayoutIds(layout), [layout]);
  const effective = storedLayout || defaultLayout;
  const index = useMemo(() => buildAssetIndex({ itemMap, analysis }), [itemMap, analysis]);

  // Search only filters the normal view; edit mode always shows everything
  const q = !editing && searchOpen ? query.trim().toLowerCase() : '';
  const sections = useMemo(() => effective.sections.map((section) => {
    const items = section.items.map((id) => resolveHomeAsset(id, index));
    return { ...section, resolved: q ? items.filter((a) => a.found && a.searchText.includes(q)) : items };
  }), [effective, index, q]);

  // Every asset in a trend section, fetched together
  const trendIds = useMemo(
    () => effective.sections.filter((s) => s.style === 'trend').flatMap((s) => s.items),
    [effective],
  );
  const trends = useTrends(trendIds);

  const commit = (fn) => setLayout(fn(effective));
  const pickerSection = effective.sections.find((s) => s.id === pickerSectionId) || null;
  const hasData = Boolean(analysis?.length || currencies?.length || assets?.length);

  const startEditing = () => {
    setSearchOpen(false);
    setQuery('');
    setEditing(true);
  };

  const toggleSearch = () => {
    if (searchOpen) setQuery('');
    setSearchOpen((v) => !v);
  };

  const applyPreset = async (preset) => {
    setPresetsOpen(false);
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

  const addNewSection = () => {
    const next = addSection(effective);
    setLayout(next);
    // A new section is empty: open the picker right away
    const added = next.sections[next.sections.length - 1];
    if (added && next.sections.length > effective.sections.length) setPickerSectionId(added.id);
  };

  if (loading && !hasData) {
    return <SkeletonCards count={4} label="در حال دریافت قیمت‌ها" />;
  }

  const visibleSections = q ? sections.filter((s) => s.resolved.length > 0) : sections;

  const renderItems = (section) => (
    <SectionItems
      section={section}
      editing={editing}
      recommendation={recommendation}
      trends={trends}
      onReorder={(activeId, overId) => commit((l) => reorderItems(l, section.id, activeId, overId))}
      onRemoveItem={(assetId) => commit((l) => removeItem(l, section.id, assetId))}
      onAdd={() => setPickerSectionId(section.id)}
    />
  );

  return (
    <div className={`home-dashboard ${editing ? 'is-editing' : ''}`}>
      <div className="home-header">
        <div className="home-header-title">
          <h2>{editing ? 'شخصی‌سازی صفحه' : 'بازار امروز'}</h2>
          {editing && <span>کارت‌ها و بخش‌ها را با دستگیره بکشید</span>}
        </div>
        {!editing && (
          <div className="home-header-actions">
            <button
              type="button"
              className={`home-header-btn ${searchOpen ? 'is-active' : ''}`}
              onClick={toggleSearch}
              aria-pressed={searchOpen}
              aria-label="جستجو"
              title="جستجو"
            >
              <Search size={16} />
            </button>
            {ratesPanel && (
              <button
                type="button"
                className={`home-header-btn ${ratesOpen ? 'is-active' : ''} ${needsRates ? 'has-alert' : ''}`}
                onClick={() => setRatesChoice(!ratesOpen)}
                aria-expanded={ratesOpen}
                title="نرخ دلار و انس مبنای محاسبات"
              >
                <Coins size={16} />
                <span>نرخ مبنا</span>
              </button>
            )}
            <button type="button" className="home-header-btn" onClick={startEditing} title="شخصی‌سازی صفحه">
              <SlidersHorizontal size={16} />
              <span>شخصی‌سازی</span>
            </button>
          </div>
        )}
      </div>

      {!editing && searchOpen && (
        <SearchBar
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder="جستجو در صفحه اصلی…"
          className="home-search"
          autoFocus
        />
      )}

      {!editing && ratesOpen && ratesPanel && (
        <div className="home-rates-panel">
          {needsRates && <p className="home-rates-hint">برای محاسبه ارزش ذاتی و حباب، نرخ دلار را وارد کنید.</p>}
          {ratesPanel}
        </div>
      )}

      {saveError && <AlertBanner type="warning" message={saveError} />}

      {visibleSections.length === 0 && (
        q ? (
          <EmptyState title="موردی یافت نشد" description={`در صفحه اصلی موردی با «${query}» نیست.`} />
        ) : (
          <EmptyState
            title="صفحه اصلی شما خالی است"
            description="بخشی بسازید یا از یک قالب آماده شروع کنید."
            action={
              <button type="button" className="btn-primary" onClick={() => { startEditing(); addNewSection(); }}>
                ساخت اولین بخش
              </button>
            }
          />
        )
      )}

      {editing ? (
        <DndContext
          sensors={sectionSensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => over && active.id !== over.id && commit((l) => reorderSections(l, active.id, over.id))}
        >
          <SortableContext items={visibleSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {visibleSections.map((section) => (
              <EditableSection
                key={section.id}
                section={section}
                onChange={(patch) => commit((l) => updateSection(l, section.id, patch))}
                onRemove={() => handleRemoveSection(section)}
              >
                {renderItems(section)}
              </EditableSection>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        visibleSections.map((section) => {
          // While searching every match is shown, even in collapsed sections
          const isCollapsed = !q && collapsed.has(section.id);
          return (
            <section key={section.id} className={`home-section ${isCollapsed ? 'is-collapsed' : ''}`} aria-label={section.title || 'بخش'}>
              {section.title && (
                <button
                  type="button"
                  className="home-section-head"
                  onClick={() => toggleCollapsed(section.id)}
                  aria-expanded={!isCollapsed}
                >
                  <h3>{section.title}</h3>
                  <span className="home-section-count">{faCount(section.resolved.length)}</span>
                  <ChevronDown size={16} className="home-section-chevron" />
                </button>
              )}
              {!isCollapsed && (
                section.resolved.length === 0 ? (
                  <button type="button" className="home-empty-section" onClick={() => { startEditing(); setPickerSectionId(section.id); }}>
                    <Plus size={16} />
                    <span>این بخش خالی است — دارایی اضافه کنید</span>
                  </button>
                ) : (
                  renderItems(section)
                )
              )}
            </section>
          );
        })
      )}

      {editing && (
        <div className="home-edit-bar" role="toolbar" aria-label="ابزار شخصی‌سازی">
          <button type="button" className="home-edit-bar-btn" onClick={() => setPresetsOpen(true)}>
            <LayoutTemplate size={16} />
            <span>قالب‌ها</span>
          </button>
          <button
            type="button"
            className="home-edit-bar-btn"
            onClick={addNewSection}
            disabled={effective.sections.length >= HOME_LAYOUT_LIMITS.sections}
          >
            <Plus size={16} />
            <span>بخش</span>
          </button>
          {isCustomized && (
            <button type="button" className="home-edit-bar-btn" onClick={handleReset}>
              <RotateCcw size={16} />
              <span>پیش‌فرض</span>
            </button>
          )}
          <button type="button" className="home-edit-bar-btn is-primary" onClick={() => setEditing(false)}>
            <Check size={16} />
            <span>پایان</span>
          </button>
        </div>
      )}

      <PresetsModal isOpen={presetsOpen} onClose={() => setPresetsOpen(false)} onPick={applyPreset} />

      <AssetPickerModal
        isOpen={Boolean(pickerSection)}
        section={pickerSection}
        onClose={() => setPickerSectionId(null)}
        onToggle={(assetId, add) => commit((l) => (add ? addItem(l, pickerSectionId, assetId) : removeItem(l, pickerSectionId, assetId)))}
      />
    </div>
  );
}
