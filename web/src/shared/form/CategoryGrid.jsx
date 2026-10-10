/**
 * CategoryGrid.jsx — An entry form's category as a grid of icon tiles: the ones used last first,
 * a few at once and «همه‌ی دسته‌ها» for the rest, instead of a wall of pills
 *
 * The order is fixed when the form opens (a tile never moves under the finger); the chosen one is
 * always in view. What was used last is remembered per kind on this device only
 * (recentCategories.js, a convenience — never a record).
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { recentCategories, RECENT_LIMIT } from './recentCategories.js';

/** How many tiles show before «همه‌ی دسته‌ها» */
export const COLLAPSED_TILES = 8;

/** The options, the recent ones first (each kept once, in the user's order otherwise) */
function ordered(options, kind) {
  const recent = recentCategories(kind).filter((v) => options.some((o) => o.value === v));
  const rank = (o) => {
    const i = recent.indexOf(o.value);
    return i === -1 ? RECENT_LIMIT : i;
  };
  return options.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map(({ o }) => o);
}

/**
 * @param {{ kind: 'expense'|'income', options: { value: string, label: string, Icon?: Function,
 *   color?: string }[], value: string, onChange: (v: string) => void, onManage?: () => void,
 *   label?: string }} props
 */
export default function CategoryGrid({ kind, options, value, onChange, onManage, label = 'دسته‌بندی' }) {
  const [order] = useState(() => ordered(options, kind).map((o) => o.value));
  const [expanded, setExpanded] = useState(false);
  // Categories added since it opened (the manager) go last
  const byValue = new Map(options.map((o) => [o.value, o]));
  const all = [...order.filter((v) => byValue.has(v)), ...options.map((o) => o.value).filter((v) => !order.includes(v))]
    .map((v) => byValue.get(v));
  const fits = all.length <= COLLAPSED_TILES;
  let shown = expanded || fits ? all : all.slice(0, COLLAPSED_TILES - 1);
  // The chosen one is always in view
  if (!shown.some((o) => o.value === value)) {
    const chosen = byValue.get(value);
    if (chosen) shown = [...shown.slice(0, -1), chosen];
  }

  return (
    <div className="ui-input-group category-grid-field">
      <div className="category-grid-head">
        <span className="ui-input-label" id={`${kind}-category-label`}>{label}</span>
        {onManage && <button type="button" className="category-picker-edit" onClick={onManage}>ویرایش و افزودن دسته</button>}
      </div>
      <div className="category-grid" role="radiogroup" aria-labelledby={`${kind}-category-label`}>
        {shown.map(({ value: v, label: name, Icon, color }) => (
          <button
            key={v || 'none'}
            type="button"
            role="radio"
            aria-checked={v === value}
            aria-label={name}
            className={`category-tile ${v === value ? 'is-active' : ''}`}
            style={color ? { '--swatch': color } : undefined}
            onClick={() => onChange(v)}
          >
            <span className="category-tile-icon">{Icon ? <Icon size={18} strokeWidth={2} /> : null}</span>
            <span className="category-tile-label">{name}</span>
          </button>
        ))}
        {!fits && (
          <button type="button" className="category-tile is-more" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
            <span className="category-tile-icon">{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
            <span className="category-tile-label">{expanded ? 'کمتر' : `همه‌ی دسته‌ها (${all.length.toLocaleString('fa-IR')})`}</span>
          </button>
        )}
      </div>
    </div>
  );
}
