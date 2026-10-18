/**
 * AlertsWidget.jsx — «یادآورها»: the installment, cheque and subscription due dates that are near
 */

import React from 'react';
import AlertStack from '../../../shared/alerts/AlertStack.jsx';
import DashScroll from '../DashScroll.jsx';

export default function AlertsWidget() {
  return <DashScroll><AlertStack sources={['loan', 'cheque', 'subscription']} /></DashScroll>;
}
