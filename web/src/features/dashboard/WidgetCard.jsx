/**
 * WidgetCard.jsx — The shell every card-style widget of the home page is built in: the card, its
 * header (icon, title and an optional «همه» link) and the body under it
 *
 * One look and one behaviour for all of them: the header never scrolls, the list or content under
 * it does (the page gives it the rest of the widget's height), and the card is labelled for
 * screen readers. A widget with a look of its own (the month's hero, a tile that is one big
 * button) may skip the shell but still follows the rest of the standard (docs/ARCHITECTURE.md).
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * @param {{ title: string, Icon?: React.ElementType, action?: { label?: string, onClick: () => void },
 *   className?: string, children?: React.ReactNode }} props
 *   title: the translated widget title; action: the header link (default label «همه»)
 */
export default function WidgetCard({ title, Icon = null, action = null, className = '', children }) {
  return (
    <section className={`app-home-card dash-card ${className}`.trim()} aria-label={title}>
      <header className="app-home-card-head">
        <h2>{Icon && <Icon size={15} aria-hidden="true" />} {title}</h2>
        {action && (
          <button type="button" className="app-home-link" onClick={action.onClick}>
            {action.label || t('همه')} <ChevronLeft size={16} />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
