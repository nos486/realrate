/**
 * English for the Worker's replies that carry values inside the text ("at least 8 characters").
 * The Worker answers in Persian with the values filled in; `tMessage` (utils/i18n.js) matches them against
 * these `{placeholder}` entries on the client. `{n}` and the other count-like names match one number,
 * any other placeholder may span several words.
 */
export default {
  'رمز عبور باید حداقل {n} کاراکتر باشد.': 'The password must be at least {n} characters.',
  'عنوان درآمد نباید بیشتر از {n} کاراکتر باشد.': 'The income title must not exceed {n} characters.',
  'یادداشت نباید بیشتر از {n} کاراکتر باشد.': 'The note must not exceed {n} characters.',
  'پورتفوی «{name}» با موفقیت ساخته شد.': 'Portfolio “{name}” was created.',
  'نام بانک حداکثر {n} کاراکتر است.': 'A bank name can have at most {n} characters.',
  'حداکثر {n} بانک سفارشی می‌توانید ثبت کنید.': 'You can add at most {n} custom banks.',
  'در هر درخواست حداکثر {n} مورد ذخیره می‌شود.': 'At most {n} items are saved per request.',
  'در هر درخواست حداکثر {n} مورد حذف می‌شود.': 'At most {n} items are deleted per request.',
  '{label} در پلن رایگان بسته است. برای استفاده به Pro ارتقا دهید.': '{label} is not available on the free plan. Upgrade to Pro to use it.',
  'پلن رایگان فقط {n} {label} در ماه را اجازه می‌دهد. برای ادامه به Pro ارتقا دهید.': 'The free plan allows only {n} {label} per month. Upgrade to Pro to continue.',
  'پلن رایگان فقط {n} {label} را اجازه می‌دهد. برای ادامه به Pro ارتقا دهید.': 'The free plan allows only {n} {label}. Upgrade to Pro to continue.',
  '«{label}» برای حساب شما فعال نیست.': '“{label}” is not enabled for your account.',
  'سقف روزانه «{label}» ({n} {unit}) تمام شده است. فردا دوباره امتحان کنید.': 'The daily limit for “{label}” ({n} {unit}) is used up. Try again tomorrow.',
  'بار': 'times',
  'شماره قسط سفارشی‌سازی‌شده ({n}) خارج از بازه معتبر است.': 'The custom installment number ({n}) is out of range.',
  'مبلغ سفارشی‌سازی‌شده برای قسط {n} باید عددی بزرگتر از صفر باشد.': 'The custom amount for installment {n} must be a number greater than zero.',
  'قسط {n} قبلاً پرداخت شده و قابل ویرایش نیست.': 'Installment {n} is already paid and cannot be edited.',
  'تعداد اقساط جدید ({n}) نمی‌تواند از تعداد اقساط پرداخت‌شده ({paid}) کمتر باشد.': 'The new number of installments ({n}) cannot be less than the number already paid ({paid}).',
  'مبلغ اصل وام جدید نمی‌تواند کمتر از مبلغ اصلِ قبلاً پرداخت‌شده ({amount} تومان) باشد.': 'The new loan principal cannot be less than the principal already paid ({amount} toman).',
  'سرویس هوش مصنوعی گوگل شلوغ است ({reason})': 'Google’s AI service is busy ({reason})',
  'سرویس هوش مصنوعی گوگل الان شلوغ است؛ چند دقیقه دیگر دوباره امتحان کنید.': 'Google’s AI service is busy right now; try again in a few minutes.',
  'پردازش تصویر ناموفق بود ({reason})': 'Image processing failed ({reason})',
  'پردازش تصویر ناموفق بود.': 'Image processing failed.',
  'پاسخی برنگشت ({reason}).': 'No response came back ({reason}).',
};
