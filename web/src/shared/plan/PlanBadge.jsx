/**
 * PlanBadge.jsx — «رایگان» chip at the top of the site and the app for users on the free plan; it
 * opens the page comparing the plans. Nothing is shown on Pro.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useIsPro, PRO_PATH } from './usePlan.js';
import { appPath } from '../routes.js';

export default function PlanBadge() {
  const pro = useIsPro();
  if (pro) return null;
  return (
    <Link className="plan-badge" to={appPath(PRO_PATH)} title="پلن رایگان؛ مقایسه با Pro" aria-label="پلن رایگان؛ مقایسه با Pro">
      رایگان
    </Link>
  );
}
