import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const TICKER_ITEMS = [
  { id: 'usd', name: 'دلار آزاد', price: '۶۲٬۴۵۰', unit: 'تومان', change: '+۰.۴٪', isUp: true },
  { id: 'gold18', name: 'طلای ۱۸ عیار', price: '۴٬۷۵۰٬۰۰۰', unit: 'تومان/گرم', change: '+۱.۲٪', isUp: true },
  { id: 'emami', name: 'سکه تمام طرح جدید', price: '۵۴٬۲۰۰٬۰۰۰', unit: 'تومان', change: '-۰.۶٪', isUp: false },
  { id: 'ounce', name: 'انس جهانی طلا', price: '۲٬۶۵۸.۴', unit: 'دلار', change: '+۰.۳٪', isUp: true },
  { id: 'usdt', name: 'تتر (USDT)', price: '۶۲٬۸۰۰', unit: 'تومان', change: '+۰.۵٪', isUp: true },
  { id: 'eur', name: 'یورو', price: '۶۸٬۱۰۰', unit: 'تومان', change: '+۰.۲٪', isUp: true },
  { id: 'aed', name: 'درهم امارات', price: '۱۷٬۰۵۰', unit: 'تومان', change: '+۰.۱٪', isUp: true },
  { id: 'ayar', name: 'صندوق طلای عیار', price: '۱۸٬۹۲۰', unit: 'تومان', change: '+۱.۴٪', isUp: true },
  { id: 'bourse', name: 'شاخص کل بورس', price: '۲٬۱۸۰٬۵۰۰', unit: 'واحد', change: '+۰.۸٪', isUp: true },
  { id: 'bahar', name: 'سکه بهار آزادی', price: '۴۸٬۵۰۰٬۰۰۰', unit: 'تومان', change: '-۰.۳٪', isUp: false },
];

export default function LandingLiveTicker() {
  // Double list to create a seamless infinite loop
  const duplicatedItems = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div className="landing-ticker-strip-wrap" aria-label="نوار نرخ‌های زنده بازار">
      <div className="landing-ticker-label">
        <span className="ticker-pulse-beacon"></span>
        <span className="ticker-title">نرخ زنده:</span>
      </div>

      <div className="landing-ticker-track">
        <div className="landing-ticker-marquee">
          {duplicatedItems.map((item, idx) => (
            <div className="ticker-capsule" key={`${item.id}-${idx}`}>
              <span className="capsule-name">{item.name}</span>
              <strong className="capsule-price">
                {item.price} <span className="capsule-unit">{item.unit}</span>
              </strong>
              <span className={`capsule-change ${item.isUp ? 'is-up' : 'is-down'}`}>
                {item.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span>{item.change}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
