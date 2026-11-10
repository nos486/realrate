/**
 * AiHelpModal.jsx — What the voice AI can do: how to use it and every thing it understands, with
 * sentences to say (aiHelp.js)
 *
 * Shown by itself the first time the «+» button is tapped, and from «دستیار صوتی» in «ثبت سریع».
 */

import React from 'react';
import { Sparkles, HandCoins, MessageCircleQuestion, Pencil, FilePlus, MessageSquareText, Type } from 'lucide-react';
import { Button, Modal } from '../../shared/ui/index.js';
import { t } from '../../utils/i18n.js';
import { AI_HOW_TO, aiCapabilities } from './aiHelp.js';

const ICONS = { records: HandCoins, question: MessageCircleQuestion, edit: Pencil, create: FilePlus, sms: MessageSquareText, dictate: Type };

/** @param {{ open: boolean, onClose: () => void }} props */
export default function AiHelpModal({ open, onClose }) {
  if (!open) return null;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('دستیار صوتی چه کارهایی می‌کند؟')}
      icon={<Sparkles size={18} />}
      maxWidth="460px"
      footer={<Button onClick={onClose}>{t('متوجه شدم')}</Button>}
    >
      <ul className="ai-help-steps">
        {AI_HOW_TO().map((line) => <li key={line}>{line}</li>)}
      </ul>
      <div className="ai-help-list">
        {aiCapabilities().map(({ key, title, text, examples }) => {
          const Icon = ICONS[key] || Sparkles;
          return (
            <section key={key} className="ai-help-item">
              <h4><Icon size={16} aria-hidden="true" />{title}</h4>
              <p>{text}</p>
              {examples.length > 0 && (
                <ul>{examples.map((e) => <li key={e}>«{e}»</li>)}</ul>
              )}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
