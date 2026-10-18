/**
 * WidgetFrame.jsx — One widget on the home page. In view mode it is just the widget; in edit mode
 * it gets a bar to drag it (or move it with the arrows), set its height, set its options and remove
 * it, and the widget itself stops reacting to taps.
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Settings2, X } from 'lucide-react';
import ErrorBoundary from '../../shared/ui/ErrorBoundary.jsx';
import { WIDGET_CATALOG, WIDGET_HEIGHTS } from '../../utils/dashboardLayout.js';
import { WIDGET_VIEWS } from './widgetRegistry.jsx';

const HEIGHT_LABELS = { 1: t('کوتاه'), 2: t('متوسط'), 3: t('بلند') };

export default function WidgetFrame({
  widget, editing, available, sizable, first, last, onHeight, onMove, onSettings, onRemove,
}) {
  const spec = WIDGET_CATALOG[widget.type];
  const { Icon, Component } = WIDGET_VIEWS[widget.type];
  const sortable = useSortable({ id: widget.id, disabled: !editing });
  const style = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition };
  const configurable = Boolean(spec.options);
  const title = t(spec.title);

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`dash-widget is-height-${widget.height} ${editing ? 'is-editing' : ''} ${sortable.isDragging ? 'is-dragging' : ''}`}
      data-widget={widget.type}
    >
      {editing && (
        <div className="dash-widget-bar">
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            className="dash-bar-btn is-grip"
            aria-label={t('جابه‌جایی {title}', { title })}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical size={16} />
          </button>
          <span className="dash-widget-name"><Icon size={14} aria-hidden="true" /> {title}</span>
          <button type="button" className="dash-bar-btn" onClick={() => onMove(-1)} disabled={first} aria-label={t('بالاتر')} title={t('بالاتر')}>
            <ChevronUp size={16} />
          </button>
          <button type="button" className="dash-bar-btn" onClick={() => onMove(1)} disabled={last} aria-label={t('پایین‌تر')} title={t('پایین‌تر')}>
            <ChevronDown size={16} />
          </button>
          {sizable && (
            <div className="dash-size-toggle" role="group" aria-label={t('ارتفاع')}>
              {WIDGET_HEIGHTS.map((height) => (
                <button key={height} type="button" className={widget.height === height ? 'is-active' : ''} aria-pressed={widget.height === height} onClick={() => onHeight(height)}>
                  {HEIGHT_LABELS[height]}
                </button>
              ))}
            </div>
          )}
          {configurable && (
            <button type="button" className="dash-bar-btn" onClick={onSettings} aria-label={t('تنظیم {title}', { title })} title={t('تنظیم')}>
              <Settings2 size={16} />
            </button>
          )}
          <button type="button" className="dash-bar-btn is-danger" onClick={onRemove} aria-label={t('حذف {title}', { title })} title={t('حذف')}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="dash-widget-body">
        {available ? (
          <ErrorBoundary resetKey={widget.id}>
            <Component widget={widget} editing={editing} onConfigure={editing ? onSettings : undefined} />
          </ErrorBoundary>
        ) : editing ? (
          <p className="dash-widget-unavailable">{t('این ویجت برای حساب شما فعال نیست و نمایش داده نمی‌شود.')}</p>
        ) : null}
      </div>
    </div>
  );
}
