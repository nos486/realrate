/**
 * WidgetSettings.jsx — The options of one widget (the catalog's `options`): how many rows to
 * list, which market asset to show, or which ones (a list of rates)
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React from 'react';
import { Settings2 } from 'lucide-react';
import Modal from '../../shared/ui/Modal.jsx';
import AssetPickerModal from '../home/AssetPickerModal.jsx';
import { DASHBOARD_LIMITS, WIDGET_CATALOG } from '../../utils/dashboardLayout.js';

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
  if (spec.options?.assets) {
    const chosen = widget.config?.assetIds || [];
    return (
      <AssetPickerModal
        isOpen
        onClose={onClose}
        section={{ title: t('{title} (حداکثر {n})', { title: t(spec.title), n: DASHBOARD_LIMITS.rateListAssets.toLocaleString(intlLocale()) }), items: chosen }}
        onToggle={(assetId, add) => {
          if (add && chosen.length >= DASHBOARD_LIMITS.rateListAssets) return;
          const next = add ? [...chosen, assetId] : chosen.filter((id) => id !== assetId);
          onChange({ assetIds: next });
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
