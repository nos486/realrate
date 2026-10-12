/**
 * ProPage.jsx — Free and Pro side by side (/pro)
 *
 * Where the «Pro» button and every free-plan limit lead. Pro is given by the admin: a free user
 * asks to join the Pro group here (FeatureOffer's request flow) and the admin approves.
 */

import React from 'react';
import { Crown, Check, Lock } from 'lucide-react';
import FeaturePageHeader from '../../shared/ui/FeaturePageHeader.jsx';
import FeatureOffer from '../../shared/features/FeatureOffer.jsx';
import { useAuth } from '../auth/index.js';
import { useIsPro } from '../../shared/plan/usePlan.js';
import { PLAN_COMPARISON } from '../../config/planLimits.js';

export default function ProPage() {
  const pro = useIsPro();
  const { user } = useAuth() || {};
  return (
    <div className="pro-page">
      <FeaturePageHeader
        icon={<Crown size={22} />}
        title="پلن رایگان و Pro"
        subtitle={pro ? (user?.isAdmin ? 'حساب مدیر هیچ محدودیتی ندارد؛ برای دیدن سقف‌ها با یک حساب کاربر عادی وارد شوید.' : 'حساب شما Pro است و محدودیتی ندارید.') : 'پلن رایگان برای شروع است؛ Pro همه‌ی بخش‌ها را بدون سقف باز می‌کند.'}
      />

      <div className="pro-compare" role="table" aria-label="مقایسه‌ی پلن رایگان و Pro">
        <div className="pro-compare-row is-head" role="row">
          <span role="columnheader">امکان</span>
          <span role="columnheader">رایگان</span>
          <span role="columnheader" className="is-pro"><Crown size={14} aria-hidden="true" /> Pro</span>
        </div>
        {PLAN_COMPARISON.map((row) => (
          <div className="pro-compare-row" role="row" key={row.label}>
            <span role="rowheader" className="pro-compare-label">{row.label}</span>
            <span role="cell" className={`pro-compare-free${row.free === 'بسته' ? ' is-closed' : ''}`}>
              {row.free === 'بسته' && <Lock size={13} aria-hidden="true" />}
              {row.free}
            </span>
            <span role="cell" className="pro-compare-pro"><Check size={14} aria-hidden="true" />{row.pro}</span>
          </div>
        ))}
      </div>

      {!pro && (
        <FeatureOffer
          feature="reports"
          title="Pro شوید"
          subtitle="درخواست شما به مدیر می‌رسد و پس از تأیید، حساب شما Pro می‌شود."
        />
      )}
    </div>
  );
}
