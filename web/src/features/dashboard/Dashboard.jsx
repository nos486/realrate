/**
 * Dashboard.jsx — The home page: a grid of widgets the user arranges
 *
 * «شخصی‌سازی» switches to edit mode: widgets are added from the catalog (utils/dashboardLayout.js),
 * dragged (or moved with the arrows), resized, set up and removed; «پایان» saves nothing extra —
 * every change is saved as it is made (useDashboardLayout, an encrypted record). The website and
 * the app frame (the Android app and phones) each keep their own arrangement, and this page edits
 * the one for the screen it is on. Widgets read the market data the page already holds through
 * DashboardContext.
 */

import { t } from '../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import {
  DndContext, closestCenter, pointerWithin, KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Check, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useAppLayout } from '../../shared/app/appLayout.js';
import { useVault } from '../../shared/vault/useVault.js';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useDemo } from '../demo/index.js';
import {
  addWidget, canAddWidget, configureWidget, layoutColumns, placeWidget, removeWidget, setWidgetHeight, screenOfColumns,
  withHiddenWidgets, WIDGET_CATALOG,
} from '../../utils/dashboardLayout.js';
import { DashboardContext } from './DashboardContext.js';
import { useDashboardLayout } from './useDashboardLayout.js';
import { useWidgetAccess } from './widgetRegistry.jsx';
import WidgetFrame from './WidgetFrame.jsx';
import WidgetPicker from './WidgetPicker.jsx';
import WidgetSettings from './WidgetSettings.jsx';

const COLUMN_PREFIX = 'col-';

/**
 * Where a drag ends up: a widget under the pointer wins (the dragged one goes there), else the
 * column the pointer is in (the empty space below its last widget), else the nearest widget
 */
function collide(args) {
  const hits = pointerWithin(args);
  const widgets = hits.filter((hit) => !String(hit.id).startsWith(COLUMN_PREFIX));
  if (widgets.length) return widgets;
  return hits.length ? hits : closestCenter(args);
}

/** One column of the grid; its whole height, empty space included, is a place to drop a widget */
function DashColumn({ index, ids, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${index}` });
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={`dash-col ${isOver ? 'is-over' : ''}`}>{children}</div>
    </SortableContext>
  );
}

/**
 * @param {{ usdToman?: number, analysis?: object[], currencies?: object[], recommendation?: object|null,
 *   marketLoading?: boolean, onOpen: (target: string) => void }} props
 */
export default function Dashboard({ usdToman = 0, analysis = [], currencies = [], recommendation = null, marketLoading = false, onOpen }) {
  const appLayout = useAppLayout();
  // 4 columns on a wide window, 3, 2 on a mid-size one; the app frame is one column. Each count has its own saved list
  const wide = useMediaQuery('(min-width: 1500px)');
  const midSize = useMediaQuery('(max-width: 1100px)');
  const columnCount = appLayout ? 1 : midSize ? 2 : wide ? 4 : 3;
  const screen = screenOfColumns(columnCount);
  const { widgets, setWidgets, resetScreen, isCustomized, saveError } = useDashboardLayout(screen);
  const vault = useVault();
  const { confirm } = useFeedback();
  const { readOnly } = useDemo();
  const access = useWidgetAccess();
  const { canSee } = access;
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsId, setSettingsId] = useState(null);

  const unlocked = vault.status === 'unlocked';
  // The arrangement is an encrypted record: it can be changed once the vault is open
  const canEdit = unlocked && !readOnly;
  const isEditing = editing && canEdit;

  const sensors = useSensors(
    // A small distance keeps taps on the bar's buttons from starting a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const data = useMemo(
    () => ({ usdToman, analysis, currencies, recommendation, marketLoading, open: onOpen }),
    [usdToman, analysis, currencies, recommendation, marketLoading, onOpen],
  );
  // Only what the user can see is drawn and arranged, also while editing (widgets of sections
  // their group does not open stay in the saved list, out of sight, for when it does)
  const shown = useMemo(() => widgets.filter((w) => canSee(w.type)), [widgets, canSee]);
  const setShown = (next) => setWidgets(withHiddenWidgets(next, widgets, canSee));
  const settingsWidget = shown.find((w) => w.id === settingsId) || null;
  const columns = useMemo(() => layoutColumns(shown, columnCount), [shown, columnCount]);

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    if (overId.startsWith(COLUMN_PREFIX)) {
      setShown(placeWidget(shown, columnCount, active.id, Number(overId.slice(COLUMN_PREFIX.length))));
      return;
    }
    const column = columns.findIndex((list) => list.some((w) => w.id === over.id));
    if (column >= 0) setShown(placeWidget(shown, columnCount, active.id, column, over.id));
  };

  const handleAdd = (type) => {
    if (!canAddWidget(widgets, type)) return;
    const next = addWidget(shown, type);
    setShown(next);
    setPickerOpen(false);
    // A widget that needs a choice asks for it right away (one with a default list has it)
    const added = next[next.length - 1];
    if (WIDGET_CATALOG[type].options?.assets && !added.config?.assetIds?.length) setSettingsId(added.id);
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: t('بازگشت به چیدمان پیش‌فرض'),
      message: appLayout
        ? t('چیدمان ویجت‌های صفحه اصلی موبایل به حالت پیش‌فرض برمی‌گردد. چیدمان نسخه‌ی وب تغییری نمی‌کند.')
        : t('چیدمان ویجت‌های صفحه اصلی برای همین تعداد ستون به حالت پیش‌فرض برمی‌گردد. چیدمان تعداد ستون‌های دیگر و موبایل تغییری نمی‌کند.'),
      confirmLabel: t('بازگشت به پیش‌فرض'),
      danger: true,
    });
    if (ok) resetScreen();
  };

  const handleRemove = async (widget) => {
    const ok = await confirm({
      title: t('حذف ویجت'),
      message: t('ویجت «{title}» از صفحه اصلی برداشته شود؟ هر وقت خواستید دوباره اضافه‌اش کنید.', { title: t(WIDGET_CATALOG[widget.type].title) }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (ok) setShown(removeWidget(shown, widget.id));
  };

  return (
    <DashboardContext.Provider value={data}>
      <div className={`dash ${isEditing ? 'is-editing' : ''} ${appLayout ? 'is-app' : ''}`}>
        <div className="dash-toolbar">
          {isEditing ? (
            <>
              <p className="dash-hint">
                {appLayout ? t('در حال چیدن صفحه اصلی موبایل') : t('در حال چیدن صفحه اصلی وب')}
              </p>
              <div className="dash-toolbar-actions">
                <button type="button" className="btn-primary dash-btn" onClick={() => setPickerOpen(true)}>
                  <Plus size={16} /> {t('افزودن ویجت')}
                </button>
                {isCustomized && (
                  <button type="button" className="btn-secondary dash-btn" onClick={handleReset}>
                    <RotateCcw size={16} /> {t('پیش‌فرض')}
                  </button>
                )}
                <button type="button" className="btn-secondary dash-btn" onClick={() => setEditing(false)}>
                  <Check size={16} /> {t('پایان')}
                </button>
              </div>
            </>
          ) : (
            canEdit && (
              <button type="button" className="btn-secondary dash-btn" onClick={() => setEditing(true)}>
                <SlidersHorizontal size={16} /> {t('شخصی‌سازی')}
              </button>
            )
          )}
        </div>

        {saveError && <p className="dash-error" role="alert">{saveError}</p>}
        {vault.status === 'locked' && <VaultUnlockCard title={t('برای دیدن ویجت‌های مالی، اطلاعات را باز کنید')} />}

        {shown.length === 0 ? (
          <div className="dash-empty">
            <p>{t('هنوز ویجتی روی صفحه اصلی نیست.')}</p>
            {canEdit && (
              <button type="button" className="btn-primary dash-btn" onClick={() => { setEditing(true); setPickerOpen(true); }}>
                <Plus size={16} /> {t('افزودن ویجت')}
              </button>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={collide} onDragEnd={handleDragEnd}>
            <div className="dash-grid">
              {columns.map((list, c) => (
                <DashColumn key={c} index={c} ids={list.map((w) => w.id)}>
                  {list.map((widget, i) => (
                    <WidgetFrame
                      key={widget.id}
                      widget={widget}
                      editing={isEditing}
                      config={access.configOf(widget)}
                      sizable={!appLayout}
                      first={i === 0}
                      last={i === list.length - 1}
                      onHeight={(height) => setShown(setWidgetHeight(shown, widget.id, height))}
                      onMove={(step) => list[i + step] && setShown(placeWidget(shown, columnCount, widget.id, c, list[i + step].id))}
                      onSettings={() => setSettingsId(widget.id)}
                      onRemove={() => handleRemove(widget)}
                    />
                  ))}
                </DashColumn>
              ))}
            </div>
          </DndContext>
        )}

        <WidgetPicker isOpen={pickerOpen} onClose={() => setPickerOpen(false)} widgets={widgets} canSee={canSee} onAdd={handleAdd} />
        <WidgetSettings
          key={settingsWidget?.id || 'none'}
          widget={settingsWidget}
          can={access.can}
          onClose={() => setSettingsId(null)}
          onChange={(config) => setShown(configureWidget(shown, settingsWidget.id, config))}
        />
      </div>
    </DashboardContext.Provider>
  );
}
