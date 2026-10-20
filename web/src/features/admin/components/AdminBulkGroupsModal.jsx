/**
 * AdminBulkGroupsModal.jsx — Change the groups of many users at once (admin users list)
 *
 * For each group the admin picks «بدون تغییر», «افزودن» or «برداشتن»; applying does all of them for
 * every picked user in one request (POST /api/admin/users/groups).
 */

import React, { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../../../shared/ui/index.js';
import { getAdminGroups, bulkChangeUserGroups } from '../api/adminApi.js';
import { faNum } from '../utils/adminFormat.js';

const CHOICES = [
  { value: 'none', label: 'بدون تغییر' },
  { value: 'add', label: 'افزودن' },
  { value: 'remove', label: 'برداشتن' },
];

/**
 * @param {object} props
 * @param {number} props.count how many users change
 * @param {() => object} props.getWho the users to change: { userIds } or { match: { q, filter } }
 * @param {() => void} props.onClose
 * @param {(res: { users: number, message: string }) => void} props.onDone
 */
export default function AdminBulkGroupsModal({ count, getWho, onClose, onDone }) {
  const [groups, setGroups] = useState(null);
  const [choice, setChoice] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getAdminGroups()
      .then((data) => alive && setGroups(data.groups || []))
      .catch((err) => alive && setError(err.message || 'دریافت گروه‌ها ممکن نشد.'));
    return () => {
      alive = false;
    };
  }, []);

  const pick = (key, value) => setChoice((c) => ({ ...c, [key]: value }));
  const add = Object.keys(choice).filter((k) => choice[k] === 'add');
  const remove = Object.keys(choice).filter((k) => choice[k] === 'remove');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      onDone(await bulkChangeUserGroups(getWho(), { add, remove }));
    } catch (err) {
      setError(err.message || 'تغییر گروه‌ها ممکن نشد.');
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="تغییر گروه کاربران"
      subtitle={`${faNum(count)} کاربر انتخاب شده`}
      icon={<UsersRound size={18} />}
      onSubmit={submit}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button type="submit" loading={saving} disabled={!add.length && !remove.length}>اعمال روی {faNum(count)} کاربر</Button>
        </>
      )}
    >
      <div className="admin-group-form">
        {error && <AlertBanner type="error" message={error} />}
        {!groups && !error && <small>در حال دریافت گروه‌ها…</small>}
        <ul className="admin-group-list">
          {(groups || []).map((g) => (
            <li key={g.key} className="admin-feature-row">
              <div className="admin-group-main">
                <strong>{g.name}<bdi className="admin-chip admin-mono">{g.key}</bdi></strong>
              </div>
              <div className="admin-segmented" role="radiogroup" aria-label={`تغییر ${g.name}`}>
                {CHOICES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={(choice[g.key] || 'none') === o.value}
                    className={(choice[g.key] || 'none') === o.value ? 'is-active' : ''}
                    onClick={() => pick(g.key, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
