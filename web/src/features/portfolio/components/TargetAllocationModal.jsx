/**
 * TargetAllocationModal.jsx — «هدف‌گذاری ترکیب پورتفو»: the share (%) each category aims for
 *
 * One row per category (its share today beside it); the targets must add up to 100 to be saved
 * (or all be cleared). «از ترکیب فعلی» starts from today's shares. Saved in the portfolio's
 * encrypted layout (utils/allocationTargets.js).
 */

import React, { useMemo, useState } from 'react';
import { Target, Wand2, Eraser } from 'lucide-react';
import { AlertBanner, Button, Modal, NumericInput } from '../../../shared/ui/index.js';
import { CategoryIcon } from '../utils/holdingHelpers.js';
import { targetKeyOf, DRIFT_THRESHOLD } from '../utils/allocationTargets.js';

const faPct = (n) => `${Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`;
const toInput = (n) => (n > 0 ? String(n) : '');
const parse = (text) => {
  const value = Number(String(text || '').replace(/[,،\s]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0;
};

/** Today's shares, rounded to whole percents that still add up to 100 (largest remainders) */
function sharesToTargets(rows) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!(total > 0)) return {};
  const exact = rows.map((r) => ({ key: r.targetKey, raw: (r.value / total) * 100 }));
  const floored = exact.map((e) => ({ ...e, pct: Math.floor(e.raw) }));
  let left = 100 - floored.reduce((s, e) => s + e.pct, 0);
  [...floored].sort((a, b) => (b.raw - b.pct) - (a.raw - a.pct)).forEach((e) => {
    if (left > 0) {
      e.pct += 1;
      left -= 1;
    }
  });
  return Object.fromEntries(floored.filter((e) => e.pct > 0).map((e) => [e.key, e.pct]));
}

export default function TargetAllocationModal({ groups = [], targets = {}, onSave, onClose }) {
  // Every category (a targeted one holding nothing too)
  const rows = useMemo(() => groups.map((g) => ({
    targetKey: targetKeyOf(g), name: g.name || g.title, icon: g.icon || g.key, value: Number(g.totalRealValue) || 0,
  })), [groups]);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const [draft, setDraft] = useState(() => Object.fromEntries(rows.map((r) => [r.targetKey, toInput(targets?.[r.targetKey])])));

  const values = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, parse(v)]));
  const sum = Math.round(Object.values(values).reduce((s, v) => s + v, 0) * 10) / 10;
  const canSave = sum === 0 || Math.abs(sum - 100) <= 0.5;

  const handleSave = () => {
    onSave(Object.fromEntries(Object.entries(values).filter(([, v]) => v > 0)));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="هدف‌گذاری ترکیب پورتفو"
      subtitle={`سهم هدف هر دسته (جمع ۱۰۰٪)؛ اختلاف بیش از ${DRIFT_THRESHOLD.toLocaleString('fa-IR')}٪ هشدار می‌دهد`}
      icon={<Target size={18} />}
      maxWidth="520px"
      footer={(
        <div className="modal-actions">
          <Button variant="secondary" block onClick={onClose}>انصراف</Button>
          <Button block disabled={!canSave} onClick={handleSave}>ذخیره</Button>
        </div>
      )}
    >
      <div className="income-form-body allocation-target-form">
        <div className="allocation-target-tools">
          <Button size="sm" variant="secondary" icon={<Wand2 size={14} />} disabled={!(total > 0)}
            onClick={() => {
              const next = sharesToTargets(rows);
              setDraft(Object.fromEntries(rows.map((r) => [r.targetKey, toInput(next[r.targetKey])])));
            }}
          >
            از ترکیب فعلی
          </Button>
          <Button size="sm" variant="secondary" icon={<Eraser size={14} />}
            onClick={() => setDraft(Object.fromEntries(rows.map((r) => [r.targetKey, ''])))}
          >
            پاک کردن همه
          </Button>
        </div>

        <ul className="allocation-target-list">
          {rows.map((r) => (
            <li key={r.targetKey} className="allocation-target-row">
              <span className="allocation-target-icon"><CategoryIcon category={r.icon} size={15} /></span>
              <span className="allocation-target-name">
                <strong>{r.name}</strong>
                <small>اکنون {faPct(total > 0 ? (r.value / total) * 100 : 0)}</small>
              </span>
              <NumericInput
                id={`target-${r.targetKey}`}
                aria-label={`هدف ${r.name}`}
                className="allocation-target-input"
                allowDecimals
                value={draft[r.targetKey] || ''}
                placeholder="۰"
                affix="٪"
                onValueChange={(v) => setDraft((d) => ({ ...d, [r.targetKey]: v }))}
              />
            </li>
          ))}
        </ul>

        <div className={`allocation-target-sum ${canSave ? 'is-ok' : 'is-off'}`}>
          جمع اهداف: <strong>{faPct(sum)}</strong>
          {!canSave && <span> — {sum < 100 ? `${faPct(100 - sum)} مانده` : `${faPct(sum - 100)} بیشتر از ۱۰۰`}</span>}
        </div>
        {sum === 0 && Object.keys(targets || {}).length > 0 && (
          <AlertBanner type="info" message="با ذخیره، هدف‌گذاری این پورتفو حذف می‌شود." />
        )}
      </div>
    </Modal>
  );
}
