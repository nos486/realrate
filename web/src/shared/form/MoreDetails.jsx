/**
 * MoreDetails.jsx — «جزئیات بیشتر»: what an entry form asks only now and then (a shared bill, tags,
 * a note) folded under one row, which says what of it is filled in («دنگ · یادداشت»)
 *
 * Starts open when something in it is already filled (an edit), so nothing set is hidden.
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * @param {{ filled?: string[], children: React.ReactNode, label?: string }} props — filled: the
 *   names of what is set inside
 */
export default function MoreDetails({ filled = [], children, label = 'جزئیات بیشتر' }) {
  const [open, setOpen] = useState(filled.length > 0);
  return (
    <div className={`more-details ${open ? 'is-open' : ''}`}>
      <button type="button" className="more-details-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="more-details-label">{label}</span>
        {!open && filled.length > 0 && <span className="more-details-summary">{filled.join(' · ')}</span>}
        <ChevronDown size={16} className="more-details-chevron" aria-hidden="true" />
      </button>
      {open && <div className="more-details-body">{children}</div>}
    </div>
  );
}
