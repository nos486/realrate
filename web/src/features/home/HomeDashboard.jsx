/**
 * HomeDashboard.jsx — The user's customizable home page
 *
 * The page is a list of sections; each section shows any market assets in one card style
 * (detailed or compact). The header holds search, the base rates (USD / ounce inputs) and
 * "شخصی‌سازی", which switches to edit mode: drag cards and sections to reorder them, add or
 * remove assets, rename, change card style, show a dollar-priced asset in dollars or tomans,
 * set what a card shows («تنظیم کارت»: its main figure — the last price or an average — and a full
 * card's slots, CardSettingsModal), build a card from several assets with a formula («کارت ترکیبی»,
 * FormulaCardModal), start from a ready-made preset, or reset to default.
 * The layout is saved per user on the server (synced across devices); collapsed sections are
 * remembered per browser.
 */

import { intlLocale, t } from '../../utils/i18n.js';
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
  LayoutTemplate,
  Settings2,
  Sigma,
} from 'lucide-react';
import { SearchBar, EmptyState, Modal } from '../../shared/ui/index.js';
import { SkeletonCards } from '../../shared/ui/Skeleton.jsx';
import AlertBanner from '../../shared/ui/AlertBanner.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { useDemo } from '../demo/index.js';
import { HOME_LAYOUT_LIMITS, HOME_PRICE_DISPLAYS } from '../../utils/homeLayout.js';
import HomeAssetCard from './HomeAssetCard.jsx';
import AssetPickerModal from './AssetPickerModal.jsx';
import { useHomeLayout } from './useHomeLayout.js';
import { buildAssetIndex, resolveHomeAsset, resolveFormulaCard, cardOptionsOf } from './homeAssets.js';
import CardSettingsModal from './CardSettingsModal.jsx';
import FormulaCardModal from './FormulaCardModal.jsx';
import { isFormulaId } from '../../utils/cardFormula.js';
import {
  HOME_PRESETS,
  buildDefaultLayout,
  normalizeLayoutIds,
  addSection,
  removeSection,
  updateSection,
  addItem,
  removeItem,
  setItemDisplay,
  setCardSettings,
  saveFormulaCard,
  reorderSections,
  reorderItems,
} from './homeLayoutModel.js';
import TextField from '../../shared/ui/TextField.jsx';

const STYLE_OPTIONS = [
  { id: 'detailed', label: t('کامل'), Icon: LayoutGrid },
  { id: 'compact', label: t('فشرده'), Icon: Rows3 },
];

const COLLAPSED_KEY = 'realrate_home_collapsed';

const faCount = (n) => Number(n).toLocaleString(intlLocale());

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

/** Edit mode, a dollar-priced asset's card: «نمایش قیمت: دلاری / تومانی» */
function PriceDisplayToggle({ asset, onChange }) {
  return (
    <div className="home-item-display" role="group" aria-label={t('نمایش قیمت {name}', { name: asset.name || asset.id })} title={t('نمایش قیمت')}>
      {Object.entries(HOME_PRICE_DISPLAYS).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={asset.display === id ? 'is-active' : ''}
          aria-pressed={asset.display === id}
          onClick={() => asset.display !== id && onChange(id)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

function SortableItem({ asset, section, isBest, onRemove, onDisplay, onSettings }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, style, isDragging } = useSortableStyle(asset.id);
  const name = asset.name || asset.id;
  return (
    <div ref={setNodeRef} style={style} className={`home-item ${isDragging ? 'is-dragging' : ''}`}>
      <HomeAssetCard asset={asset} style={section.style} isBest={isBest} flippable={false} />
      <div className="home-item-tools">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="home-item-tool is-grip"
          aria-label={t('جابه‌جایی {name}', { name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>
        {asset.usdPriced && <PriceDisplayToggle asset={asset} onChange={onDisplay} />}
        {asset.found && (
          <button type="button" className="home-item-tool" onClick={onSettings} aria-label={t('تنظیم کارت {name}', { name })} title={t('تنظیم کارت')}>
            <Settings2 size={15} />
          </button>
        )}
        <button type="button" className="home-item-tool is-danger" onClick={onRemove} aria-label={t('حذف {name}', { name })}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function SectionItems({ section, editing, recommendation, onReorder, onRemoveItem, onItemDisplay, onItemSettings, onAdd, onAddFormula }) {
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
              onRemove={() => onRemoveItem(asset.id)}
              onDisplay={(display) => onItemDisplay(asset.id, display)}
              onSettings={() => onItemSettings(asset.id)}
            />
          ))}
          {section.items.length < HOME_LAYOUT_LIMITS.itemsPerSection && (
            <>
              <button type="button" className={`home-add-tile ${section.style !== 'compact' ? 'is-detailed' : ''}`} onClick={onAdd}>
                <Plus size={18} />
                <span>{t('افزودن دارایی')}</span>
              </button>
              <button type="button" className={`home-add-tile ${section.style !== 'compact' ? 'is-detailed' : ''}`} onClick={onAddFormula}>
                <Sigma size={18} />
                <span>{t('کارت ترکیبی')}</span>
              </button>
            </>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function EditableSection({ section, children, onChange, onRemove }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, style, isDragging } = useSortableStyle(section.id);
  return (
    <section ref={setNodeRef} style={style} className={`home-section is-editable ${isDragging ? 'is-dragging' : ''}`} aria-label={t(section.title) || t('بخش')}>
      <div className="home-section-edit">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="home-section-grip"
          aria-label={t('جابه‌جایی بخش {title}', { title: t(section.title) || '' })}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <TextField
          className="home-section-title-input"
          value={t(section.title)}
          maxLength={HOME_LAYOUT_LIMITS.titleLength}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t('عنوان بخش')}
          aria-label={t('عنوان بخش')}
        />
        <div className="home-style-toggle" role="group" aria-label={t('سبک کارت‌ها')}>
          {STYLE_OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={section.style === id ? 'is-active' : ''}
              aria-pressed={section.style === id}
              aria-label={t('کارت {style}', { style: label })}
              title={t('کارت {style}', { style: label })}
              onClick={() => onChange({ style: id })}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="home-icon-btn is-danger" onClick={onRemove} aria-label={t('حذف بخش')} title={t('حذف بخش')}>
          <Trash2 size={15} />
        </button>
      </div>
      {children}
    </section>
  );
}

function PresetsModal({ isOpen, onClose, onPick }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('قالب‌های آماده')} icon={<LayoutTemplate size={18} />} subtitle={t('از یک چیدمان آماده شروع کنید و بعد تغییرش دهید.')} maxWidth="460px">
      <ul className="home-preset-list">
        {HOME_PRESETS.map((preset) => (
          <li key={preset.key}>
            <button type="button" className="home-preset-row" onClick={() => onPick(preset)}>
              <strong>{t(preset.label)}</strong>
              <small>{t(preset.description)}</small>
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
}) {
  const pricing = usePricing();
  const { confirm } = useFeedback();
  const { readOnly } = useDemo();
  const { layout, isCustomized, setLayout, resetLayout, saveError } = useHomeLayout();
  const [editing, setEditing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // null = automatic: open while there is no USD rate, so it is clear where to enter it
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState(null);
  // The card whose «تنظیم کارت» is open: { sectionId, assetId }
  const [cardSettingsOf, setCardSettingsOf] = useState(null);
  // The formula card being built or edited: { sectionId, cardId (null: a new card) }
  const [formulaOf, setFormulaOf] = useState(null);
  const [collapsed, toggleCollapsed] = useCollapsedSections();
  const sectionSensors = useDndSensors();

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
    const items = section.items.map((id) => (isFormulaId(id)
      ? resolveFormulaCard(id, section.formulas?.[id], index)
      : resolveHomeAsset(id, index, section.display?.[id], section.cards?.[id])));
    return { ...section, resolved: q ? items.filter((a) => a.found && a.searchText.includes(q)) : items };
  }), [effective, index, q]);

  const commit = (fn) => setLayout(fn(effective));
  const pickerSection = effective.sections.find((s) => s.id === pickerSectionId) || null;
  const formulaSection = formulaOf ? effective.sections.find((s) => s.id === formulaOf.sectionId) || null : null;
  const settingsSection = cardSettingsOf ? effective.sections.find((s) => s.id === cardSettingsOf.sectionId) || null : null;
  const settingsAsset = settingsSection ? sections.find((s) => s.id === settingsSection.id)?.resolved.find((a) => a.id === cardSettingsOf.assetId) || null : null;
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
      title: t('قالب «{name}»', { name: t(preset.label) }),
      message: t('چیدمان فعلی صفحه اصلی با این قالب جایگزین می‌شود. بعد از آن می‌توانید دوباره آن را تغییر دهید.'),
      confirmLabel: t('جایگزینی'),
    });
    if (ok) setLayout(preset.build(ctx));
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: t('بازگشت به صفحه پیش‌فرض'),
      message: t('همه تغییرات صفحه اصلی حذف می‌شود و صفحه پیش‌فرض نمایش داده می‌شود.'),
      confirmLabel: t('بازگشت به پیش‌فرض'),
      danger: true,
    });
    if (ok) resetLayout();
  };

  const handleRemoveSection = async (section) => {
    if (section.items.length > 0) {
      const ok = await confirm({
        title: t('حذف بخش'),
        message: t('بخش «{title}» با {n} مورد حذف شود؟', { title: t(section.title) || t('بدون عنوان'), n: faCount(section.items.length) }),
        confirmLabel: t('حذف'),
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
    return <SkeletonCards count={4} label={t('در حال دریافت قیمت‌ها')} />;
  }

  const visibleSections = q ? sections.filter((s) => s.resolved.length > 0) : sections;

  const renderItems = (section) => (
    <SectionItems
      section={section}
      editing={editing}
      recommendation={recommendation}
      onReorder={(activeId, overId) => commit((l) => reorderItems(l, section.id, activeId, overId))}
      onRemoveItem={(assetId) => commit((l) => removeItem(l, section.id, assetId))}
      onItemDisplay={(assetId, display) => commit((l) => setItemDisplay(l, section.id, assetId, display))}
      // A formula card is set in its own builder
      onItemSettings={(assetId) => (isFormulaId(assetId)
        ? setFormulaOf({ sectionId: section.id, cardId: assetId })
        : setCardSettingsOf({ sectionId: section.id, assetId }))}
      onAddFormula={() => setFormulaOf({ sectionId: section.id, cardId: null })}
      onAdd={() => setPickerSectionId(section.id)}
    />
  );

  return (
    <div className={`home-dashboard ${editing ? 'is-editing' : ''}`}>
      <div className="home-header">
        <div className="home-header-title">
          <h2>{editing ? t('شخصی‌سازی صفحه') : t('بازار امروز')}</h2>
          {editing && <span>{t('کارت‌ها و بخش‌ها را با دستگیره بکشید')}</span>}
        </div>
        {!editing && (
          <div className="home-header-actions">
            <button
              type="button"
              className={`home-header-btn ${searchOpen ? 'is-active' : ''}`}
              onClick={toggleSearch}
              aria-pressed={searchOpen}
              aria-label={t('جستجو')}
              title={t('جستجو')}
            >
              <Search size={16} />
            </button>
            <button
              type="button"
              className="home-header-btn"
              onClick={startEditing}
              disabled={readOnly}
              title={readOnly ? t('در نسخه دمو غیرفعال است') : t('شخصی‌سازی صفحه')}
            >
              <SlidersHorizontal size={16} />
              <span>{t('شخصی‌سازی')}</span>
            </button>
          </div>
        )}
      </div>

      {!editing && searchOpen && (
        <SearchBar
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder={t('جستجو در صفحه اصلی…')}
          className="home-search"
          autoFocus
        />
      )}

      {saveError && <AlertBanner type="warning" message={saveError} />}

      {visibleSections.length === 0 && (
        q ? (
          <EmptyState title={t('موردی یافت نشد')} description={t('در صفحه اصلی موردی با «{query}» نیست.', { query })} />
        ) : (
          <EmptyState
            title={t('صفحه اصلی شما خالی است')}
            description={t('بخشی بسازید یا از یک قالب آماده شروع کنید.')}
            action={
              <button type="button" className="btn-primary" onClick={() => { startEditing(); addNewSection(); }}>
                {t('ساخت اولین بخش')}
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
            <section key={section.id} className={`home-section ${isCollapsed ? 'is-collapsed' : ''}`} aria-label={t(section.title) || t('بخش')}>
              {section.title && (
                <button
                  type="button"
                  className="home-section-head"
                  onClick={() => toggleCollapsed(section.id)}
                  aria-expanded={!isCollapsed}
                >
                  <h3>{t(section.title)}</h3>
                  <span className="home-section-count">{faCount(section.resolved.length)}</span>
                  <ChevronDown size={16} className="home-section-chevron" />
                </button>
              )}
              {!isCollapsed && (
                section.resolved.length === 0 ? (
                  <button type="button" className="home-empty-section" onClick={() => { startEditing(); setPickerSectionId(section.id); }}>
                    <Plus size={16} />
                    <span>{t('این بخش خالی است — دارایی اضافه کنید')}</span>
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
        <div className="home-edit-bar" role="toolbar" aria-label={t('ابزار شخصی‌سازی')}>
          <button type="button" className="home-edit-bar-btn" onClick={() => setPresetsOpen(true)}>
            <LayoutTemplate size={16} />
            <span>{t('قالب‌ها')}</span>
          </button>
          <button
            type="button"
            className="home-edit-bar-btn"
            onClick={addNewSection}
            disabled={effective.sections.length >= HOME_LAYOUT_LIMITS.sections}
          >
            <Plus size={16} />
            <span>{t('بخش')}</span>
          </button>
          {isCustomized && (
            <button type="button" className="home-edit-bar-btn" onClick={handleReset}>
              <RotateCcw size={16} />
              <span>{t('پیش‌فرض')}</span>
            </button>
          )}
          <button type="button" className="home-edit-bar-btn is-primary" onClick={() => setEditing(false)}>
            <Check size={16} />
            <span>{t('پایان')}</span>
          </button>
        </div>
      )}

      {settingsAsset && (
        <CardSettingsModal
          key={`${settingsSection.id}:${settingsAsset.id}`}
          asset={settingsAsset}
          options={cardOptionsOf(settingsAsset.id, index, settingsSection.display?.[settingsAsset.id])}
          settings={settingsSection.cards?.[settingsAsset.id] || null}
          detailed={settingsSection.style !== 'compact'}
          onClose={() => setCardSettingsOf(null)}
          onSave={(settings) => {
            commit((l) => setCardSettings(l, settingsSection.id, settingsAsset.id, settings));
            setCardSettingsOf(null);
          }}
        />
      )}

      {formulaSection && (
        <FormulaCardModal
          key={`${formulaSection.id}:${formulaOf.cardId || 'new'}`}
          formula={formulaOf.cardId ? formulaSection.formulas?.[formulaOf.cardId] || null : null}
          onClose={() => setFormulaOf(null)}
          onSave={(formula) => {
            commit((l) => saveFormulaCard(l, formulaSection.id, formulaOf.cardId, formula));
            setFormulaOf(null);
          }}
        />
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
