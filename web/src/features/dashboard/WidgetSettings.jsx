/**
 * WidgetSettings.jsx — The settings of one widget, drawn from the catalog's `options`: its style
 * (how it looks), how many rows, which market assets, on/off switches and which parts to show
 *
 * Nothing here is specific to a widget: a new widget gets its settings sheet by declaring options
 * in the catalog (utils/dashboardLayout.js). Every change is saved as it is made.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useState } from 'react';
import {
  AlignJustify, CalendarDays, CalendarRange, Clock, Clock3, LayoutGrid, List, ListChecks, PanelTop, Plus, Settings2, X,
} from 'lucide-react';
import Modal from '../../shared/ui/Modal.jsx';
import AssetPickerModal from '../home/AssetPickerModal.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { assetOf } from '../market/priceBookAssets.js';
import { DASHBOARD_LIMITS, WIDGET_CATALOG } from '../../utils/dashboardLayout.js';

/** An icon for each style value of the catalog (a style without one is drawn with its name only) */
const STYLE_ICONS = {
  grid: LayoutGrid, list: List, tiles: LayoutGrid, compact: AlignJustify, detailed: PanelTop, full: PanelTop,
  digital: Clock3, analog: Clock, month: CalendarDays, agenda: CalendarRange,
};

/** One titled block of the sheet */
function Group({ title, children }) {
  return (
    <section className="dash-settings">
      <p className="dash-settings-label">{title}</p>
      {children}
    </section>
  );
}

/** Pick one of several: a row of buttons */
function Segmented({ label, options, value, onPick }) {
  return (
    <div className="dash-size-toggle dash-style-toggle" role="group" aria-label={label}>
      {options.map(({ id, text, Icon }) => (
        <button key={id} type="button" className={value === id ? 'is-active' : ''} aria-pressed={value === id} onClick={() => onPick(id)}>
          {Icon && <Icon size={15} aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}

/** The market assets of the widget as removable chips, and the button that opens the picker */
function AssetsGroup({ title, ids, max, onPick, onRemove }) {
  const pricing = usePricing();
  return (
    <Group title={title}>
      <div className="dash-asset-chips">
        {ids.map((id) => (
          <span key={id} className="dash-asset-chip">
            {assetOf(pricing?.itemMap, id)?.name || id}
            <button type="button" onClick={() => onRemove(id)} aria-label={t('حذف {title}', { title: assetOf(pricing?.itemMap, id)?.name || id })}><X size={13} /></button>
          </span>
        ))}
        {ids.length < max && (
          <button type="button" className="dash-asset-add" onClick={onPick}>
            <Plus size={14} aria-hidden="true" /> {t('انتخاب دارایی')}
          </button>
        )}
      </div>
    </Group>
  );
}

/**
 * @param {{ widget: object|null, onClose: () => void, onChange: (config: object) => void }} props
 *   widget: the widget being set (null: closed)
 */
export default function WidgetSettings({ widget, onClose, onChange }) {
  // A widget that needs an asset opens straight onto the picker while it has none
  const [picking, setPicking] = useState(() => {
    const o = widget ? WIDGET_CATALOG[widget.type].options || {} : {};
    return Boolean((o.asset || o.assets) && !(widget.config?.assetId || widget.config?.assetIds?.length));
  });
  if (!widget) return null;
  const spec = WIDGET_CATALOG[widget.type];
  const options = spec.options || {};
  const config = widget.config || {};
  const max = options.assets ? DASHBOARD_LIMITS.rateListAssets : 1;
  const chosen = options.assets ? (config.assetIds || []) : (config.assetId ? [config.assetId] : []);

  const setAssets = (ids) => onChange(options.assets ? { assetIds: ids } : { assetId: ids[0] });
  const toggleAsset = (id, add) => {
    if (!options.assets) {
      setAssets([id]);
      setPicking(false);
      return;
    }
    if (add && chosen.length >= max) return;
    setAssets(add ? [...chosen, id] : chosen.filter((x) => x !== id));
  };
  const toggleMulti = (key, def, value) => {
    const current = config[key] || def.default;
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    if (next.length >= (def.min || 0)) onChange({ [key]: next });
  };

  if (picking) {
    return (
      <AssetPickerModal
        isOpen
        onClose={() => {
          setPicking(false);
          if (chosen.length === 0) onClose();
        }}
        section={{ title: t('{title} (حداکثر {n})', { title: t(spec.title), n: max.toLocaleString(intlLocale()) }), items: chosen }}
        onToggle={toggleAsset}
      />
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={t('تنظیم «{title}»', { title: t(spec.title) })} icon={<Settings2 size={18} />} maxWidth="440px">
      {options.style && (
        <Group title={t('نمایش')}>
          <Segmented
            label={t('نمایش')}
            value={config.style}
            onPick={(style) => onChange({ style })}
            options={options.style.values.map((id) => ({ id, text: t(options.style.labels[id]), Icon: STYLE_ICONS[id] }))}
          />
        </Group>
      )}
      {(options.asset || options.assets) && (
        <AssetsGroup
          title={options.assets ? t('دارایی‌ها') : t('دارایی')}
          ids={chosen}
          max={max}
          onPick={() => setPicking(true)}
          onRemove={(id) => setAssets(chosen.filter((x) => x !== id))}
        />
      )}
      {options.count && (
        <Group title={t('تعداد موردهای نمایش‌داده‌شده')}>
          <Segmented
            label={t('تعداد')}
            value={config.count}
            onPick={(count) => onChange({ count })}
            options={options.count.map((n) => ({ id: n, text: n.toLocaleString(intlLocale()) }))}
          />
        </Group>
      )}
      {Object.entries(options.multi || {}).map(([key, def]) => (
        <Group key={key} title={t(def.label)}>
          <div className="dash-chip-set" role="group" aria-label={t(def.label)}>
            {def.values.map((value) => {
              const on = (config[key] || def.default).includes(value);
              return (
                <button key={value} type="button" className={`dash-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleMulti(key, def, value)}>
                  <ListChecks size={13} aria-hidden="true" /> {t(def.labels[value])}
                </button>
              );
            })}
          </div>
        </Group>
      ))}
      {Object.keys(options.toggles || {}).length > 0 && (
        <Group title={t('گزینه‌ها')}>
          {Object.entries(options.toggles).map(([key, def]) => (
            <label key={key} className="dash-switch-row">
              <span>{t(def.label)}</span>
              <span className="switch-wrapper">
                <input type="checkbox" checked={config[key] ?? def.default} onChange={(e) => onChange({ [key]: e.target.checked })} />
                <span className="switch-slider" />
              </span>
            </label>
          ))}
        </Group>
      )}
    </Modal>
  );
}
