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
  addWidget, configureWidget, layoutColumns, placeWidget, removeWidget, setWidgetHeight, DASHBOARD_LIMITS, WIDGET_CATALOG,
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
  const screen = appLayout ? 'mobile' : 'desktop';
  const { widgets, setWidgets, resetScreen, isCustomized, saveError } = useDashboardLayout(screen);
  const vault = useVault();
  const { confirm } = useFeedback();
  const { readOnly } = useDemo();
  const canSee = useWidgetAccess();
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsId, setSettingsId] = useState(null);

  // The wide grid has 3 columns, 2 on a mid-size window; the app frame is one column
  const midSize = useMediaQuery('(max-width: 1100px)');
  const columnCount = appLayout ? 1 : midSize ? 2 : DASHBOARD_LIMITS.columns;
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
  const settingsWidget = widgets.find((w) => w.id === settingsId) || null;
  const shown = isEditing ? widgets : widgets.filter((w) => canSee(w.type));
  const columns = useMemo(() => layoutColumns(shown, columnCount), [shown, columnCount]);

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    if (overId.startsWith(COLUMN_PREFIX)) {
      setWidgets(placeWidget(widgets, columnCount, active.id, Number(overId.slice(COLUMN_PREFIX.length))));
      return;
    }
    const column = columns.findIndex((list) => list.some((w) => w.id === over.id));
    if (column >= 0) setWidgets(placeWidget(widgets, columnCount, active.id, column, over.id));
  };

  const handleAdd = (type) => {
    const next = addWidget(widgets, type);
    setWidgets(next);
    setPickerOpen(false);
    // A widget that needs a choice asks for it right away
    if (WIDGET_CATALOG[type].options?.assets) setSettingsId(next[next.length - 1].id);
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: t('بازگشت به چیدمان پیش‌فرض'),
      message: appLayout
        ? t('چیدمان ویجت‌های صفحه اصلی موبایل به حالت پیش‌فرض برمی‌گردد. چیدمان نسخه‌ی وب تغییری نمی‌کند.')
        : t('چیدمان ویجت‌های صفحه اصلی وب به حالت پیش‌فرض برمی‌گردد. چیدمان موبایل تغییری نمی‌کند.'),
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
    if (ok) setWidgets(removeWidget(widgets, widget.id));
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
                      available={canSee(widget.type)}
                      sizable={!appLayout}
                      first={i === 0}
                      last={i === list.length - 1}
                      onHeight={(height) => setWidgets(setWidgetHeight(widgets, widget.id, height))}
                      onMove={(step) => list[i + step] && setWidgets(placeWidget(widgets, columnCount, widget.id, c, list[i + step].id))}
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
          onClose={() => setSettingsId(null)}
          onChange={(config) => setWidgets(configureWidget(widgets, settingsWidget.id, config))}
        />
      </div>
    </DashboardContext.Provider>
  );
}
