/**
 * ReportCard.jsx — A card of the reports grid with a title (charts and donuts bring their own)
 */

import React from 'react';

/**
 * @param {{ title: string, Icon?: React.ComponentType, actions?: React.ReactNode, span: string,
 *   className?: string, children: React.ReactNode }} props - span: the grid class (span-4 … span-12)
 */
export default function ReportCard({ title, Icon = null, actions = null, span, className = '', children }) {
  return (
    <section className={`portfolio-stat-card report-card ${span} ${className}`}>
      <header className="report-card-head">
        <h3>{Icon && <Icon size={15} aria-hidden="true" />}{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}
