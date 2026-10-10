/**
 * linkValues.js — A form's view of its record's category link (utils/categoryLinks.js): the value
 * it starts from, and the subscription picker's «+ اشتراک جدید» value
 */

import { categoryLinkOf } from '../../utils/categoryLinks.js';

/** The value a record keeps for its category's link (none for a category without one) */
export function linkValueOf(side, category, record) {
  const link = categoryLinkOf(side, category);
  return link && record?.category === category ? record[link.field] ?? null : null;
}

/** «+ اشتراک جدید»: a subscription made from the expense when it is saved */
export const newSubscriptionLink = (cycleMonths = 1) => ({ create: { cycleMonths } });

/** Whether a subscription link asks for a new subscription */
export const isNewSubscription = (value) => Boolean(value && typeof value === 'object' && value.create);
