/**
 * AssetLedgerDetails.jsx — Everything recorded for one asset, under its row (utils/assetLedger.js)
 *
 * In date order (FIFO reads that way): manual records and buys with what is left of each, sells
 * and spends with what they took from which purchase and their profit or loss («بدون سود/زیان»
 * from a purchase without a price). «خرید» / «فروش» open the transaction form for this asset;
 * each entry opens its own form (a spend is changed through its expense).
 */

import React from 'react';
import {
  ArrowDownLeft, ArrowUpRight, ClipboardList, Receipt, Pencil, Trash2, Plus, Minus, AlertTriangle, MessageSquare,
} from 'lucide-react';
import { formatNum, computeReferenceAssetPnl, computeCompareAssetPnl } from '../utils/holdingHelpers.js';
import { formatPct, toPersianDigits } from '../../../shared/utils/formatters.js';

const KIND = {
  // A buy recorded in the buy form (a holding record): «خرید» with a price, else «موجودی»
  manual: { label: 'موجودی', Icon: ClipboardList, tone: 'in' },
  buy: { label: 'خرید', Icon: ArrowDownLeft, tone: 'in' },
  sell: { label: 'فروش', Icon: ArrowUpRight, tone: 'out' },
  spend: { label: 'پرداخت هزینه', Icon: Receipt, tone: 'out' },
};

const MASK = '****';
const kindOf = (kind, price) => (kind === 'manual' && price > 0 ? { ...KIND.manual, label: 'خرید', Icon: ArrowDownLeft } : KIND[kind] || KIND.buy);
const qtyText = (n) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: 6 });
const dateText = (d) => (d ? <bdi>{toPersianDigits(d)}</bdi> : 'موجودی اولیه');

function Pnl({ value, hideValues }) {
  if (value === null || value === undefined) return <span className="ledger-pnl is-none">بدون سود/زیان</span>;
  const up = value >= 0;
  return (
    <span className={`ledger-pnl ${up ? 'profit' : 'loss'}`}>
      {hideValues ? MASK : `${up ? '+' : '−'}${formatNum(Math.abs(value))} تومان`}
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

  return (
    <div className="asset-ledger">
      <div className="asset-ledger-head">
        <div className="asset-ledger-facts">
          {asset.realizedPnl !== null && (
            <span>
              سود/زیان تحقق‌یافته: <Pnl value={asset.realizedPnl} hideValues={hideValues} />
            </span>
          )}
          {asset.unpricedQty > 1e-9 && (
            <span className="asset-ledger-note">
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
          const closed = incoming && entry.remaining <= 1e-9;
          const record = entry.record || {};
          // A purchase's own comparisons (paid with another asset; what else the money could have bought)
          const lotCost = entry.price > 0 ? entry.qty * entry.price : 0;
          const lotValue = entry.qty * (asset.unitRealPrice || 0);
          const reference = incoming ? computeReferenceAssetPnl({ ...record, itemRealVal: lotValue }, priceMap, itemMap) : null;
          const compare = incoming ? computeCompareAssetPnl({ ...record, itemCost: lotCost, itemRealVal: lotValue }, priceMap, itemMap) : null;
          const editable = !readOnly && entry.kind !== 'spend' && (onEditEntry || onDeleteEntry);
          return (
            <li key={`${entry.kind}:${entry.id}`} className={`asset-ledger-entry is-${kind.tone} ${closed ? 'is-closed' : ''}`}>
              <span className={`asset-ledger-icon is-${kind.tone}`}><kind.Icon size={14} /></span>
              <div className="asset-ledger-main">
                <div className="asset-ledger-line">
                  <strong>{kind.label}</strong>
                  <span className="asset-ledger-date">{dateText(entry.date)}</span>
                </div>
                <div className="asset-ledger-line asset-ledger-amounts">
                  <span>
                    {hideValues ? MASK : qtyText(entry.qty)} {asset.unit}
                    {entry.price > 0 ? <> × {money(entry.price)} تومان</> : <span className="asset-ledger-muted"> — بدون قیمت</span>}
                  </span>
                  {incoming ? (
                    <span className={`asset-ledger-remaining ${closed ? 'is-closed' : ''}`}>
                      {closed ? 'تمام شد' : entry.remaining < entry.qty ? `مانده ${hideValues ? MASK : qtyText(entry.remaining)}` : 'دست‌نخورده'}
                    </span>
                  ) : (
                    <Pnl value={entry.pnl} hideValues={hideValues} />
                  )}
                </div>
                {!incoming && entry.consumed?.length > 0 && (
                  <div className="asset-ledger-sources">
                    از:{' '}
                    {entry.consumed.map((c, i) => (
                      <span key={`${c.lotId}:${i}`}>
                        {i > 0 && '، '}
                        {kindOf(c.lotKind, c.lotPrice).label} {dateText(entryById.get(c.lotId)?.date || c.lotDate)} ({hideValues ? MASK : qtyText(c.qty)})
                        {c.pnl === null && ' بی‌قیمت'}
                      </span>
                    ))}
                  </div>
                )}
                {!incoming && entry.uncoveredQty > 0 && (
                  <div className="asset-ledger-warning">
                    <AlertTriangle size={12} /> {qtyText(entry.uncoveredQty)} {asset.unit} بیشتر از موجودی
                  </div>
                )}
                {reference && !hideValues && (
                  <div className={`asset-ledger-sub ${reference.referencePnl >= 0 ? 'profit' : 'loss'}`}>
                    نسبت به {reference.referenceAssetName}: {reference.referencePnl >= 0 ? '+' : '−'}{formatNum(Math.abs(reference.referencePnl))} تومان
                  </div>
                )}
                {compare && !hideValues && (
                  <div className={`asset-ledger-sub ${compare.comparePnl >= 0 ? 'profit' : 'loss'}`}>
                    اگر {compare.compareAssetName} می‌خریدید: {formatNum(compare.compareCurrentValue)} تومان
                    {compare.comparePnlPct !== null && <> (این خرید {formatPct(Math.abs(compare.comparePnlPct))}٪ {compare.comparePnl >= 0 ? 'بهتر' : 'بدتر'})</>}
                  </div>
                )}
                {showNotes && record.notes && entry.kind !== 'spend' && (
                  <div className="asset-ledger-notes"><MessageSquare size={11} /> {record.notes}</div>
                )}
              </div>
              <div className="row-actions-group asset-ledger-entry-actions">
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
                {entry.kind === 'spend' && !readOnly && <span className="asset-ledger-muted" title="از صفحه‌ی هزینه‌ها ویرایش می‌شود">از هزینه‌ها</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
