/**
 * FormulaCardModal.jsx — «کارت ترکیبی»: a home card the user builds from several assets with a
 * formula (utils/cardFormula.js), new or edited
 *
 * The user names the card, writes the formula with الف، ب، ج، د for the assets and + − × ÷ and
 * parentheses, picks the asset each letter is, and shows the value as a number or a percent. A
 * ready formula (FORMULA_PRESETS: the coin bubble percent, «الف ÷ (ب − الف)») fills it all in. The
 * value at today's prices is shown as it is written; the card is saved only when it is complete.
 */

import React, { useMemo, useState } from 'react';
import { Sigma } from 'lucide-react';
import { Modal, Button, Input, SearchBar } from '../../shared/ui/index.js';
import { usePricing } from '../market/context/PricingContext.jsx';
import { assetOf } from '../market/priceBookAssets.js';
import { formatPrice } from '../market/assetPrice.js';
import {
  FORMULA_VARS,
  FORMULA_FORMATS,
  FORMULA_PRESETS,
  FORMULA_LIMITS,
  parseFormula,
  evaluateFormula,
  formatFormula,
  formatFormulaValue,
  sanitizeFormulaCard,
} from '../../utils/cardFormula.js';

const PICK_LIMIT = 8;

/** One letter's asset: the chosen one, or a search to choose it */
function VarPicker({ variable, assetId, onPick }) {
  const pricing = usePricing();
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(!assetId);
  const asset = assetOf(pricing?.itemMap, assetId);
  const results = useMemo(
    () => (picking && pricing?.searchAssets ? pricing.searchAssets(query, { limit: PICK_LIMIT }).filter((a) => a?.id && a.price > 0) : []),
    [pricing, query, picking],
  );

  return (
    <div className="formula-var">
      <span className="formula-var-letter">{variable.label}</span>
      {!picking && asset ? (
        <>
          <span className="formula-var-asset">
            <strong>{asset.name}</strong>
            <small>{formatPrice(asset.price)} تومان</small>
          </span>
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>تغییر</Button>
        </>
      ) : (
        <div className="formula-var-search">
          <SearchBar value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`دارایی «${variable.label}» را جستجو کنید…`} />
          <ul>
            {results.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => { onPick(a.id); setPicking(false); setQuery(''); }}>
                  <span>{a.name}</span>
                  <small>{formatPrice(a.price)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * @param {{ formula: object|null, onSave: (formula: object) => void, onClose: () => void }} props
 *   formula: the card being edited (its stored definition), or null for a new card
 */
export default function FormulaCardModal({ formula, onSave, onClose }) {
  const pricing = usePricing();
  const [name, setName] = useState(formula?.name || '');
  const [text, setText] = useState(formula ? formatFormula(formula.expr) : '');
  const [vars, setVars] = useState(formula?.vars || {});
  const [format, setFormat] = useState(formula?.format || 'number');

  const parsed = parseFormula(text);
  const used = parsed.ok ? FORMULA_VARS.filter((v) => parsed.vars.includes(v.key)) : [];
  const priceOf = (key) => {
    const price = Number(assetOf(pricing?.itemMap, vars[key])?.price);
    return price > 0 ? price : null;
  };
  const value = parsed.ok ? evaluateFormula(parsed.tree, Object.fromEntries(used.map((v) => [v.key, priceOf(v.key)]))) : null;
  const card = sanitizeFormulaCard({ name, expr: text, vars, format });

  const applyPreset = (preset) => {
    setName(preset.label);
    setText(formatFormula(preset.expr));
    setFormat(preset.format);
    setVars({ ...preset.vars });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={formula ? `ویرایش «${formula.name}»` : 'کارت ترکیبی'}
      subtitle="چند دارایی را با یک فرمول ترکیب کنید؛ کارت مقدار فرمول و نمودار روزانه‌اش را نشان می‌دهد."
      icon={<Sigma size={18} />}
      maxWidth="560px"
      footer={<Button disabled={!card} onClick={() => onSave(card)}>{formula ? 'ذخیره' : 'افزودن کارت'}</Button>}
    >
      <div className="formula-presets" role="group" aria-label="فرمول آماده">
        <span>نمونه:</span>
        {FORMULA_PRESETS.map((p) => (
          <button key={p.key} type="button" className="tx-filter-pill" title={p.hint} onClick={() => applyPreset(p)}>
            {p.label} — <bdi>{formatFormula(p.expr)}</bdi>
          </button>
        ))}
      </div>

      <div className="formula-field">
        <Input
          id="formulaCardName"
          label="نام کارت"
          value={name}
          maxLength={FORMULA_LIMITS.nameLength}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثلاً درصد حباب سکه"
        />
      </div>

      <div className="formula-field">
        <Input
          id="formulaCardExpr"
          label="فرمول"
          value={text}
          maxLength={FORMULA_LIMITS.exprLength}
          onChange={(e) => setText(e.target.value)}
          placeholder="الف ÷ (ب − الف)"
          error={parsed.ok || !text.trim() ? undefined : parsed.error}
          hint={`دارایی‌ها: ${FORMULA_VARS.map((v) => v.label).join('، ')} — عملگرها: + − × ÷ و پرانتز (* و / هم پذیرفته است)`}
        />
      </div>

      {used.length > 0 && (
        <div className="formula-vars">
          {used.map((v) => (
            <VarPicker key={`${v.key}:${vars[v.key] || ''}`} variable={v} assetId={vars[v.key]} onPick={(id) => setVars((prev) => ({ ...prev, [v.key]: id }))} />
          ))}
        </div>
      )}

      <div className="formula-format" role="group" aria-label="نمایش مقدار">
        {Object.entries(FORMULA_FORMATS).map(([key, label]) => (
          <button key={key} type="button" className={`tx-filter-pill ${format === key ? 'active' : ''}`} aria-pressed={format === key} onClick={() => setFormat(key)}>
            {label}
          </button>
        ))}
      </div>

      <p className="formula-preview" role="status">
        مقدار امروز: <strong>{parsed.ok && used.every((v) => vars[v.key]) ? formatFormulaValue(value, format) : '—'}</strong>
        {format === 'percent' && <small> (مقدار فرمول × ۱۰۰)</small>}
      </p>
    </Modal>
  );
}
