import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import BankLogo from './BankLogo.jsx';
import { bankLogoUrl, getBankGroups, matchBankIdByName, resolveBank } from './resolveBank.js';
import { normalizeBankName } from '../../config/banks.config.js';
import { useCustomBanks } from './useCustomBanks.js';
import { useFeedback } from '../ui/FeedbackProvider.jsx';

const BANK_GROUPS = getBankGroups();

/**
 * BankPicker — choose a standard bank (with logo), one of the user's custom banks, or add a
 * new custom bank. Controlled: `value` / `onChange` carry `{ bankId, lenderName }`, the same
 * pair every bank-referencing record stores.
 */
export default function BankPicker({ value, onChange, label = 'بانک / وام‌دهنده', optional = true, id = 'bank-picker' }) {
  const { customBanks, addBank, removeBank } = useCustomBanks();
  const { confirm, toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const searchRef = useRef(null);

  const selected = resolveBank(value, customBanks);
  const hasSelection = selected.kind !== 'none';

  const q = normalizeBankName(query);
  const matches = (text) => !q || normalizeBankName(text).includes(q);

  const filteredGroups = useMemo(
    () => BANK_GROUPS
      .map((group) => ({ ...group, banks: group.banks.filter((b) => matches(b.name) || matches(b.enName) || (b.aliases || []).some(matches)) }))
      .filter((group) => group.banks.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q]
  );
  const filteredCustom = customBanks.filter((b) => matches(b.name));
  const trimmedQuery = query.trim();
  const canAddQuery = trimmedQuery.length > 0
    && !matchBankIdByName(trimmedQuery)
    && !customBanks.some((b) => normalizeBankName(b.name) === q);

  const choose = (next) => {
    onChange?.(next);
    setOpen(false);
    setQuery('');
  };

  const handleAdd = async () => {
    if (!trimmedQuery) return;
    setAdding(true);
    try {
      const bank = await addBank(trimmedQuery);
      if (bank) {
        toast.success(`بانک «${bank.name}» اضافه شد.`);
        choose({ bankId: bank.id, lenderName: bank.name });
      }
    } catch (err) {
      toast.error(err.message || 'خطا در افزودن بانک');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (bank) => {
    const ok = await confirm({
      title: 'حذف بانک سفارشی',
      message: `بانک «${bank.name}» از فهرست بانک‌های شما حذف شود؟ وام‌هایی که با این بانک ثبت شده‌اند نامش را حفظ می‌کنند.`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeBank(bank.id);
      if (value?.bankId === bank.id) onChange?.({ bankId: '', lenderName: bank.name });
    } catch (err) {
      toast.error(err.message || 'خطا در حذف بانک');
    }
  };

  return (
    <div className={`bank-picker ${open ? 'is-open' : ''}`}>
      <label className="bank-picker-label" htmlFor={id}>
        {label}
        {optional && <span className="bank-picker-optional"> (اختیاری)</span>}
      </label>

      <button
        type="button"
        id={id}
        className="bank-picker-trigger"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => {
          setOpen((v) => !v);
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }}
      >
        <BankLogo bank={selected} size={28} />
        <span className={`bank-picker-value ${hasSelection ? '' : 'is-placeholder'}`}>
          {hasSelection ? selected.name : 'انتخاب بانک'}
        </span>
        <ChevronDown size={16} className="bank-picker-chevron" />
      </button>

      {open && (
        <div
          className="bank-picker-panel"
          id={`${id}-panel`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="bank-picker-search">
            <Search size={15} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو یا نام بانک جدید…"
              aria-label="جستجوی بانک"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canAddQuery && filteredGroups.length === 0 && filteredCustom.length === 0) handleAdd();
                }
              }}
            />
          </div>

          <div className="bank-picker-scroll">
            {hasSelection && !q && (
              <button type="button" className="bank-picker-clear" onClick={() => choose({ bankId: '', lenderName: '' })}>
                بدون بانک
              </button>
            )}

            {filteredCustom.length > 0 && (
              <section className="bank-picker-group">
                <h5>بانک‌های سفارشی من</h5>
                <div className="bank-picker-grid">
                  {filteredCustom.map((bank) => {
                    const resolved = resolveBank({ bankId: bank.id }, customBanks);
                    return (
                      <div key={bank.id} className={`bank-option-wrap ${value?.bankId === bank.id ? 'is-selected' : ''}`}>
                        <button type="button" className="bank-option" onClick={() => choose({ bankId: bank.id, lenderName: bank.name })}>
                          <BankLogo bank={resolved} size={30} />
                          <span>{bank.name}</span>
                        </button>
                        <button
                          type="button"
                          className="bank-option-remove"
                          onClick={() => handleRemove(bank)}
                          aria-label={`حذف بانک ${bank.name}`}
                          title="حذف از فهرست"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {filteredGroups.map((group) => (
              <section className="bank-picker-group" key={group.type}>
                <h5>{group.label}</h5>
                <div className="bank-picker-grid">
                  {group.banks.map((bank) => (
                    <div key={bank.id} className={`bank-option-wrap ${selected.id === bank.id ? 'is-selected' : ''}`}>
                      <button type="button" className="bank-option" onClick={() => choose({ bankId: bank.id, lenderName: bank.name })}>
                        <BankLogo bank={{ logo: bankLogoUrl(bank.id), name: bank.name, kind: 'standard' }} size={30} />
                        <span>{bank.shortName}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {filteredGroups.length === 0 && filteredCustom.length === 0 && !canAddQuery && (
              <p className="bank-picker-empty">بانکی با این نام پیدا نشد.</p>
            )}
          </div>

          <div className="bank-picker-footer">
            {canAddQuery ? (
              <button type="button" className="bank-picker-add" onClick={handleAdd} disabled={adding}>
                <Plus size={15} />
                افزودن «{trimmedQuery}» به‌عنوان بانک سفارشی
              </button>
            ) : (
              <span className="bank-picker-hint">
                بانک مورد نظر در فهرست نیست؟ نامش را در جستجو بنویسید تا به بانک‌های شما اضافه شود.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
