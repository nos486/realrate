/**
 * WidgetSettings.jsx — The options of one widget (the catalog's `options`): how many rows to
 * list, or which market asset to show
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React from 'react';
import { Settings2 } from 'lucide-react';
import Modal from '../../shared/ui/Modal.jsx';
import AssetPickerModal from '../home/AssetPickerModal.jsx';
import { WIDGET_CATALOG } from '../../utils/dashboardLayout.js';

/**
 * @param {{ widget: object|null, onClose: () => void, onChange: (config: object) => void }} props
 *   widget: the widget being set (null: closed)
 */
export default function WidgetSettings({ widget, onClose, onChange }) {
  if (!widget) return null;
  const spec = WIDGET_CATALOG[widget.type];
  if (spec.options?.asset) {
    return (
      <AssetPickerModal
        isOpen
        onClose={onClose}
        section={{ title: t(spec.title), items: widget.config?.assetId ? [widget.config.assetId] : [] }}
        onToggle={(assetId) => {
          onChange({ assetId });
          onClose();
        }}
      />
    );
  }
  const counts = spec.options?.count || [];
  return (
    <Modal isOpen onClose={onClose} title={t('تنظیم «{title}»', { title: t(spec.title) })} icon={<Settings2 size={18} />} maxWidth="380px">
      {counts.length > 0 && (
        <div className="dash-settings">
          <p className="dash-settings-label">{t('تعداد موردهای نمایش‌داده‌شده')}</p>
          <div className="dash-size-toggle" role="group" aria-label={t('تعداد')}>
            {counts.map((n) => (
              <button key={n} type="button" className={widget.config?.count === n ? 'is-active' : ''} aria-pressed={widget.config?.count === n} onClick={() => onChange({ count: n })}>
                {n.toLocaleString(intlLocale())}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
