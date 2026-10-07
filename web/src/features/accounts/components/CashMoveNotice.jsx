/**
 * CashMoveNotice.jsx — In the income or expense form, for «مدیریت نقدینگی»: money moved between
 * the user's own accounts is a transfer between them («انتقال بین حساب‌ها»), not an income or an
 * expense — one tap carries the amount, day and note over to the transfer form. Recording it as
 * an (excluded) income or expense stays possible, for an account that isn't in the app.
 */

import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { AlertBanner, Button } from '../../../shared/ui/index.js';

/**
 * @param {{ onMove: () => void }} props
 */
export default function CashMoveNotice({ onMove }) {
  return (
    <AlertBanner
      type="info"
      icon={<ArrowLeftRight size={16} />}
      message="جابه‌جایی پول بین حساب‌های خودتان است؟ آن را به‌صورت «انتقال بین حساب‌ها» ثبت کنید تا حساب مبدأ و مقصد مشخص باشد. اگر حساب دیگر در برنامه نیست، همین‌جا (خارج از جمع) ثبت کنید."
      action={<Button type="button" size="sm" variant="secondary" onClick={onMove}>ثبت به‌صورت انتقال</Button>}
    />
  );
}
