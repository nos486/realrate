/**
 * RecordOriginBadge.jsx — A small tag beside a record's title when it was not typed by hand:
 * «ورود خودکار» (a bank SMS or an imported statement), «ثبت سیستمی» (another feature made it) or
 * «وصل به …» (linked to a loan, subscription or cheque). Nothing for a hand-typed record.
 */

import React from 'react';
import { Bot, Link2, Lock } from 'lucide-react';
import { recordOriginOf } from './recordOrigin.js';

const ICONS = { import: Bot, sms: Bot, system: Lock, linked: Link2 };

/** @param {{ record: object }} props an expense or an income */
export default function RecordOriginBadge({ record }) {
  const origin = recordOriginOf(record);
  if (origin.kind === 'manual') return null;
  const Icon = ICONS[origin.kind];
  return (
    <small className={`record-origin-badge is-${origin.kind}`} title={origin.hint}>
      <Icon size={11} aria-hidden="true" />
      {origin.label}
    </small>
  );
}
