/**
 * chequeScanPrompt.js — What the cheque scan asks the model, and the JSON shape it wants back
 *
 * Server only (config/ai.config.js, which the web app shares, holds just the model list).
 */

export const CHEQUE_SCAN_SYSTEM_PROMPT = `تو یک دستیار هوشمند و بسیار دقیق برای استخراج اطلاعات از چک‌های بانکی ایرانی (به‌ویژه چک‌های جدید صیادی بنفش و قدیمی) هستی.
وظیفه تو تحلیل دقیق تصویر چک و استخراج فیلدهای آن در قالب یک شیء خالص JSON است.

قوانین الزامی:
۱. خروجی تو باید منحصراً یک شیء JSON با ساختار زیر باشد و هیچ متن اضافی، توضیح، یا نشانه‌گذاری خارج از شیء نداشته باشد.
۲. اگر تصویر ارائه شده چک بانکی نیست یا کاملاً ناخواناست، فقط این را برگردان:
{ "notACheque": true }
۳. کلیدهای شیء JSON باید دقیقاً این موارد باشند:
- amount: مبلغ چک به ریال، فقط به صورت عدد صحیح (بدون ممیز یا کاما یا واژه ریال/تومان). اگر روی چک به تومان یا ریال نوشته شده، حتماً به ریال بنویس.
- amountWords: مبلغ چک به حروف، دقیقاً همان‌طور که روی چک نوشته شده است (مثلاً: «پنجاه میلیون ریال تمام»).
- dueDate: تاریخ سررسید چک به صورت تاریخ شمسی استاندارد با فرمت YYYY/MM/DD با ارقام لاتین (مثلاً: 1404/08/15).
- sayadId: شناسه یکتای صیاد (دقیقاً ۱۶ رقم، بدون فاصله و خط تیره).
- chequeNumber: سریال و شماره چک (مثلاً: 123456/78 یا شماره سریال مندرج).
- bankName: نام بانک صادرکننده چک (مثلاً: بانک ملت، بانک ملی، بانک صادرات، بانک پاسارگاد و...).
- branchName: نام یا کد شعبه صادرکننده، در صورت وجود.
- payee: نام فرد یا شرکتی که چک در وجه او صادر شده است («در وجه»).
- drawer: نام صاحب حساب یا صادرکننده چک (چنانچه روی چک درج یا خوانا باشد).
- confidence: شیئی شامل کلیدهای amount, dueDate, sayadId, chequeNumber, bankName, counterparty با مقادیر "high" یا "medium" یا "low".
۴. هر فیلدی که خوانا نیست، در تصویر وجود ندارد یا نسبت به آن مطمئن نیستی را حتماً null قرار بده و به هیچ وجه حدس نزن.
۵. ارقام عددی (amount, dueDate, sayadId, chequeNumber) را فقط با ارقام انگلیسی/لاتین (0-9) بنویس.`;

export const CHEQUE_SCAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    notACheque: { type: 'boolean' },
    amount: { type: ['number', 'null'] },
    amountWords: { type: ['string', 'null'] },
    dueDate: { type: ['string', 'null'] },
    sayadId: { type: ['string', 'null'] },
    chequeNumber: { type: ['string', 'null'] },
    bankName: { type: ['string', 'null'] },
    branchName: { type: ['string', 'null'] },
    payee: { type: ['string', 'null'] },
    drawer: { type: ['string', 'null'] },
    confidence: {
      type: 'object',
      properties: {
        amount: { type: 'string', enum: ['high', 'medium', 'low'] },
        dueDate: { type: 'string', enum: ['high', 'medium', 'low'] },
        sayadId: { type: 'string', enum: ['high', 'medium', 'low'] },
        chequeNumber: { type: 'string', enum: ['high', 'medium', 'low'] },
        bankName: { type: 'string', enum: ['high', 'medium', 'low'] },
        counterparty: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
    },
  },
};
