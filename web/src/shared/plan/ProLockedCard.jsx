/**
 * ProLockedCard.jsx — In place of a settings section that only Pro has: what it gives, and the
 * button to the page comparing the plans
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Lock } from 'lucide-react';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { PRO_PATH } from './usePlan.js';
import { appPath } from '../routes.js';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.text - what the section gives
 */
export default function ProLockedCard({ title, text }) {
  const navigate = useNavigate();
  return (
    <Card className="app-settings-card" padding="lg" icon={<Lock size={18} />} title={title}>
      <p className="plan-limit-text">{text}</p>
      <Button size="sm" icon={<Crown size={14} />} onClick={() => navigate(appPath(PRO_PATH))}>
        مقایسه با Pro
      </Button>
    </Card>
  );
}
