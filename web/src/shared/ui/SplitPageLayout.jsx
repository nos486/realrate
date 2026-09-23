import React from 'react';

/**
 * SplitPageLayout — The two-column layout shared by every feature page: main
 * data large on the right (.portfolio-content-column), summary/report cards
 * on the left (.portfolio-sidebar-column). Reuses the split-layout CSS that
 * Portfolio's page already established, so every page that adopts this
 * component automatically matches Portfolio's structure and colors.
 */
export default function SplitPageLayout({ sidebar, children }) {
  return (
    <div className="portfolio-layout-split">
      <div className="portfolio-content-column">{children}</div>
      <div className="portfolio-sidebar-column">{sidebar}</div>
    </div>
  );
}
