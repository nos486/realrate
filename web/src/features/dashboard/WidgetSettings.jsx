/**
 * WidgetSettings.jsx — The settings of one widget, drawn from the catalog's `options`: its style
 * (how it looks), how many rows, which market assets in which order, on/off switches and which parts to show
 *
 * Nothing here is specific to a widget: a new widget gets its settings sheet by declaring options
 * in the catalog (utils/dashboardLayout.js). Every change is saved as it is made. A value or switch
 * tied to a section the user cannot open (its `requires`) is not offered; what is saved for it is kept.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useState } from 'react';
import {
  AlignJustify, ArrowDown, ArrowUp, CalendarDays, CalendarRange, Clock, Clock3, LayoutGrid, List, ListChecks, PanelTop, Plus, Settings2, X,
} from 'lucide-react';
import Modal from '../../shared/ui/Modal.jsx';
import AssetPickerModal from '../home/AssetPickerModal.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { assetOf } from '../market/priceBookAssets.js';
import { WIDGET_APPEARANCE, WIDGET_CATALOG, allowedValues } from '../../utils/dashboardLayout.js';

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

/** A titled block of on/off switches, each declared as `{ label, default }` */
function SwitchGroup({ title, defs, config, onChange }) {
  return (
    <Group title={title}>
      {Object.entries(defs).map(([key, def]) => (
        <label key={key} className="dash-switch-row">
          <span>{t(def.label)}</span>
          <span className="switch-wrapper">
            <input type="checkbox" checked={config[key] ?? def.default} onChange={(e) => onChange({ [key]: e.target.checked })} />
            <span className="switch-slider" />
          </span>
        </label>
      ))}
    </Group>
  );
}

/**
 * The market assets of the widget, one row each in the order the widget shows them: moved up or
 * down, removed (while more than `min` are left), and the button that opens the picker
 */
function AssetsGroup({ title, ids, max, min = 0, onPick, onChange }) {
  const pricing = usePricing();
  const nameOf = (id) => assetOf(pricing?.itemMap, id)?.name || id;
  const move = (from, to) => {
    const next = [...ids];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    onChange(next);
  };
  return (
    <Group title={title}>
      <div className="dash-asset-rows">
        {ids.map((id, i) => (
          <div key={id} className="dash-asset-row">
            <span className="dash-asset-row-name">{nameOf(id)}</span>
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t('بالا بردن {title}', { title: nameOf(id) })}><ArrowUp size={14} /></button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === ids.length - 1} aria-label={t('پایین بردن {title}', { title: nameOf(id) })}><ArrowDown size={14} /></button>
            <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} disabled={ids.length <= min} aria-label={t('حذف {title}', { title: nameOf(id) })}><X size={14} /></button>
          </div>
        ))}
      </div>
      {ids.length < max && (
        <button type="button" className="dash-asset-add" onClick={onPick}>
          <Plus size={14} aria-hidden="true" /> {t('انتخاب دارایی')}
        </button>
      )}
    </Group>
  );
}

/**
 * @param {{ widget: object|null, can?: (requirement: string) => boolean, onClose: () => void,
 *   onChange: (config: object) => void }} props
 *   widget: the widget being set (null: closed); can: whether a section or condition holds (useWidgetAccess)
 */
export default function WidgetSettings({ widget, can = () => true, onClose, onChange }) {
  // A widget that needs an asset opens straight onto the picker while it has none
  const [picking, setPicking] = useState(() => {
    const o = widget ? WIDGET_CATALOG[widget.type].options || {} : {};
    return Boolean(o.assets && !widget.config?.assetIds?.length);
  });
  if (!widget) return null;
  const spec = WIDGET_CATALOG[widget.type];
  const options = spec.options || {};
  const config = widget.config || {};
  const max = options.assets?.max || 0;
  const minAssets = options.assets?.min || 0;
  const chosen = config.assetIds || [];

  const setAssets = (ids) => onChange({ assetIds: ids });
  const toggleAsset = (id, add) => {
    if (add && chosen.length >= max) return;
    if (!add && chosen.length <= minAssets) return;
    setAssets(add ? [...chosen, id] : chosen.filter((x) => x !== id));
  };
  const toggleMulti = (key, def, value) => {
    const current = config[key] || def.default;
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const allowed = allowedValues(def, can);
    if (next.filter((v) => allowed.includes(v)).length >= (def.min || 0)) onChange({ [key]: next });
  };
  const toggles = Object.fromEntries(Object.entries(options.toggles || {}).filter(([, def]) => !def.requires || can(def.requires)));

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
      {Object.entries(options.choices || {}).map(([key, def]) => (
        <Group key={key} title={t(def.label)}>
          <Segmented
            label={t(def.label)}
            value={config[key] ?? def.default}
            onPick={(value) => onChange({ [key]: value })}
            options={def.values.map((id) => ({ id, text: t(def.labels[id]) }))}
          />
        </Group>
      ))}
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
      {options.assets && (
        <AssetsGroup
          title={t('دارایی‌ها')}
          ids={chosen}
          max={max}
          min={minAssets}
          onPick={() => setPicking(true)}
          onChange={setAssets}
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
      {Object.entries(options.multi || {}).map(([key, def]) => ({ key, def, values: allowedValues(def, can) })).filter(({ values }) => values.length > 0).map(({ key, def, values }) => (
        <Group key={key} title={t(def.label)}>
          <div className="dash-chip-set" role="group" aria-label={t(def.label)}>
            {values.map((value) => {
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
      {Object.keys(toggles).length > 0 && <SwitchGroup title={t('گزینه‌ها')} defs={toggles} config={config} onChange={onChange} />}
      <SwitchGroup title={t('ظاهر کارت')} defs={WIDGET_APPEARANCE} config={config} onChange={onChange} />
    </Modal>
  );
}
