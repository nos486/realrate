/**
 * AssetLedgerDetails.jsx — Everything recorded for one asset, under its row (utils/assetLedger.js)
 *
 * One line per entry, in date order (FIFO reads that way): what it was, its day, quantity × price,
 * what is left of it (a buy) or what it took from (a sale or a spend), and its own profit or loss:
 *   - a buy: what is left of it at today's price plus what was realized from it when sold
 *   - a sale or a spend: what it realized («بدون سود/زیان» from a purchase without a price)
 * «خرید» opens the buy form for this asset, «فروش» the sell form; each entry opens its own form
 * (an entry made by an expense or an income — a spend, an investment, a sale — is changed there).
 * Each entry's notes show on a line under it.
 */

import React from 'react';
import {
  ArrowDownLeft, ArrowUpRight, ClipboardList, Receipt, Pencil, Trash2, Plus, Minus, AlertTriangle, MessageSquare,
} from 'lucide-react';
import { formatNum, computeReferenceAssetPnl, computeCompareAssetPnl } from '../utils/holdingHelpers.js';
import { toPersianDigits } from '../../../shared/utils/formatters.js';

const KIND = {
  // A buy from the buy form (a holding record): «خرید» with a price, else «موجودی»
  manual: { label: 'موجودی', Icon: ClipboardList, tone: 'in' },
  buy: { label: 'خرید', Icon: ArrowDownLeft, tone: 'in' },
  sell: { label: 'فروش', Icon: ArrowUpRight, tone: 'out' },
  spend: { label: 'پرداخت هزینه', Icon: Receipt, tone: 'out' },
};

const MASK = '****';
const EPS = 1e-9;
const kindOf = (kind, price) => (kind === 'manual' && price > 0 ? { ...KIND.manual, label: 'خرید', Icon: ArrowDownLeft } : KIND[kind] || KIND.buy);
const qtyText = (n) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: 6 });
const dateLabel = (d) => (d ? toPersianDigits(d) : 'موجودی اولیه');
const signed = (v) => `${v >= 0 ? '+' : '−'}${formatNum(Math.abs(v))}`;

function Pnl({ value, hideValues, title, none = 'بدون سود/زیان' }) {
  if (value === null || value === undefined) return <span className="ledger-pnl is-none" title={title}>{none}</span>;
  return (
    <span className={`ledger-pnl ${value >= 0 ? 'profit' : 'loss'}`} title={title}>
      {hideValues ? MASK : <>{signed(value)} <small>تومان</small></>}
    </span>
  );
}

export default function AssetLedgerDetails({
  asset,
  hideValues = false,
  readOnly = false,
  showNotes = true,
  priceMap = {},
  itemMap = null,
  onBuy,
  onSell,
  onEditEntry,
  onDeleteEntry,
}) {
  const money = (v) => (hideValues ? MASK : formatNum(v));
  const entryById = new Map(asset.entries.map((e) => [e.id, e]));
  // What each purchase realized when sales and spends took from it
  const realizedByLot = new Map();
  for (const e of asset.entries) {
    for (const c of e.consumed || []) {
      if (c.pnl !== null) realizedByLot.set(c.lotId, (realizedByLot.get(c.lotId) || 0) + c.pnl);
    }
  }
  const unit = asset.unitRealPrice || 0;

  return (
    <div className="asset-ledger">
      <div className="asset-ledger-head">
        <div className="asset-ledger-facts">
          {asset.realizedPnl !== null && (
            <span>سود/زیان تحقق‌یافته: <Pnl value={asset.realizedPnl} hideValues={hideValues} /></span>
          )}
          {asset.unpricedQty > EPS && (
            <span className="asset-ledger-muted">
              {qtyText(asset.unpricedQty)} {asset.unit} بدون قیمت خرید (در سود/زیان حساب نمی‌شود)
            </span>
          )}
        </div>
        {!readOnly && (onBuy || onSell) && (
          <div className="asset-ledger-actions">
            {onBuy && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onBuy(asset)}>
                <Plus size={14} /> خرید
              </button>
            )}
            {onSell && asset.amount > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onSell(asset)}>
                <Minus size={14} /> فروش
              </button>
            )}
          </div>
        )}
      </div>

      <ol className="asset-ledger-list">
        {asset.entries.map((entry) => {
          const kind = kindOf(entry.kind, entry.price);
          const incoming = kind.tone === 'in';
          const closed = incoming && entry.remaining <= EPS;
          const record = entry.record || {};

          // This entry's own profit or loss, and what it is made of (a tooltip)
          let pnl = null;
          let pnlTitle = '';
          let status = '';
          let statusTitle = '';
          if (incoming) {
            const open = entry.price > 0 && entry.remaining > EPS ? entry.remaining * (unit - entry.price) : 0;
            const realized = realizedByLot.get(entry.id) || 0;
            if (entry.price > 0) {
              pnl = open + realized;
              pnlTitle = `باز: ${signed(open)} · تحقق‌یافته: ${signed(realized)} تومان`;
            }
            status = closed ? 'تمام شد' : entry.remaining < entry.qty - EPS ? `مانده ${hideValues ? MASK : qtyText(entry.remaining)}` : 'کامل';
          } else {
            pnl = entry.pnl;
            const parts = (entry.consumed || []).map((c) => `${kindOf(c.lotKind, c.lotPrice).label} ${dateLabel(entryById.get(c.lotId)?.date || c.lotDate)}: ${qtyText(c.qty)}${c.pnl === null ? ' (بی‌قیمت)' : ` (${signed(c.pnl)})`}`);
            statusTitle = parts.join('\n');
            status = parts.length ? `از ${parts.length.toLocaleString('fa-IR')} خرید` : '';
          }

          // A purchase's own comparisons, shown under it: what it was paid with (and how that would
          // be doing now), and what else the same money could have bought
          const extras = [];
          if (incoming) {
            const lotValue = entry.qty * unit;
            const refQty = Number(record.referenceQuantity) || 0;
            if (record.referenceAssetId && refQty > 0) {
              const reference = computeReferenceAssetPnl({ ...record, itemRealVal: lotValue }, priceMap, itemMap);
              const name = reference?.referenceAssetName || record.referenceAssetId;
              const paid = `پرداخت با ${hideValues ? MASK : qtyText(refQty)} ${reference?.unit || ''} ${name}`.replace(/\s+/g, ' ');
              extras.push({
                key: 'reference',
                text: reference && !hideValues
                  ? `${paid} — نسبت به نگه داشتن آن: ${signed(reference.referencePnl)} تومان`
                  : paid,
                tone: reference && !hideValues ? (reference.referencePnl >= 0 ? 'profit' : 'loss') : '',
              });
            }
            const compare = computeCompareAssetPnl({ ...record, itemCost: entry.price > 0 ? entry.qty * entry.price : 0, itemRealVal: lotValue }, priceMap, itemMap);
            if (compare) {
              extras.push({
                key: 'compare',
                text: hideValues
                  ? `مقایسه با ${compare.compareAssetName}`
                  : `اگر ${compare.compareAssetName} می‌خریدید: ${formatNum(compare.compareCurrentValue)} تومان — این خرید ${signed(compare.comparePnl)} تومان ${compare.comparePnl >= 0 ? 'بهتر' : 'بدتر'}`,
                tone: hideValues ? '' : compare.comparePnl >= 0 ? 'profit' : 'loss',
              });
            }
          }
          const notes = showNotes ? String(record.notes || '').trim() : '';
          if (notes && notes !== kind.label) extras.push({ key: 'notes', text: notes, tone: 'note' });
          // Made by an expense or an income: changed there, not here
          const linkedTo = record.expenseId ? 'expense' : record.incomeId ? 'income' : '';
          const editable = !readOnly && !linkedTo;

          return (
            <li key={`${entry.kind}:${entry.id}`} className={`asset-ledger-entry is-${kind.tone} ${closed ? 'is-closed' : ''}`}>
              <span className="asset-ledger-kind">
                <span className={`asset-ledger-icon is-${kind.tone}`}><kind.Icon size={15} /></span>
                <strong>{kind.label}</strong>
              </span>
              <span className="asset-ledger-date"><bdi>{dateLabel(entry.date)}</bdi></span>
              <span className="asset-ledger-qty">
                {hideValues ? MASK : qtyText(entry.qty)} <small>{asset.unit}</small>
                {entry.price > 0 ? <> × {money(entry.price)}</> : <small className="asset-ledger-muted"> بی‌قیمت</small>}
              </span>
              <span className={`asset-ledger-status ${closed ? 'is-closed' : ''}`} title={statusTitle || undefined}>
                {status}
                {!incoming && entry.uncoveredQty > 0 && (
                  <span className="asset-ledger-warning" title={`${qtyText(entry.uncoveredQty)} ${asset.unit} بیشتر از موجودی`}>
                    <AlertTriangle size={13} />
                  </span>
                )}
              </span>
              <span className="asset-ledger-pnl-cell">
                <Pnl value={pnl} hideValues={hideValues} title={pnlTitle || undefined} none={incoming ? '—' : 'بدون سود/زیان'} />
              </span>
              <span className="row-actions-group asset-ledger-entry-actions">
                {editable && onEditEntry && (
                  <button type="button" className="btn-table-action edit" title="ویرایش" onClick={() => onEditEntry(entry, asset)}>
                    <Pencil size={13} />
                  </button>
                )}
                {editable && onDeleteEntry && (
                  <button type="button" className="btn-table-action delete" title="حذف" onClick={() => onDeleteEntry(entry, asset)}>
                    <Trash2 size={13} />
                  </button>
                )}
                {linkedTo && !readOnly && (
                  <small className="asset-ledger-muted" title={linkedTo === 'expense' ? 'از صفحه‌ی هزینه‌ها ویرایش می‌شود' : 'از صفحه‌ی درآمدها ویرایش می‌شود'}>
                    {linkedTo === 'expense' ? 'از هزینه‌ها' : 'از درآمدها'}
                  </small>
                )}
              </span>
              {extras.length > 0 && (
                <span className="asset-ledger-extras">
                  {extras.map((x) => (
                    <span key={x.key} className={`asset-ledger-extra ${x.tone}`}>
                      {x.key === 'notes' && <MessageSquare size={12} aria-label="یادداشت" />}
                      {x.text}
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
