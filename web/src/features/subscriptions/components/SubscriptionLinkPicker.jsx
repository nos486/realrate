/**
 * SubscriptionLinkPicker.jsx — «کدام اشتراک»: the subscription an expense in «اینترنت و اشتراک‌ها»
 * pays (utils/categoryLinks.js, `subscriptionId`), or a new one made from the expense
 *
 * Offers the user's subscriptions (a cancelled one only when the expense already names it).
 * Picking one fills its name, price, currency and account; saving the expense moves it on
 * (shared/vault/recordLinks.js). «+ اشتراک جدید» (value `{ create: { cycleMonths } }`) makes one
 * named after the expense when it is saved, this payment its first.
 */

import React from 'react';
import { FilterPills } from '../../../shared/ui/index.js';
import { SUBSCRIPTION_CYCLES } from '../../../utils/subscriptionDocument.js';
import { useOptionalSubscriptions } from '../context/SubscriptionsContext.jsx';
import { isNewSubscription, newSubscriptionLink } from '../../../shared/links/linkValues.js';

const NEW = '__new__';
const CYCLE_OPTIONS = SUBSCRIPTION_CYCLES.map(({ months, label }) => ({ value: String(months), label }));

/**
 * @param {{ value: string|{ create: { cycleMonths: number } }|null, onChange: (value: unknown) => void,
 *   onFill?: (fields: object) => void, title?: string, keepId?: string }} props
 *   title: the expense's title (the new subscription's name); keepId: the one it already names
 */
export default function SubscriptionLinkPicker({ value, onChange, onFill, title = '', keepId = '' }) {
  const all = useOptionalSubscriptions();
  const choices = all
    .filter((s) => s.status !== 'cancelled' || s.id === keepId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
  const creating = isNewSubscription(value);

  const pick = (id) => {
    if (id === NEW) return onChange(newSubscriptionLink());
    onChange(id);
    const sub = choices.find((s) => s.id === id);
    if (sub) onFill?.({ title: sub.name, amount: sub.amount, currency: sub.currency === 'USD' ? 'USD' : 'IRT', accountId: sub.accountId || '' });
  };

  return (
    <div className="ui-input-group">
      <span className="ui-input-label">کدام اشتراک</span>
      <FilterPills
        options={[
          { value: '', label: 'هیچ‌کدام' },
          ...choices.map((s) => ({ value: s.id, label: s.name })),
          { value: NEW, label: '+ اشتراک جدید' },
        ]}
        activeValue={creating ? NEW : value || ''}
        onChange={pick}
        size="sm"
        className="income-category-picker"
      />
      {creating && (
        <>
          <FilterPills
            options={CYCLE_OPTIONS}
            activeValue={String(value.create.cycleMonths)}
            onChange={(months) => onChange(newSubscriptionLink(Number(months)))}
            size="sm"
          />
          <p className="expense-form-hint">
            با ثبت این هزینه، اشتراکی به نام «{title.trim() || '…'}» با همین مبلغ و دوره ساخته می‌شود و این پرداخت اولینِ آن است؛ جزئیاتش را بعداً در «اشتراک‌ها» ویرایش کنید.
          </p>
        </>
      )}
    </div>
  );
}
