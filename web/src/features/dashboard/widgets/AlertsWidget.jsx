/**
 * AlertsWidget.jsx — «یادآورها»: the installment, cheque and subscription due dates that are
 * near; the `sources` setting chooses which of the three show
 */

import React from 'react';
import AlertStack from '../../../shared/alerts/AlertStack.jsx';
import DashScroll from '../DashScroll.jsx';

export default function AlertsWidget({ widget }) {
  return <DashScroll><AlertStack sources={widget.config?.sources || ['loan', 'cheque', 'subscription']} /></DashScroll>;
}
