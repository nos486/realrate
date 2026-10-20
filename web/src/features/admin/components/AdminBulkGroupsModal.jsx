/**
 * AdminBulkGroupsModal.jsx — Set the group of many users at once (admin users list)
 *
 * A user is in one group only: the admin picks the group all of them go to (each leaves the one
 * they were in) or «بدون گروه»; applying does it for every picked user in one request
 * (POST /api/admin/users/groups).
 */

import React, { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../../../shared/ui/index.js';
import { getAdminGroups, bulkSetUserGroup } from '../api/adminApi.js';
import { faNum } from '../utils/adminFormat.js';

/**
 * @param {object} props
 * @param {number} props.count how many users change
 * @param {() => object} props.getWho the users to change: { userIds } or { match: { q, filter } }
 * @param {() => void} props.onClose
 * @param {(res: { users: number, message: string }) => void} props.onDone
 */
export default function AdminBulkGroupsModal({ count, getWho, onClose, onDone }) {
  const [groups, setGroups] = useState(null);
  // undefined: nothing chosen yet; null: no group; otherwise a group key
  const [choice, setChoice] = useState(undefined);
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

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      onDone(await bulkSetUserGroup(getWho(), choice));
    } catch (err) {
      setError(err.message || 'تغییر گروه ممکن نشد.');
      setSaving(false);
    }
  };

  const options = [...(groups || []).map((g) => ({ key: g.key, name: g.name })), { key: null, name: 'بدون گروه' }];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="تعیین گروه کاربران"
      subtitle={`${faNum(count)} کاربر انتخاب شده`}
      icon={<UsersRound size={18} />}
      onSubmit={submit}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button type="submit" loading={saving} disabled={choice === undefined}>اعمال روی {faNum(count)} کاربر</Button>
        </>
      )}
    >
      <div className="admin-group-form">
        {error && <AlertBanner type="error" message={error} />}
        {!groups && !error && <small>در حال دریافت گروه‌ها…</small>}
        <small>هر کاربر فقط عضو یک گروه است: گروهی که انتخاب می‌کنید جای گروه قبلی همه‌ی آن‌ها را می‌گیرد.</small>
        <div className="admin-feature-groups" role="radiogroup" aria-label="گروه">
          {groups && options.map((o) => (
            <label key={String(o.key)} className={`admin-chip-toggle ${choice === o.key ? 'is-on' : ''}`}>
              <input type="radio" name="bulk-group" checked={choice === o.key} onChange={() => setChoice(o.key)} />
              {o.name}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
