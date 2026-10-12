/**
 * PlanLimitPrompt.jsx — Tells the user a change hit the free plan's limit and takes them to the
 * page comparing the plans. It listens for what httpClient announces when the server refuses with
 * PLAN_LIMIT, so every form is covered without handling the error itself.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { PLAN_LIMIT_EVENT, PRO_PATH } from './usePlan.js';
import { appPath } from '../routes.js';

export default function PlanLimitPrompt() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onLimit = (e) => setMessage(e.detail?.message || 'به سقف پلن رایگان رسیده‌اید.');
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, []);

  const close = () => setMessage('');
  const compare = () => {
    close();
    navigate(appPath(PRO_PATH));
  };

  return (
    <Modal
      isOpen={Boolean(message)}
      onClose={close}
      title="سقف پلن رایگان"
      icon={<Crown size={18} />}
      maxWidth="420px"
      footer={(
        <>
          <Button variant="secondary" onClick={close}>بعداً</Button>
          <Button icon={<Crown size={16} />} onClick={compare}>مقایسه‌ی پلن‌ها</Button>
        </>
      )}
    >
      <p className="plan-limit-text">{message}</p>
    </Modal>
  );
}
