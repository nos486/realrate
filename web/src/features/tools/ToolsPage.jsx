/**
 * ToolsPage.jsx — «ابزارها» (/tools): the calculation tools in one place — loan and deposit, gold
 * with wage and tax, currency and gold converter, dowry (mahr), salary / tax / insurance / bonus,
 * and rent ⇄ deposit
 *
 * A row of tiles picks the tool (kept in the URL: `?t=gold`, so a link opens the same tool); each
 * tool is a small form whose result updates as you type. Live rates come from the price book
 * (PricingContext); nothing typed here is saved or sent anywhere.
 */

import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calculator, Landmark, Coins, ArrowLeftRight, HeartHandshake, BadgeDollarSign, KeyRound } from 'lucide-react';
import { t } from '../../utils/i18n.js';
import { Card, FeaturePageHeader } from '../../shared/ui/index.js';

const LoanDepositTool = lazy(() => import('./LoanDepositTool.jsx'));
const GoldTool = lazy(() => import('./GoldTool.jsx'));
const ConvertTool = lazy(() => import('./ConvertTool.jsx'));
const MahrTool = lazy(() => import('./MahrTool.jsx'));
const SalaryTool = lazy(() => import('./SalaryTool.jsx'));
const RentTool = lazy(() => import('./RentTool.jsx'));

/** The tools, in the order of the tiles; a new tool is one row */
export const TOOLS = [
  { key: 'loan', title: t('وام و سود سپرده'), hint: t('قسط، کارمزد، سود واقعی بعد از تورم'), Icon: Landmark, Component: LoanDepositTool },
  { key: 'gold', title: t('قیمت طلا و حباب سکه'), hint: t('اجرت، سود فروشنده و مالیات'), Icon: Coins, Component: GoldTool },
  { key: 'convert', title: t('تبدیل ارز و طلا'), hint: t('دلار، یورو، طلا و سکه به هم'), Icon: ArrowLeftRight, Component: ConvertTool },
  { key: 'mahr', title: t('مهریه به نرخ روز'), hint: t('تعدیل با تورم یا به سکه'), Icon: HeartHandshake, Component: MahrTool },
  { key: 'salary', title: t('حقوق، مالیات و بیمه'), hint: t('عیدی و سنوات هم دارد'), Icon: BadgeDollarSign, Component: SalaryTool },
  { key: 'rent', title: t('رهن و اجاره'), hint: t('تبدیل ودیعه به اجاره و برعکس'), Icon: KeyRound, Component: RentTool },
];

export default function ToolsPage() {
  const [params, setParams] = useSearchParams();
  const active = TOOLS.find((tool) => tool.key === params.get('t')) || TOOLS[0];
  const { Component } = active;

  return (
    <div className="tools-page">
      <FeaturePageHeader
        icon={<Calculator size={24} />}
        title={t('ابزارها')}
        help="tools"
        subtitle={t('ماشین‌حساب‌های وام، طلا، مهریه، حقوق و رهن و اجاره با نرخ‌های زنده')}
      />
      <div className="tool-tiles" role="tablist" aria-label={t('ابزارها')}>
        {TOOLS.map(({ key, title, hint, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === active.key}
            className={`tool-tile${key === active.key ? ' is-active' : ''}`}
            onClick={() => setParams({ t: key }, { replace: true })}
          >
            <Icon size={20} strokeWidth={2} aria-hidden="true" />
            <span className="tool-tile-title">{title}</span>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      <Card as="section" title={active.title} className="tool-card">
        <Suspense fallback={null}>
          <div className="tool-body" key={active.key}><Component /></div>
        </Suspense>
      </Card>
    </div>
  );
}
