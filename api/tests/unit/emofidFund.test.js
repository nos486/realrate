import { describe, it, expect } from 'vitest';
import {
  parseEmofidFundHtml,
  emofidFundSourceAdapter,
  persianToEnglishDigits,
} from '../../src/services/market/sources/emofidFund.source.adapter.js';

describe('emofidFund.source.adapter', () => {
  const sampleNextRscHtml = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><title>صندوق بازنشستگی تکمیلی آتیه مفید</title></head>
<body>
  <div id="root">
    <h1>صندوق آتیه مفید</h1>
  </div>
  <script>
    self.__next_f.push([1,"7:[\\"$\\",\\"div\\",null,{\\"fund\\":{\\"id\\":14,\\"key\\":\\"12217\\",\\"enTitle\\":\\"atieh\\",\\"title\\":\\"آتیه\\",\\"fullTitle\\":\\"صندوق بازنشستگی تکمیلی آتیه\\",\\"cancelNav\\":45022,\\"subscriptionNav\\":45324,\\"aum\\":92674,\\"updatedOn\\":\\"۲۳ شهریور ۱۴۰۵\\"}}]\n"]);
  </script>
</body>
</html>
`;

  const sampleFallbackHtml = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><title>صندوق آتیه</title></head>
<body>
  <div class="card">
    <p class="label">قیمت ابطال</p>
    <div class="value">۴۵٬۰۲۲ ریال</div>
  </div>
  <div class="card">
    <p class="label">قیمت صدور</p>
    <div class="value">۴۵٬۳۲۴ ریال</div>
  </div>
</body>
</html>
`;

  it('should support emofid fund URLs and sourceType', () => {
    expect(emofidFundSourceAdapter.supports({ sourceType: 'emofid_fund' })).toBe(true);
    expect(emofidFundSourceAdapter.supports({ endpoint: 'https://www.emofid.com/funds/atieh/' })).toBe(true);
    expect(emofidFundSourceAdapter.supports({ endpoint: 'https://api.gold-api.com/price/XAU' })).toBe(false);
  });

  it('should correctly parse Next.js streaming RSC payload and convert Rials to Tomans by default', () => {
    const result = parseEmofidFundHtml(sampleNextRscHtml, {
      name: 'صندوق آتیه مفید',
      endpoint: 'https://www.emofid.com/funds/atieh/',
    });

    expect(result).toBeDefined();
    // Default unit is Toman (45022 Rial / 10 = 4502 Toman)
    expect(result.price).toBe(4502);
    expect(result.priceToman).toBe(4502);
    expect(result.priceRial).toBe(45022);
    expect(result.subscriptionPriceToman).toBe(4532);
    expect(result.subscriptionPriceRial).toBe(45324);
    expect(result.unit).toBe('تومان');
    expect(result.updatedOn).toBe('۲۳ شهریور ۱۴۰۵');
    expect(result.label).toBe('صندوق آتیه مفید');

    expect(result.multiData).toBeDefined();
    expect(result.multiData.cancelNavRial).toBe(45022);
    expect(result.multiData.cancelNavToman).toBe(4502);
    expect(result.multiData.subscriptionNavRial).toBe(45324);
  });

  it('should preserve Rial pricing if priceUnit is set to rial', () => {
    const result = parseEmofidFundHtml(sampleNextRscHtml, {
      priceUnit: 'rial',
      name: 'صندوق آتیه مفید',
    });

    expect(result.price).toBe(45022);
    expect(result.priceRial).toBe(45022);
    expect(result.priceToman).toBe(4502);
    expect(result.unit).toBe('ریال');
    expect(result.multiData.unit).toBe('ریال');
  });

  it('should fallback to rendered HTML markup with Persian numerals if RSC payload is missing', () => {
    const result = parseEmofidFundHtml(sampleFallbackHtml, {
      name: 'صندوق آتیه مفید',
    });

    expect(result).toBeDefined();
    expect(result.price).toBe(4502);
    expect(result.priceRial).toBe(45022);
    expect(result.subscriptionPriceRial).toBe(45324);
    expect(result.subscriptionPriceToman).toBe(4532);
  });

  it('should correctly convert Persian and Arabic digits to English digits', () => {
    expect(persianToEnglishDigits('۴۵٬۰۲۲')).toBe('45٬022');
    expect(persianToEnglishDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
    expect(persianToEnglishDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
  });

  it('should throw clear error when content is empty or NAV cannot be extracted', () => {
    expect(() => parseEmofidFundHtml('')).toThrow('محتوای صفحه صندوق مفید خالی است.');
    expect(() => parseEmofidFundHtml('<html><body>No pricing here</body></html>')).toThrow(
      'امکان استخراج قیمت ابطال (NAV) از صفحه صندوق آتیه مفید وجود ندارد'
    );
  });
});
