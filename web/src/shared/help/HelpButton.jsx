/**
 * HelpButton.jsx — The «?» beside a page's title: opens that page's help (pageHelp.js) in a
 * dialog. Renders nothing for a page without a help row.
 */

import React, { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import IconButton from '../ui/IconButton.jsx';
import Modal from '../ui/Modal.jsx';
import { t } from '../../utils/i18n.js';
import { PAGE_HELP } from './pageHelp.js';

/**
 * @param {{ page: string }} props - a key of PAGE_HELP
 */
export default function HelpButton({ page }) {
  const [open, setOpen] = useState(false);
  const help = PAGE_HELP[page];
  if (!help) return null;
  return (
    <>
      <IconButton icon={<CircleHelp size={16} />} label={t('راهنمای این صفحه')} onClick={() => setOpen(true)} className="page-help-btn" />
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title={help.title} subtitle={t('راهنمای این صفحه')} icon={<CircleHelp size={18} />} maxWidth="480px">
          <div className="page-help">
            <p className="page-help-intro">{help.intro}</p>
            <ul className="page-help-steps">
              {help.steps.map((step) => <li key={step}>{step}</li>)}
            </ul>
          </div>
        </Modal>
      )}
    </>
  );
}
