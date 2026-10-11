import React from 'react';
import HelpButton from '../help/HelpButton.jsx';

/**
 * FeaturePageHeader — Icon + title + subtitle + actions bar shared by every
 * top-level feature page (Portfolio, Transactions, Loans, Incomes), so they
 * all open with the same visual header instead of four near-identical copies.
 * `help` names the page's help (shared/help/pageHelp.js): a «?» beside the title.
 */
export default function FeaturePageHeader({ icon, title, subtitle, actions = null, help = '' }) {
  return (
    <div className="feature-page-header-bar">
      <div className="feature-page-header-title-wrap">
        <div className="feature-page-header-icon">{icon}</div>
        <div>
          <h1 className="feature-page-title">{title}{help && <HelpButton page={help} />}</h1>
          {subtitle && <p className="feature-page-subtitle">{subtitle}</p>}
        </div>
      </div>

      {actions && <div className="feature-page-header-actions">{actions}</div>}
    </div>
  );
}
