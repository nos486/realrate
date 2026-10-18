/**
 * WidgetPicker.jsx — «افزودن ویجت»: every widget the user can add, by group, with what it shows
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { Check, LayoutDashboard, Plus } from 'lucide-react';
import Modal from '../../shared/ui/Modal.jsx';
import { WIDGET_CATALOG, WIDGET_GROUPS, WIDGET_TYPES, canAddWidget } from '../../utils/dashboardLayout.js';
import { WIDGET_VIEWS } from './widgetRegistry.jsx';

/**
 * @param {{ isOpen: boolean, onClose: () => void, widgets: object[], canSee: (type: string) => boolean,
 *   onAdd: (type: string) => void }} props
 */
export default function WidgetPicker({ isOpen, onClose, widgets, canSee, onAdd }) {
  if (!isOpen) return null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('افزودن ویجت')}
      subtitle={t('هر ویجت را می‌توانید جابه‌جا کنید، اندازه‌اش را عوض کنید یا بعداً بردارید.')}
      icon={<LayoutDashboard size={18} />}
      maxWidth="560px"
    >
      <div className="dash-picker">
        {WIDGET_GROUPS.map((group) => {
          const types = WIDGET_TYPES.filter((type) => WIDGET_CATALOG[type].group === group.id && canSee(type));
          if (types.length === 0) return null;
          return (
            <section key={group.id} className="dash-picker-group">
              <h3>{t(group.title)}</h3>
              <ul>
                {types.map((type) => {
                  const spec = WIDGET_CATALOG[type];
                  const { Icon } = WIDGET_VIEWS[type];
                  const addable = canAddWidget(widgets, type);
                  return (
                    <li key={type}>
                      <button type="button" className="dash-picker-row" disabled={!addable} onClick={() => onAdd(type)}>
                        <span className="dash-picker-icon"><Icon size={18} aria-hidden="true" /></span>
                        <span className="dash-picker-text">
                          <strong>{t(spec.title)}</strong>
                          <small>{t(spec.description)}</small>
                        </span>
                        <span className="dash-picker-action" aria-label={addable ? t('افزودن') : t('اضافه شده')}>
                          {addable ? <Plus size={16} /> : <Check size={16} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
