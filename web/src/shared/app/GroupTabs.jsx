/**
 * GroupTabs.jsx — The website's section groups as one tab bar (shared/app/navGroups.js)
 *
 * A group with one section is a tab that opens it; a group with several opens a dropdown of its
 * sections (ActionMenu), the open one marked. The open section's group is the active tab. In the
 * app frame the bottom bar does this instead (AppShell.jsx).
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { ChevronDown } from 'lucide-react';
import ActionMenu from '../ui/ActionMenu.jsx';

/**
 * @param {ReturnType<import('./navGroups.js').buildNavGroups>} groups - the tab groups (not the account menu)
 * @param {string} activeTab - the open section
 * @param {(tab: string) => void} onSelect - open a section
 */
export default function GroupTabs({ groups, activeTab, onSelect }) {
  return (
    <div role="tablist" className="ui-filter-pills variant-segmented size-lg group-tabs">
      {groups.map((group) => {
        const active = group.items.some((item) => item.value === activeTab);
        const content = (
          <>
            <span className="pill-icon"><group.Icon size={16} strokeWidth={2} /></span>
            <span className="pill-label">{t(group.label)}</span>
          </>
        );
        if (group.items.length === 1) {
          const [only] = group.items;
          return (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`filter-pill-btn ${active ? 'active' : ''}`}
              onClick={() => { if (!active) onSelect(only.value); }}
            >
              {content}
            </button>
          );
        }
        return (
          <ActionMenu
            key={group.key}
            className="group-tab-menu"
            label={t(group.label)}
            triggerClassName={`filter-pill-btn ${active ? 'active' : ''}`}
            trigger={(
              <>
                {content}
                <ChevronDown size={14} className="group-tab-chevron" aria-hidden="true" />
              </>
            )}
            items={group.items.map((item) => ({
              key: item.value,
              label: item.label,
              icon: item.icon,
              active: item.value === activeTab,
              onClick: () => { if (item.value !== activeTab) onSelect(item.value); },
            }))}
          />
        );
      })}
    </div>
  );
}
