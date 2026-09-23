import React from 'react';

/**
 * FeaturePageHeader — Icon + title + subtitle + actions bar shared by every
 * top-level feature page (Portfolio, Transactions, Loans, Incomes), so they
 * all open with the same visual header instead of four near-identical copies.
 */
export default function FeaturePageHeader({ icon, title, subtitle, actions = null }) {
  return (
    <div className="feature-page-header-bar">
      <div className="feature-page-header-title-wrap">
        <div className="feature-page-header-icon">{icon}</div>
        <div>
          <h1 className="feature-page-title">{title}</h1>
          {subtitle && <p className="feature-page-subtitle">{subtitle}</p>}
        </div>
      </div>

      {actions && <div className="feature-page-header-actions">{actions}</div>}
    </div>
  );
}
