/**
 * AlertsWidget.jsx — «یادآورها»: the installment, cheque and subscription due dates that are near
 */

import React from 'react';
import AlertStack from '../../../shared/alerts/AlertStack.jsx';

export default function AlertsWidget() {
  return <AlertStack sources={['loan', 'cheque', 'subscription']} />;
}
