/**
 * AssetLedgerDetails.jsx — Everything recorded for one asset, under its row (utils/assetLedger.js)
 *
 * One line per entry, in date order (FIFO reads that way): what it was, its day, quantity × price,
 * what is left of it (a buy) or what it took from (a sale or a spend), and its own profit or loss:
 *   - a buy: what is left of it at today's price plus what was realized from it when sold
 *   - a sale or a spend: what it realized («بدون سود/زیان» from a purchase without a price)
 * «خرید» opens the buy form for this asset, «فروش» the sell form; each entry opens its own form
 * (an entry made by an expense or an income — a spend, an investment, a sale — is changed there).
 * Each entry's notes show in its own row (on phones, on a line under it).
 */

import { intlLocale, t, plural } from '../../../utils/i18n.js';
import React from 'react';
import {
  ArrowDownLeft, ArrowUpRight, ClipboardList, Receipt, Pencil, Trash2, Plus, Minus, AlertTriangle, MessageSquare,
} from 'lucide-react';
import { formatNum, computeReferenceAssetPnl } from '../utils/holdingHelpers.js';
import { DollarPnl } from '../../../shared/ui/DollarValue.jsx';
import { toPersianDigits } from '../../../shared/utils/formatters.js';

const KIND = {
  // A buy from the buy form (a holding record): «خرید» with a price, else «موجودی»
  manual: { label: t('موجودی'), Icon: ClipboardList, tone: 'in' },
  buy: { label: t('خرید'), Icon: ArrowDownLeft, tone: 'in' },
  sell: { label: t('فروش'), Icon: ArrowUpRight, tone: 'out' },
  spend: { label: t('پرداخت هزینه'), Icon: Receipt, tone: 'out' },
};

const MASK = '****';
const EPS = 1e-9;
const kindOf = (kind, price) => (kind === 'manual' && price > 0 ? { ...KIND.manual, label: t('خرید'), Icon: ArrowDownLeft } : KIND[kind] || KIND.buy);
const qtyText = (n) => Number(n || 0).toLocaleString(intlLocale(), { maximumFractionDigits: 6 });
const dateLabel = (d) => (d ? toPersianDigits(d) : t('موجودی اولیه'));
const signed = (v) => `${v >= 0 ? '+' : '−'}${formatNum(Math.abs(v))}`;

function Pnl({ value, hideValues, title, none = t('بدون سود/زیان') }) {
  if (value === null || value === undefined) return <span className="ledger-pnl is-none" title={title}>{none}</span>;
  return (
    <span className={`ledger-pnl ${value >= 0 ? 'profit' : 'loss'}`} title={title}>
      {hideValues ? MASK : <>{signed(value)} <small>{t('تومان')}</small></>}
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
  // The open position in dollars (utils/assetLedger.js assetDollarPnl), or null
  dollarPnl = null,
  // What goals have reserved of this asset: [{ goalName, quantity }]
  goalShares = [],
  // The total the goals hold of this asset, `over` when they asked for more than is held now
  goalReserved = null,
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
            <span>{t('سود/زیان تحقق‌یافته:')}{' '}<Pnl value={asset.realizedPnl} hideValues={hideValues} /></span>
          )}
          <DollarPnl pnl={dollarPnl} hideValues={hideValues} />
          {goalShares.map((share) => (
            <span key={share.goalId} className="asset-ledger-muted">{t('{qty} {unit} برای هدف «{goal}»', { qty: qtyText(share.quantity), unit: asset.unit, goal: share.goalName })}</span>
          ))}
          {goalReserved && (
            <span className="asset-ledger-muted">
              {t('در دسترس: {qty} {unit}', { qty: hideValues ? MASK : qtyText(Math.max(0, asset.amount - goalReserved.quantity)), unit: asset.unit })}
            </span>
          )}
          {goalReserved?.over && (
            <span className="asset-ledger-muted">{t('اختصاص‌ها از موجودی فعلی بیشتر است ({asked} {unit}) و برای هدف‌ها کم شده؛ اختصاص را در صفحه‌ی اهداف اصلاح کنید.', { asked: qtyText(goalReserved.asked), unit: asset.unit })}</span>
          )}
          {asset.unpricedQty > EPS && (
            <span className="asset-ledger-muted">{t('{qty} {unit} بدون قیمت خرید (در سود/زیان حساب نمی‌شود)', { qty: qtyText(asset.unpricedQty), unit: asset.unit })}</span>
          )}
        </div>
        {!readOnly && (onBuy || onSell) && (
          <div className="asset-ledger-actions">
            {onBuy && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onBuy(asset)}>
                <Plus size={14} />{' '}{t('خرید')}
              </button>
            )}
            {onSell && asset.amount > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onSell(asset)}>
                <Minus size={14} />{' '}{t('فروش')}
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
              pnlTitle = t('باز: {open} · تحقق‌یافته: {realized} تومان', { open: signed(open), realized: signed(realized) });
            }
            status = closed ? t('تمام شد') : entry.remaining < entry.qty - EPS ? t('مانده {qty}', { qty: hideValues ? MASK : qtyText(entry.remaining) }) : t('کامل');
          } else {
            pnl = entry.pnl;
            const parts = (entry.consumed || []).map((c) => `${kindOf(c.lotKind, c.lotPrice).label} ${dateLabel(entryById.get(c.lotId)?.date || c.lotDate)}: ${qtyText(c.qty)}${c.pnl === null ? t(' (بی‌قیمت)') : ` (${signed(c.pnl)})`}`);
            statusTitle = parts.join('\n');
            status = parts.length ? plural(parts.length, t('از {count} خرید', { count: parts.length.toLocaleString(intlLocale()) }), t('از {count} خریدها', { count: parts.length.toLocaleString(intlLocale()) })) : '';
          }

          // What a purchase was paid with, shown under it (and how holding that would be doing now)
          const extras = [];
          if (incoming) {
            const lotValue = entry.qty * unit;
            const refQty = Number(record.referenceQuantity) || 0;
            if (record.referenceAssetId && refQty > 0) {
              const reference = computeReferenceAssetPnl({ ...record, itemRealVal: lotValue }, priceMap, itemMap);
              const name = reference?.referenceAssetName || record.referenceAssetId;
              const paid = t('پرداخت با {qty} {unit} {name}', { qty: hideValues ? MASK : qtyText(refQty), unit: reference?.unit || '', name }).replace(/\s+/g, ' ');
              extras.push({
                key: 'reference',
                text: reference && !hideValues
                  ? t('{paid} — نسبت به نگه داشتن آن: {amount} تومان', { paid, amount: signed(reference.referencePnl) })
                  : paid,
                tone: reference && !hideValues ? (reference.referencePnl >= 0 ? 'profit' : 'loss') : '',
              });
            }
          }
          const rawNotes = showNotes ? String(record.notes || '').trim() : '';
          const notes = rawNotes !== kind.label ? rawNotes : '';
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
                {entry.price > 0 ? <> × {money(entry.price)}</> : <small className="asset-ledger-muted">{' '}{t('بی‌قیمت')}</small>}
              </span>
              <span className={`asset-ledger-status ${closed ? 'is-closed' : ''}`} title={statusTitle || undefined}>
                {status}
                {!incoming && entry.uncoveredQty > 0 && (
                  <span className="asset-ledger-warning" title={t('{qty} {unit} بیشتر از موجودی', { qty: qtyText(entry.uncoveredQty), unit: asset.unit })}>
                    <AlertTriangle size={13} />
                  </span>
                )}
              </span>
              <span className="asset-ledger-notes" title={notes || undefined}>
                {notes && <><MessageSquare size={12} aria-label={t('یادداشت')} /><span>{notes}</span></>}
              </span>
              <span className="asset-ledger-pnl-cell">
                <Pnl value={pnl} hideValues={hideValues} title={pnlTitle || undefined} none={incoming ? '—' : t('بدون سود/زیان')} />
              </span>
              <span className="row-actions-group asset-ledger-entry-actions">
                {editable && onEditEntry && (
                  <button type="button" className="btn-table-action edit" title={t('ویرایش')} onClick={() => onEditEntry(entry, asset)}>
                    <Pencil size={13} />
                  </button>
                )}
                {editable && onDeleteEntry && (
                  <button type="button" className="btn-table-action delete" title={t('حذف')} onClick={() => onDeleteEntry(entry, asset)}>
                    <Trash2 size={13} />
                  </button>
                )}
                {linkedTo && !readOnly && (
                  <small className="asset-ledger-muted" title={linkedTo === 'expense' ? t('از صفحه‌ی هزینه‌ها ویرایش می‌شود') : t('از صفحه‌ی درآمدها ویرایش می‌شود')}>
                    {linkedTo === 'expense' ? t('از هزینه‌ها') : t('از درآمدها')}
                  </small>
                )}
              </span>
              {extras.length > 0 && (
                <span className="asset-ledger-extras">
                  {extras.map((x) => <span key={x.key} className={`asset-ledger-extra ${x.tone}`}>{x.text}</span>)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
