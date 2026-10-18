/**
 * GoalsWidget.jsx — «اهداف پس‌انداز»: the nearest unfinished goals (the goals home card)
 */

import React from 'react';
import GoalsHomeCard from '../../goals/components/GoalsHomeCard.jsx';
import { useDashboardData } from '../DashboardContext.js';

export default function GoalsWidget() {
  const { open } = useDashboardData();
  return <GoalsHomeCard onOpen={open} />;
}
