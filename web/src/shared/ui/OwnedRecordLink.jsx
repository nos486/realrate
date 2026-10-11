/**
 * OwnedRecordLink.jsx — In the expenses or incomes, in place of edit and delete on a record another
 * feature recorded (a loan's installment, a subscription's payment, a cleared cheque's money:
 * recordOwners.js): which page it belongs to, and a link there — it is changed only from that page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { recordOwnerInfo } from '../../utils/recordOwners.js';
import { appPath } from '../routes.js';

/**
 * @param {{ record: object }} props an expense or an income
 * @returns {React.ReactElement|null} nothing for a record the user owns
 */
export default function OwnedRecordLink({ record }) {
  const owner = recordOwnerInfo(record);
  if (!owner) return null;
  return (
    <Link
      to={appPath(owner.path)}
      className="btn-table-action owned-record-link"
      title={`ثبت خودکار؛ از صفحه‌ی «${owner.label}» تغییر می‌کند`}
      aria-label={`ثبت خودکار از «${owner.label}»`}
    >
      <Lock size={12} strokeWidth={2} />
      <span>{owner.label}</span>
    </Link>
  );
}
