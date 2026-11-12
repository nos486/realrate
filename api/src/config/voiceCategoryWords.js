/**
 * voiceCategoryWords.js — Words that tell a built-in category from what the user says about a bank SMS
 *
 * The quick voice note on a bank message is only transcribed (Whisper); no language model reads it.
 * The title is the words said, and the category is found here: for each built-in category key, the
 * words and phrases (Persian, plus the Latin spellings and the Persian spellings of English words that
 * a speech model writes) that name it. domain/voiceCategory.js matches them; to teach the app a new
 * word, add it to its category's list. A category the user does not have (hidden or removed) is
 * skipped, and the user's own categories are matched by their names first.
 *
 * Keep entries lowercase and plain: the matcher normalizes letters (ی ک ه), drops the half-space and
 * accepts the usual endings (ها، ی، ای…). A phrase of several words beats a single word.
 * The order of the keys is the tie-breaker: the more specific category comes first.
 */

/** Category key → words, for an expense */
export const EXPENSE_WORDS = {
  dining: [
    'پیتزا', 'برگر', 'همبرگر', 'ساندویچ', 'ساندویچی', 'کباب', 'کبابی', 'جوجه', 'چلوکباب', 'چلو کباب', 'دنر', 'فست فود', 'فستفود',
    'کافه', 'کافی شاپ', 'کافیشاپ', 'قهوه', 'اسپرسو', 'لاته', 'نسکافه', 'چای', 'قنادی', 'بستنی', 'بستنی فروشی', 'آبمیوه', 'آب میوه',
    'رستوران', 'ناهار', 'شام', 'صبحانه', 'میان وعده', 'غذا', 'ناهارخوری', 'اسنپ فود', 'اسنپفود', 'دلینو', 'ریحون', 'کترینگ', 'دیزی', 'آبگوشت', 'سوشی', 'استیک',
    'pizza', 'burger', 'sandwich', 'kebab', 'coffee', 'cafe', 'espresso', 'latte', 'tea', 'restaurant', 'lunch', 'dinner', 'breakfast', 'snack', 'ice cream', 'food', 'fast food', 'starbucks',
  ],
  groceries: [
    'نان', 'نانوایی', 'سنگک', 'بربری', 'لواش', 'میوه', 'سبزی', 'سبزیجات', 'تره بار', 'ترهبار', 'خواربار', 'سوپرمارکت', 'سوپر', 'سوپری', 'هایپر', 'هایپرمارکت', 'فروشگاه شهروند', 'بقالی',
    'برنج', 'گوشت', 'مرغ', 'ماهی', 'قصابی', 'تخم مرغ', 'لبنیات', 'شیر', 'ماست', 'پنیر', 'کره', 'روغن', 'شکر', 'قند', 'حبوبات', 'خشکبار', 'آجیل', 'شیرینی', 'رب', 'ماکارونی', 'چای خشک', 'خوراکی', 'نوشابه',
    'bread', 'fruit', 'vegetables', 'meat', 'chicken', 'fish', 'milk', 'cheese', 'rice', 'eggs', 'grocery', 'groceries', 'supermarket', 'bakery',
  ],
  transport: [
    'بنزین', 'گازوئیل', 'سوخت', 'سی ان جی', 'تاکسی', 'اسنپ', 'تپسی', 'آژانس', 'مترو', 'اتوبوس', 'بی آر تی', 'کرایه', 'کرایه تاکسی', 'عوارض', 'عوارضی', 'آزادراه', 'پارکینگ',
    'کارواش', 'تعمیرگاه', 'مکانیکی', 'لاستیک', 'باتری ماشین', 'تعویض روغن', 'روغن موتور', 'جریمه رانندگی', 'دوچرخه', 'اسکوتر', 'ماشین', 'خودرو', 'موتور',
    'gas', 'petrol', 'fuel', 'taxi', 'uber', 'metro', 'bus', 'parking', 'toll', 'car wash', 'tire', 'tyre', 'car',
  ],
  bills: [
    'قبض', 'قبض برق', 'قبض گاز', 'قبض آب', 'قبض تلفن', 'قبض موبایل', 'برق', 'گاز', 'آب و فاضلاب', 'فاضلاب', 'شارژ ساختمان', 'شارژ', 'شارژ سیم کارت', 'شارژ موبایل', 'شارژ ایرانسل', 'شارژ همراه اول',
    'ایرانسل', 'همراه اول', 'رایتل', 'تلفن', 'تلفن همراه', 'مالیات', 'عوارض شهرداری', 'بیمه', 'بیمه ماشین', 'بیمه شخص ثالث', 'بیمه بدنه',
    'bill', 'bills', 'electricity', 'water bill', 'gas bill', 'phone bill', 'utilities', 'tax', 'insurance',
  ],
  housing: [
    'اجاره', 'اجاره خانه', 'اجاره‌بها', 'رهن', 'ودیعه', 'مسکن', 'تعمیرات منزل', 'تعمیرات خانه', 'لوله‌کشی', 'برقکار', 'نقاش', 'نقاشی ساختمان', 'کابینت', 'مبل',
    'rent', 'mortgage', 'housing', 'plumber', 'electrician', 'furniture',
  ],
  shopping: [
    'لباس', 'پوشاک', 'کفش', 'کیف', 'شلوار', 'پیراهن', 'کت', 'مانتو', 'شال', 'روسری', 'جوراب', 'ساعت', 'عینک آفتابی', 'عطر', 'لوازم آرایشی', 'آرایشی', 'لوازم خانگی', 'ظرف', 'فرش',
    'دیجی کالا', 'دیجیکالا', 'گوشی', 'موبایل', 'لپ تاپ', 'لپتاپ', 'هدفون', 'کابل', 'شارژر', 'کیس کامپیوتر', 'تبلت', 'کنسول', 'اسباب بازی',
    'clothes', 'shoes', 'shirt', 'dress', 'bag', 'watch', 'laptop', 'phone', 'headphones', 'shopping', 'amazon', 'digikala',
  ],
  health: [
    'دارو', 'داروخانه', 'دکتر', 'پزشک', 'مطب', 'ویزیت', 'درمان', 'درمانگاه', 'بیمارستان', 'آزمایش', 'آزمایشگاه', 'دندانپزشک', 'دندان', 'فیزیوتراپی', 'عینک طبی', 'عینک', 'بیمه تکمیلی', 'سونوگرافی', 'رادیولوژی', 'روانشناس', 'مشاوره پزشکی', 'ماساژ',
    'pharmacy', 'doctor', 'medicine', 'dentist', 'hospital', 'clinic', 'lab test', 'health', 'therapy',
  ],
  education: [
    'کلاس', 'آموزشگاه', 'آموزش', 'دوره', 'کورس', 'ترم', 'شهریه', 'دانشگاه', 'مدرسه', 'کنکور', 'کتاب', 'کتابفروشی', 'دفتر', 'خودکار', 'لوازم تحریر', 'تحریر', 'زبان', 'کلاس زبان', 'آیلتس', 'کلاس خصوصی',
    'course', 'tuition', 'class', 'school', 'university', 'lesson', 'book', 'stationery', 'udemy', 'ielts',
  ],
  entertainment: [
    'سینما', 'فیلم', 'تئاتر', 'کنسرت', 'بلیط', 'بلیت', 'تفریح', 'گردش', 'سفر', 'مسافرت', 'هتل', 'اقامتگاه', 'ویلا', 'پرواز', 'بلیط هواپیما', 'بلیط قطار', 'قطار', 'تور', 'بازی', 'گیم', 'پلی استیشن', 'استخر', 'باشگاه', 'ورزش', 'سالن ورزشی', 'بولینگ', 'پینت بال', 'شهربازی', 'کوهنوردی', 'کمپ',
    'cinema', 'movie', 'theatre', 'theater', 'concert', 'ticket', 'hotel', 'flight', 'trip', 'travel', 'vacation', 'game', 'gym', 'pool', 'sport',
  ],
  subscriptions: [
    'اینترنت', 'اشتراک', 'نتفلیکس', 'اسپاتیفای', 'یوتیوب', 'یوتیوب پریمیوم', 'فیلیمو', 'نماوا', 'فیلم نت', 'ویپیان', 'وی پی ان', 'vpn', 'دامنه', 'هاست', 'سرور', 'آیکلود', 'چت جی پی تی', 'ای دی اس ال', 'مودم', 'ایرانسل دیتا', 'بسته اینترنت', 'بسته اینترنتی',
    'subscription', 'netflix', 'spotify', 'youtube', 'internet', 'hosting', 'domain', 'server', 'icloud', 'chatgpt', 'apple music', 'adsl',
  ],
  gifts: [
    'هدیه', 'کادو', 'عیدی', 'خیریه', 'صدقه', 'کمک مالی', 'نذر', 'نذری', 'اهدا', 'انعام', 'تولد', 'کادوی تولد', 'گل', 'گل فروشی',
    'gift', 'present', 'charity', 'donation', 'tip', 'flowers',
  ],
  installments: [
    'قسط', 'اقساط', 'قسط وام', 'قسط گوشی', 'قسط ماشین', 'قسط خانه', 'پرداخت قسط', 'قسط کارت', 'قسط بانک',
    'installment', 'installments', 'loan payment', 'emi',
  ],
  credit_fees: [
    'کارمزد', 'کارمزد بانک', 'کارمزد بانکی', 'کارمزد کارت', 'کارمزد انتقال', 'جریمه دیرکرد', 'دیرکرد', 'سود اعتبار', 'سود وام', 'هزینه نگهداری کارت', 'کارمزد خدمات',
    'bank fee', 'fee', 'fees', 'interest', 'late fee', 'commission',
  ],
  running_costs: [
    'خشکشویی', 'خشک شویی', 'رختشویی', 'آرایشگاه', 'سلمانی', 'اصلاح', 'کوتاهی مو', 'ناخن', 'نظافت', 'نظافتچی', 'کارگر', 'پیک', 'پیک موتوری', 'تیپاکس', 'پست', 'پست پیشتاز', 'ارسال', 'حمل', 'باربری', 'کپی', 'پرینت', 'هزینه جاری', 'هزینه های جاری',
    'barber', 'haircut', 'laundry', 'cleaning', 'courier', 'shipping', 'postage', 'delivery', 'tipax',
  ],
  investment: [
    'سرمایه گذاری', 'خرید طلا', 'خرید سکه', 'خرید سهام', 'خرید ارز', 'خرید دلار', 'خرید یورو', 'خرید ارز دیجیتال', 'سکه', 'سهام', 'بورس', 'صندوق', 'صندوق سرمایه گذاری', 'بیت کوین', 'بیتکوین', 'رمزارز', 'کریپتو', 'اتریوم', 'تتر', 'پس انداز',
    'invest', 'investment', 'stock', 'stocks', 'crypto', 'bitcoin', 'gold', 'fund', 'savings',
  ],
};

/** Category key → words, for an income */
export const INCOME_WORDS = {
  salary: [
    'حقوق', 'حقوق ماهانه', 'حقوق ماه', 'فیش حقوقی', 'دستمزد ماهانه', 'حقوق و دستمزد',
    'salary', 'payroll', 'paycheck', 'wage', 'wages',
  ],
  bonus: [
    'پاداش', 'عیدی', 'جایزه', 'کارانه', 'پورسانت', 'پاداش پایان سال', 'اضافه کار',
    'bonus', 'reward', 'prize', 'overtime',
  ],
  benefits: [
    'مزایا', 'بن', 'بن کارت', 'بن خرید', 'کمک هزینه', 'حق مسکن', 'حق اولاد', 'حق عائله مندی', 'سنوات', 'بازخرید', 'بازخرید مرخصی', 'ایاب و ذهاب', 'حق خوار و بار',
    'benefits', 'allowance', 'stipend', 'severance',
  ],
  freelance: [
    'پروژه', 'فریلنس', 'فریلنسر', 'کار آزاد', 'دستمزد پروژه', 'طراحی', 'برنامه نویسی', 'سایت', 'ترجمه', 'مشاوره', 'تدریس', 'تدریس خصوصی', 'کلاس خصوصی', 'اجرا', 'قرارداد',
    'freelance', 'project', 'consulting', 'contract', 'gig', 'design', 'tutoring',
  ],
  business: [
    'فروش', 'فروش محصول', 'فروش کالا', 'مشتری', 'فاکتور', 'کسب و کار', 'کسب‌وکار', 'کسبوکار', 'مغازه', 'فروشگاه', 'درآمد فروشگاه', 'بیزینس', 'سود فروش', 'ارائه خدمات',
    'sales', 'sale', 'customer', 'business', 'revenue', 'invoice', 'client',
  ],
  investment: [
    'سود', 'سود سپرده', 'سود بانکی', 'سود سهام', 'سود سرمایه گذاری', 'سود صندوق', 'سود اوراق', 'بهره', 'کوپن', 'سپرده',
    'interest', 'dividend', 'profit', 'returns', 'yield',
  ],
  rental: [
    'اجاره', 'اجاره خانه', 'اجاره‌بها', 'اجاره ملک', 'اجاره مغازه', 'اجاره ماشین', 'کرایه', 'اجاره‌داری',
    'rent', 'rental', 'tenant',
  ],
  asset_sale: [
    'فروش ماشین', 'فروش خودرو', 'فروش موتور', 'فروش خانه', 'فروش آپارتمان', 'فروش زمین', 'فروش ملک', 'فروش طلا', 'فروش سکه', 'فروش ارز', 'فروش دلار', 'فروش سهام', 'فروش لپ تاپ', 'فروش گوشی', 'فروش موبایل', 'فروش وسایل', 'فروش لوازم', 'دست دوم', 'فروش دارایی',
    'sold car', 'sold house', 'sold laptop', 'sold phone', 'second hand', 'used sale', 'asset sale',
  ],
  credit_settlement: [
    'تسویه اعتباری', 'تسویه بدهی اعتباری', 'تسویه کارت اعتباری', 'تسویه کارت', 'بازپرداخت اعتباری',
    'credit settlement', 'settle credit',
  ],
  loan_received: [
    'وام', 'دریافت وام', 'وام بانکی', 'قرض', 'قرض گرفتم', 'قرض الحسنه', 'تسهیلات',
    'loan', 'borrowed', 'borrow',
  ],
  gift: [
    'هدیه', 'کادو', 'هدیه نقدی', 'کمک', 'کمک مالی', 'ارث', 'ارثیه', 'هبه', 'شب یلدا', 'عیدی از',
    'gift', 'present', 'donation', 'inheritance',
  ],
  small_income: [
    'درآمد خرد', 'خرد', 'پول خرد', 'پول توجیبی', 'پول تو جیبی', 'انعام', 'برگشت پول', 'عودت', 'بازگشت وجه', 'ریفاند', 'کش بک', 'کشبک',
    'tip', 'pocket money', 'refund', 'cashback', 'cash back',
  ],
};

/**
 * What else a note can ask for (api/src/domain/smsVoice.js SMS_VOICE_ACTIONS), as words. Only the
 * actions the app offered for the message are considered; `project` also needs the name of one of the
 * user's projects (matched in domain/voiceCategory.js), and the words here only say "it is a project".
 */
export const ACTION_WORDS = {
  transfer: ['انتقال', 'انتقال بین حساب', 'انتقال بین حساب هام', 'جابجایی', 'جابه جایی', 'جابه‌جایی', 'بین حساب', 'بین حساب هام', 'حساب خودم', 'حساب های خودم', 'کارت به کارت خودم', 'transfer', 'between accounts', 'my accounts'],
  project: ['پروژه', 'برای پروژه', 'project', 'for project'],
  loan: ['وام', 'واریز وام', 'دریافت وام', 'قرض', 'تسهیلات', 'loan', 'borrowed', 'borrow'],
  share: ['سهم', 'سهم دوست', 'سهم دوستم', 'سهم همکار', 'سهم همکارم', 'سهم من', 'سهم او', 'سهم شخص', 'share', 'my friend share', 'split'],
  credit_settle: ['تسویه', 'تسویه اعتباری', 'تسویه کارت اعتباری', 'بدهی کارت', 'بدهی اعتباری', 'پرداخت اعتباری', 'پرداخت کارت اعتباری', 'کارت اعتباری', 'اعتبار', 'credit card', 'credit settle', 'pay off credit'],
};

/**
 * Words that say nothing about a category: ignored when a category's own name is matched against the
 * note (a name like «هزینه‌های جاری» or «خرید و پوشاک» must not take every "هزینه" or "خرید")
 */
export const LABEL_STOP_WORDS = [
  'و', 'یا', 'از', 'به', 'در', 'برای', 'با', 'هزینه', 'هزینه ها', 'هزینه های', 'درآمد', 'درآمدها', 'پرداخت', 'خرید', 'سایر', 'متفرقه', 'عمومی', 'کلی', 'جاری', 'مورد',
  'and', 'or', 'the', 'of', 'for', 'to', 'in', 'other', 'misc', 'general', 'expense', 'expenses', 'income', 'payment', 'purchase',
];
