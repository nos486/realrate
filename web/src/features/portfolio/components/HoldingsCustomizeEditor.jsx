/**
 * HoldingsCustomizeEditor.jsx — In-place customization editor for portfolio categories
 *
 * Allows users to:
 * - Create, rename, delete custom categories
 * - Select category icons
 * - Reorder categories via drag & drop
 * - Move assets between categories via drag & drop OR via "Move to category..." menu (mobile-friendly)
 * - Reset categories to default
 */

import { intlLocale, t, plural } from '../../../utils/i18n.js';
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  GripVertical,
  ArrowRightLeft,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import {
  CategoryIcon,
  formatAssetName,
  formatNum,
  getItemBrand,
} from '../utils/holdingHelpers.js';
import {
  getAssetKey,
  addGroup,
  removeGroup,
  updateGroup,
  reorderGroups,
  moveAsset,
  resolveAssetGroupId,
  reorderAsset,
  AVAILABLE_CATEGORY_ICONS,
} from '../portfolioLayoutModel.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { useBackToClose } from '../../../shared/hooks/useBackToClose.js';
import TextField from '../../../shared/ui/TextField.jsx';

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

/** Icon picker dropdown / popover */
function IconPicker({ currentIcon, onSelect }) {
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [open]);

  return (
    <div className="portfolio-icon-picker-container" ref={containerRef}>
      <button
        type="button"
        className="portfolio-icon-picker-trigger"
        onClick={() => setOpen((prev) => !prev)}
        title={t('انتخاب آیکون دسته')}
        aria-label={t('انتخاب آیکون دسته')}
      >
        <CategoryIcon category={currentIcon || 'custom'} size={18} />
        <ChevronDown size={11} className="picker-arrow" />
      </button>

      {open && (
        <div className="portfolio-icon-popover" role="dialog" aria-label={t('انتخاب آیکون')}>
          <div className="portfolio-icon-grid">
            {AVAILABLE_CATEGORY_ICONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`portfolio-icon-option ${currentIcon === opt.id ? 'is-selected' : ''}`}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                }}
                title={opt.label}
              >
                <CategoryIcon category={opt.id} size={18} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Move to category..." popup menu for an asset (works on all devices including mobile) */
function MoveMenu({ assetKey, currentGroupId, groups, onMove }) {
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [open]);

  return (
    <div className="portfolio-move-menu-container" ref={containerRef}>
      <button
        type="button"
        className="portfolio-move-btn"
        onClick={() => setOpen((prev) => !prev)}
        title={t('انتقال به دسته دیگر')}
        aria-label={t('انتقال به دسته دیگر')}
      >
        <ArrowRightLeft size={13} />
        <span className="hide-on-mobile">{t('انتقال')}</span>
      </button>

      {open && (
        <div className="portfolio-move-popover" role="menu">
          <div className="portfolio-move-popover-title">{t('انتقال دارایی به دسته:')}</div>
          <div className="portfolio-move-popover-list">
            {groups.map((g) => {
              const isCurrent = g.id === currentGroupId;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`portfolio-move-option ${isCurrent ? 'is-current' : ''}`}
                  disabled={isCurrent}
                  onClick={() => {
                    onMove(assetKey, g.id);
                    setOpen(false);
                  }}
                >
                  <CategoryIcon category={g.icon || 'custom'} size={15} />
                  <span>{g.title}</span>
                  {isCurrent && <span className="current-indicator">{t('(فعلی)')}</span>}
                </button>
              );
            })}
            {currentGroupId !== 'other' && (
              <button
                type="button"
                className="portfolio-move-option is-other"
                onClick={() => {
                  onMove(assetKey, 'other');
                  setOpen(false);
                }}
              >
                <Sparkles size={15} />
                <span>{t('سایر (بدون دسته)')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Single Asset Row in customize view */
function AssetItemRow({
  asset,
  currentGroupId,
  groups,
  itemMap,
  onMoveAsset,
}) {
  const assetKey = asset.key;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, style, isDragging } =
    useSortableStyle(`asset:${assetKey}`);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`portfolio-customize-asset-row ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="asset-row-left">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="portfolio-asset-grip"
          aria-label={t('جابه‌جایی {asset}', { asset: asset.name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        <span className="asset-icon-wrap">
          <CategoryIcon category={asset.category || asset.assetType} size={15} />
        </span>
        <div className="asset-details">
          <strong className="asset-name">{formatAssetName(asset, itemMap)}</strong>
          <span className="asset-meta">
            {asset.count > 1 ? (
              <span className="asset-count-pill">{plural(asset.count, t('{count} رکورد', { count: asset.count.toLocaleString(intlLocale()) }), t('{count} رکوردها', { count: asset.count.toLocaleString(intlLocale()) }))}</span>
            ) : null}
            <span className="asset-qty-badge">
              {Number(asset.totalAmount).toLocaleString(intlLocale())} {asset.unit}
            </span>
            <span className="asset-val-badge">{t('{amount} تومان', { amount: formatNum(asset.totalRealVal) })}</span>
          </span>
        </div>
      </div>

      <div className="asset-row-right">
        <span className={`asset-cat-pill cat-${asset.category || 'custom'}`}>
          {getItemBrand(asset, asset.sourceId ? { id: asset.sourceId } : null)}
        </span>
        <MoveMenu
          assetKey={assetKey}
          currentGroupId={currentGroupId}
          groups={groups}
          onMove={onMoveAsset}
        />
      </div>
    </div>
  );
}

/** Sortable Category Card in customize view */
function SortableCategoryCard({
  group,
  assets,
  allGroups,
  itemMap,
  onUpdateTitle,
  onUpdateIcon,
  onRemove,
  onMoveAsset,
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, style, isDragging } =
    useSortableStyle(group.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`portfolio-customize-group-card ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="portfolio-customize-group-header">
        <div className="group-header-left">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="portfolio-group-grip"
            aria-label={t('جابه‌جایی دسته {group}', { group: group.title })}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <IconPicker
            currentIcon={group.icon}
            onSelect={(newIcon) => onUpdateIcon(group.id, newIcon)}
          />
          <TextField
            type="text"
            className="portfolio-category-title-input"
            value={group.title}
            onChange={(e) => onUpdateTitle(group.id, e.target.value)}
            placeholder={t('عنوان دسته')}
            aria-label={t('عنوان دسته')}
            maxLength={50}
          />
        </div>

        <div className="group-header-right">
          <span className="portfolio-group-items-badge">{plural(assets.length, t('{count} دارایی', { count: assets.length.toLocaleString(intlLocale()) }), t('{count} دارایی‌ها', { count: assets.length.toLocaleString(intlLocale()) }))}</span>
          <button
            type="button"
            className="portfolio-icon-btn is-danger"
            onClick={() => onRemove(group.id)}
            title={t('حذف دسته (دارایی‌ها به سایر منتقل می‌شوند)')}
            aria-label={t('حذف دسته')}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="portfolio-customize-group-body">
        {assets.length === 0 ? (
          <div className="portfolio-category-empty-dropzone">
            {t('این دسته خالی است — دارایی‌ها را به اینجا منتقل کنید یا بکشید.')}
          </div>
        ) : (
          <SortableContext
            items={assets.map((a) => `asset:${a.key}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="portfolio-customize-assets-list">
              {assets.map((asset) => (
                <AssetItemRow
                  key={asset.key}
                  asset={asset}
                  currentGroupId={group.id}
                  groups={allGroups}
                  itemMap={itemMap}
                  onMoveAsset={onMoveAsset}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

export default function HoldingsCustomizeEditor({
  layout,
  portfolioMetrics,
  itemMap = null,
  onChange,
  onReset,
  onClose,
}) {
  const { confirm, toast } = useFeedback();
  const sensors = useDndSensors();

  // Aggregate unique assets from portfolio items (summing amount and real value across rows)
  const uniqueAssetsMap = useMemo(() => {
    const map = new Map();
    for (const it of portfolioMetrics?.items || []) {
      const key = getAssetKey(it);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          key,
          assetId: it.assetId,
          name: it.assetName || it.name,
          unit: it.unit || t('واحد'),
          category: it.category || it.assetType || 'custom',
          sourceId: it.sourceId,
          totalAmount: Number(it.amount) || 0,
          totalRealVal: Number(it.itemRealVal) || 0,
          count: 1,
        });
      } else {
        const existing = map.get(key);
        existing.totalAmount += Number(it.amount) || 0;
        existing.totalRealVal += Number(it.itemRealVal) || 0;
        existing.count += 1;
      }
    }
    return map;
  }, [portfolioMetrics?.items]);

  const groups = useMemo(() => layout?.groups || [], [layout?.groups]);

  // Group assets according to the current layout (an unlisted asset in its standard category's group)
  const { categorizedGroups, uncategorizedAssets } = useMemo(() => {
    const groupIdOf = new Map();
    for (const [key, asset] of uniqueAssetsMap.entries()) groupIdOf.set(key, resolveAssetGroupId(layout, asset));
    const resultGroups = groups.map((g) => {
      // Listed assets first, in the group's order; then those it takes by category
      const listed = (g.items || []).filter((key) => groupIdOf.get(key) === g.id);
      const byCategory = [...groupIdOf.keys()].filter((key) => groupIdOf.get(key) === g.id && !listed.includes(key));
      return {
        ...g,
        assets: [...listed, ...byCategory].map((key) => uniqueAssetsMap.get(key)),
      };
    });

    const unassigned = [];
    for (const [key, asset] of uniqueAssetsMap.entries()) {
      if (groupIdOf.get(key) === null) {
        unassigned.push(asset);
      }
    }

    return { categorizedGroups: resultGroups, uncategorizedAssets: unassigned };
  }, [layout, groups, uniqueAssetsMap]);

  // Actions
  const handleAddCategory = () => {
    const next = addGroup(layout, { title: t('دسته جدید'), icon: 'custom' });
    onChange(next);
  };

  const handleRemoveCategory = async (groupId) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target) return;
    const hasItems = (target.items || []).length > 0;
    if (hasItems) {
      const confirmed = await confirm({
        title: t('حذف دسته «{target}»', { target: target.title }),
        message: t('دارایی‌های این دسته حذف نمی‌شوند و به بخش «سایر» منتقل خواهند شد. آیا ادامه می‌دهید؟'),
        confirmLabel: t('حذف دسته'),
        danger: true,
      });
      if (!confirmed) return;
    }
    const next = removeGroup(layout, groupId);
    onChange(next);
    toast.info(t('دسته «{target}» حذف شد.', { target: target.title }));
  };

  const handleUpdateTitle = (groupId, newTitle) => {
    const next = updateGroup(layout, groupId, { title: newTitle });
    onChange(next);
  };

  const handleUpdateIcon = (groupId, newIcon) => {
    const next = updateGroup(layout, groupId, { icon: newIcon });
    onChange(next);
  };

  const handleMoveAsset = (assetKey, targetGroupId) => {
    const next = moveAsset(layout, assetKey, targetGroupId);
    onChange(next);
  };

  const handleResetToDefault = async () => {
    const confirmed = await confirm({
      title: t('بازگشت به دسته‌بندی پیش‌فرض'),
      message: t('آیا مایلید تمام تغییرات دسته‌بندی سفارشی لغو شده و پورتفو با دسته‌های ثابت برنامه نمایش داده شود؟'),
      confirmLabel: t('بازگشت به پیش‌فرض'),
      danger: true,
    });
    if (!confirmed) return;
    onReset();
    toast.success(t('دسته‌بندی‌ها به حالت پیش‌فرض بازگشتند.'));
  };

  // Drag and drop handler
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // 1. Reordering category cards
    if (!activeId.startsWith('asset:') && !overId.startsWith('asset:')) {
      const next = reorderGroups(layout, activeId, overId);
      onChange(next);
      return;
    }

    // 2. Dragging asset
    if (activeId.startsWith('asset:')) {
      const assetKey = activeId.replace('asset:', '');
      // If dropped over a group card
      const targetGroup = groups.find((g) => g.id === overId);
      if (targetGroup) {
        const next = moveAsset(layout, assetKey, targetGroup.id);
        onChange(next);
        return;
      }
      // If dropped over another asset
      if (overId.startsWith('asset:')) {
        const overAssetKey = overId.replace('asset:', '');
        const targetG = categorizedGroups.find((g) => g.assets.some((a) => a.key === overAssetKey));
        if (targetG) {
          const isSameGroup = targetG.assets.some((a) => a.key === assetKey);
          if (isSameGroup) {
            const next = reorderAsset(layout, targetG.id, assetKey, overAssetKey, targetG.assets.map((a) => a.key));
            onChange(next);
          } else {
            const next = moveAsset(layout, assetKey, targetG.id);
            onChange(next);
          }
        }
      }
    }
  };

  return (
    <div className="portfolio-customize-container">
      {/* Top Banner & Action Controls */}
      <div className="portfolio-customize-bar">
        <div className="portfolio-customize-info">
          <div className="customize-info-icon">
            <SlidersHorizontal size={20} />
          </div>
          <div className="customize-info-text">
            <h4>{t('شخصی‌سازی دسته‌ها')}</h4>
            <p>
              {t('دسته‌ها را به دلخواه بسازید، مرتب کنید و دارایی‌ها را با کشیدن یا منوی انتقال بین دسته‌ها جابه‌جا نمایید.')}
            </p>
          </div>
        </div>

        <div className="portfolio-customize-actions">
          <button
            type="button"
            className="btn-customize-action"
            onClick={handleAddCategory}
            title={t('افزودن دسته جدید')}
          >
            <Plus size={15} />
            <span>{t('دسته جدید')}</span>
          </button>

          <button
            type="button"
            className="btn-customize-action is-secondary"
            onClick={handleResetToDefault}
            title={t('بازگشت به دسته‌های پیش‌فرض سیستم')}
          >
            <RotateCcw size={14} />
            <span>{t('بازگشت به پیش‌فرض')}</span>
          </button>

          <button
            type="button"
            className="btn-customize-action is-primary"
            onClick={onClose}
            title={t('پایان شخصی‌سازی و بستن حالت ویرایش')}
          >
            <Check size={15} />
            <span>{t('پایان ویرایش')}</span>
          </button>
        </div>
      </div>

      {/* Main Sortable Categories List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={groups.map((g) => g.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="portfolio-customize-groups-list">
            {categorizedGroups.map((group) => (
              <SortableCategoryCard
                key={group.id}
                group={group}
                assets={group.assets}
                allGroups={groups}
                itemMap={itemMap}
                onUpdateTitle={handleUpdateTitle}
                onUpdateIcon={handleUpdateIcon}
                onRemove={handleRemoveCategory}
                onMoveAsset={handleMoveAsset}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Uncategorized / "سایر" Assets Section */}
      {uncategorizedAssets.length > 0 && (
        <div className="portfolio-customize-other-card">
          <div className="portfolio-customize-group-header is-other">
            <div className="group-header-left">
              <span className="other-icon-wrap">
                <Sparkles size={18} />
              </span>
              <div className="other-title-stack">
                <strong>{t('سایر (دارایی‌های بدون دسته)')}</strong>
                <small>{t('دارایی‌هایی که دسته‌ای برایشان نیست یا خودتان اینجا گذاشته‌اید. می‌توانید آن‌ها را به دسته‌های بالا منتقل کنید.')}</small>
              </div>
            </div>
            <div className="group-header-right">
              <span className="portfolio-group-items-badge">{plural(uncategorizedAssets.length, t('{count} دارایی', { count: uncategorizedAssets.length.toLocaleString(intlLocale()) }), t('{count} دارایی‌ها', { count: uncategorizedAssets.length.toLocaleString(intlLocale()) }))}</span>
            </div>
          </div>

          <div className="portfolio-customize-group-body">
            <div className="portfolio-customize-assets-list">
              {uncategorizedAssets.map((asset) => (
                <AssetItemRow
                  key={asset.key}
                  asset={asset}
                  currentGroupId="other"
                  groups={groups}
                  itemMap={itemMap}
                  onMoveAsset={handleMoveAsset}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
