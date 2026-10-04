/**
 * FeatureOffer.jsx — Shown in place of a feature the user doesn't have (e.g. the market page,
 * open to the "pro" group): what it gives, and asking to join the group that opens it
 *
 * The groups and the user's pending request come from GET /api/features/:key/access. Once the
 * admin approves, the user's features are read again (AuthContext.refreshAccess — also on
 * returning to the page) and the feature replaces this offer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Crown, Check, Clock, Lock } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useAuth } from '../../features/auth/index.js';
import { getFeatureAccess, requestGroup, cancelGroupRequest } from './featureAccessApi.js';

/**
 * @param {object} props
 * @param {string} props.feature - feature key (config/features.js)
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {string[]} [props.benefits] - what the feature gives
 */
export default function FeatureOffer({ feature, title, subtitle = '', benefits = [] }) {
  const { user, refreshAccess } = useAuth();
  const { toast } = useFeedback();
  const [access, setAccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFeatureAccess(feature);
      setAccess(data);
      setFailed(false);
      // Approved meanwhile: read the user's features again so the feature replaces this offer
      if (data?.enabled) refreshAccess?.();
    } catch {
      setFailed(true);
    }
  }, [feature, refreshAccess]);

  useEffect(() => {
    load();
  }, [load]);

  const group = access?.groups?.find((g) => g.allowRequests) || access?.groups?.[0] || null;
  const isDemo = Boolean(user?.demo);

  const ask = async () => {
    if (!group) return;
    setBusy(true);
    try {
      const res = await requestGroup(group.key);
      toast.success(res?.message || 'درخواست ثبت شد.');
      await load();
    } catch (err) {
      toast.error(err?.message || 'ثبت درخواست ممکن نشد.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!group) return;
    setBusy(true);
    try {
      await cancelGroupRequest(group.key);
      await load();
    } catch (err) {
      toast.error(err?.message || 'لغو درخواست ممکن نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="feature-offer" aria-labelledby={`feature-offer-${feature}`}>
      <span className="feature-offer-icon" aria-hidden="true"><Crown size={28} /></span>
      {group && <span className="feature-offer-badge">{group.name}</span>}
      <h2 id={`feature-offer-${feature}`} className="feature-offer-title">{title}</h2>
      {subtitle && <p className="feature-offer-subtitle">{subtitle}</p>}

      {benefits.length > 0 && (
        <ul className="feature-offer-benefits">
          {benefits.map((b) => (
            <li key={b}><Check size={16} aria-hidden="true" /><span>{b}</span></li>
          ))}
        </ul>
      )}

      <div className="feature-offer-action">
        {!access && !failed && <p className="feature-offer-note">در حال بررسی دسترسی…</p>}
        {failed && (
          <Button variant="secondary" onClick={load}>تلاش دوباره</Button>
        )}
        {access && group?.allowRequests && !group.requested && !isDemo && (
          <Button icon={<Crown size={16} />} onClick={ask} loading={busy}>
            درخواست عضویت در {group.name}
          </Button>
        )}
        {access && group?.requested && (
          <>
            <p className="feature-offer-note is-pending">
              <Clock size={16} aria-hidden="true" />
              <span>درخواست شما ثبت شده است؛ پس از تأیید مدیر این بخش برایتان باز می‌شود.</span>
            </p>
            <Button variant="ghost" size="sm" onClick={cancel} loading={busy}>لغو درخواست</Button>
          </>
        )}
        {access && (!group || (!group.allowRequests && !group.requested)) && (
          <p className="feature-offer-note">
            <Lock size={16} aria-hidden="true" />
            <span>این بخش فعلاً برای حساب شما فعال نیست.</span>
          </p>
        )}
      </div>
    </section>
  );
}
