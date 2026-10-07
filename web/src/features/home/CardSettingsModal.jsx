/**
 * CardSettingsModal.jsx — «تنظیم کارت»: what one home card shows (edit mode)
 *
 * - «عدد اصلی کارت»: its last price, or its 30-day / one-year average (the ones it has).
 * - «جایگاه‌ها» (a full card only): up to CARD_SLOT_LIMIT small figures — the asset's own values
 *   (averages, day change, the bubble analysis) and its linked assets' (a coin's bubble: its price,
 *   averages, percent), in the order picked. «پیش‌فرض» goes back to the default (the bubble
 *   analysis for gold and coins).
 * Options and their current values come from cardOptionsOf (homeAssets.js): nothing is fetched.
 */

import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Modal, Button } from '../../shared/ui/index.js';
import { CARD_SLOT_LIMIT } from '../../utils/cardMetrics.js';
import { formatPrice } from '../market/assetPrice.js';

const fa = (n) => Number(n).toLocaleString('fa-IR');

/** An option's value as it reads now */
function valueText(option) {
  if (option.value === null || option.value === undefined) return '';
  if (option.metric && ['change', 'bubblePct', 'deviation'].includes(option.metric)) {
    return `${option.value > 0 ? '+' : ''}${fa(option.value)}٪`;
  }
  return `${option.currency === 'usd' ? '$' : ''}${formatPrice(option.value, option.currency)}`;
}

/**
 * @param {{ asset: object|null, options: { main: object[], slots: object[] }, settings: object|null,
 *   detailed: boolean, onSave: (settings: object|null) => void, onClose: () => void }} props
 */
export default function CardSettingsModal({ asset, options, settings, detailed, onSave, onClose }) {
  const [main, setMain] = useState(settings?.main || 'price');
  // undefined: the default slots (not chosen)
  const [slots, setSlots] = useState(Array.isArray(settings?.slots) ? settings.slots : undefined);
  const chosen = slots || [];

  const groups = useMemo(() => {
    const byLink = new Map();
    for (const o of options.slots) {
      const key = o.linkedId || '';
      if (!byLink.has(key)) byLink.set(key, { title: o.linkedId ? o.linkedName : asset?.name || 'همین دارایی', items: [] });
      byLink.get(key).items.push(o);
    }
    return [...byLink.values()];
  }, [options.slots, asset]);

  const toggleSlot = (key) => {
    if (chosen.includes(key)) setSlots(chosen.filter((k) => k !== key));
    else if (chosen.length < CARD_SLOT_LIMIT) setSlots([...chosen, key]);
  };

  const save = () => {
    const next = {};
    if (main !== 'price') next.main = main;
    if (slots !== undefined) next.slots = slots;
    onSave(Object.keys(next).length ? next : null);
  };

  return (
    <Modal
      isOpen={Boolean(asset)}
      onClose={onClose}
      title={`تنظیم کارت ${asset?.name || ''}`}
      icon={<SlidersHorizontal size={18} />}
      maxWidth="520px"
      footer={(
        <>
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => { setMain('price'); setSlots(undefined); }}>
            پیش‌فرض
          </Button>
          <Button onClick={save}>ذخیره</Button>
        </>
      )}
    >
      <fieldset className="card-settings-group">
        <legend>عدد اصلی کارت</legend>
        <div className="card-settings-options">
          {options.main.map((o) => (
            <label key={o.key} className={`card-settings-option ${main === o.key ? 'is-active' : ''}`}>
              <input type="radio" name="card-main" value={o.key} checked={main === o.key} onChange={() => setMain(o.key)} />
              <span>{o.label}</span>
              <bdi>{valueText(o)}</bdi>
            </label>
          ))}
        </div>
        {options.main.length === 1 && (
          <p className="card-settings-hint">میانگین‌ها از روی قیمت‌های روزانه‌ی ثبت‌شده حساب می‌شوند؛ این دارایی هنوز تاریخچه‌ی کافی ندارد.</p>
        )}
      </fieldset>

      {detailed && (
        <fieldset className="card-settings-group">
          <legend>
            جایگاه‌های کارت <small>({fa(chosen.length)} از {fa(CARD_SLOT_LIMIT)}{slots === undefined ? '، پیش‌فرض' : ''})</small>
          </legend>
          {groups.length === 0 ? (
            <p className="card-settings-hint">برای این دارایی مقدار دیگری برای نمایش نیست.</p>
          ) : groups.map((g) => (
            <div key={g.title} className="card-settings-links">
              <h4>{g.title}</h4>
              <div className="card-settings-options">
                {g.items.map((o) => {
                  const order = chosen.indexOf(o.key);
                  const full = order === -1 && chosen.length >= CARD_SLOT_LIMIT;
                  return (
                    <label key={o.key} className={`card-settings-option ${order !== -1 ? 'is-active' : ''} ${full ? 'is-disabled' : ''}`}>
                      <input type="checkbox" checked={order !== -1} disabled={full} onChange={() => toggleSlot(o.key)} />
                      <span>{order !== -1 ? `${fa(order + 1)}. ` : ''}{o.label}</span>
                      <bdi>{valueText(o)}</bdi>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
      )}
    </Modal>
  );
}
