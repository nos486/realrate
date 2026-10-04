/**
 * AdminGroupsPage.jsx — Groups of users and who gets which feature (/admin/groups)
 *
 * - Join requests waiting for an answer (approve adds the member, reject drops the request)
 * - Groups: create, edit, delete (not a system group, not one a feature uses), and each group's
 *   members (search, add by email, remove)
 * - Feature access: for each feature, off / admins only / signed-in users — all of them, or only
 *   the members of some groups; back to the code's default
 *
 * Changes take effect on the user's next request; the app re-reads its features when it opens and
 * when it comes back to the foreground.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { UsersRound, Plus, Pencil, Trash2, Check, X, Crown, KeyRound, RotateCcw, UserPlus, Inbox } from 'lucide-react';
import { AlertBanner, Button, Card, EmptyState, FeaturePageHeader, Input, Modal, Pagination, SearchBar } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { GROUP_LIMITS } from '../../../utils/userGroups.js';
import {
  getAdminGroups,
  createAdminGroup,
  updateAdminGroup,
  deleteAdminGroup,
  getAdminGroupMembers,
  addAdminGroupMember,
  removeAdminGroupMember,
  answerAdminGroupRequest,
  saveAdminFeatureRule,
  resetAdminFeatureRule,
} from '../api/adminApi.js';
import { faNum, formatDateTime } from '../utils/adminFormat.js';

const STAGE_OPTIONS = [
  { value: 'off', label: 'خاموش' },
  { value: 'beta', label: 'فقط مدیر' },
  { value: 'ga', label: 'کاربران' },
];

const personName = (p) => p.name || p.email;

// ── Join requests ──────────────────────────────────────────────────────────

function RequestsCard({ requests, groups, onAnswer, busy }) {
  if (!requests.length) return null;
  const groupName = (id) => groups.find((g) => g.id === id)?.name || id;
  return (
    <Card padding="lg" icon={<Inbox size={18} />} title="درخواست‌های عضویت" subtitle="کاربرانی که از صفحه‌ی ویژگی، عضویت در گروه را خواسته‌اند">
      <ul className="admin-group-list">
        {requests.map((r) => {
          const key = `${r.groupId}:${r.userId}`;
          return (
            <li key={key} className="admin-group-row">
              <div className="admin-group-main">
                <strong>{personName(r)}</strong>
                <small><bdi>{r.email}</bdi> · {groupName(r.groupId)} · {formatDateTime(r.requestedAt)}</small>
                {r.note && <p className="admin-group-note">«{r.note}»</p>}
              </div>
              <div className="admin-group-actions">
                <Button size="sm" icon={<Check size={14} />} loading={busy === `${key}:yes`} disabled={Boolean(busy)} onClick={() => onAnswer(r, true)}>
                  تأیید
                </Button>
                <Button size="sm" variant="secondary" icon={<X size={14} />} loading={busy === `${key}:no`} disabled={Boolean(busy)} onClick={() => onAnswer(r, false)}>
                  رد
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── Group form ─────────────────────────────────────────────────────────────

function GroupFormModal({ group, onClose, onSaved }) {
  const { toast } = useFeedback();
  const editing = Boolean(group?.id);
  const [form, setForm] = useState({
    key: group?.key || '',
    name: group?.name || '',
    description: group?.description || '',
    allowRequests: Boolean(group?.allowRequests),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setError('');
    try {
      const res = editing
        ? await updateAdminGroup(group.id, { name: form.name, description: form.description, allowRequests: form.allowRequests })
        : await createAdminGroup(form);
      toast.success(res.message || 'ذخیره شد.');
      onSaved();
    } catch (err) {
      setError(err.message || 'ذخیره ممکن نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editing ? `ویرایش «${group.name}»` : 'گروه جدید'}
      icon={<UsersRound size={18} />}
      onSubmit={submit}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button type="submit" loading={saving}>ذخیره</Button>
        </>
      )}
    >
      <div className="admin-group-form">
        {error && <AlertBanner type="error" message={error} />}
        <Input
          label="شناسه"
          value={form.key}
          onChange={set('key')}
          disabled={editing}
          dir="ltr"
          maxLength={GROUP_LIMITS.key}
          hint={editing ? 'شناسه پس از ساخت تغییر نمی‌کند (دسترسی‌ها با آن به گروه اشاره می‌کنند).' : 'حروف کوچک انگلیسی، رقم، - و _ ؛ مثلاً vip'}
          required={!editing}
        />
        <Input label="نام" value={form.name} onChange={set('name')} maxLength={GROUP_LIMITS.name} required />
        <Input label="توضیح" value={form.description} onChange={set('description')} maxLength={GROUP_LIMITS.description} hint="به کاربرانی که این گروه را ندارند نمایش داده می‌شود." />
        <label className="admin-group-check">
          <input type="checkbox" checked={form.allowRequests} onChange={set('allowRequests')} />
          <span>کاربران بتوانند درخواست عضویت بدهند</span>
        </label>
      </div>
    </Modal>
  );
}

// ── Members ────────────────────────────────────────────────────────────────

function MembersModal({ group, onClose, onChanged }) {
  const { confirm, toast } = useFeedback();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await getAdminGroupMembers(group.id, { q, page }));
    } catch (err) {
      toast.error(err.message || 'دریافت اعضا ممکن نشد.');
    }
  }, [group.id, q, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setBusy('add');
    try {
      const res = await addAdminGroupMember(group.id, { email: email.trim() });
      toast.success(res.message);
      setEmail('');
      await load();
      onChanged();
    } catch (err) {
      toast.error(err.message || 'افزودن ممکن نشد.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (member) => {
    const ok = await confirm({
      title: 'برداشتن از گروه',
      message: `«${personName(member)}» از «${group.name}» برداشته می‌شود و ویژگی‌های این گروه برایش بسته می‌شود.`,
      confirmLabel: 'برداشته شود',
      danger: true,
    });
    if (!ok) return;
    setBusy(member.userId);
    try {
      const res = await removeAdminGroupMember(group.id, member.userId);
      toast.success(res.message);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err.message || 'برداشتن ممکن نشد.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`اعضای «${group.name}»`} subtitle={data ? `${faNum(data.total)} عضو` : ''} icon={<UsersRound size={18} />} maxWidth="620px">
      <div className="admin-group-members">
        <form
          className="admin-group-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ایمیل کاربر" dir="ltr" type="email" aria-label="ایمیل کاربر" />
          <Button type="submit" icon={<UserPlus size={16} />} loading={busy === 'add'} disabled={!email.trim()}>افزودن</Button>
        </form>
        <SearchBar
          value={q}
          onChange={(value) => {
            setQ(typeof value === 'string' ? value : value?.target?.value || '');
            setPage(1);
          }}
          placeholder="جستجو در اعضا (نام یا ایمیل)"
        />
        {!data ? (
          <SkeletonRows rows={4} columns={2} label="در حال دریافت اعضا" />
        ) : data.members.length === 0 ? (
          <p className="admin-detail-note">{q ? 'عضوی با این مشخصات پیدا نشد.' : 'این گروه هنوز عضوی ندارد.'}</p>
        ) : (
          <ul className="admin-group-list">
            {data.members.map((m) => (
              <li key={m.userId} className="admin-group-row">
                <div className="admin-group-main">
                  <strong>{personName(m)}</strong>
                  <small><bdi>{m.email}</bdi> · از {formatDateTime(m.addedAt)}</small>
                </div>
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} loading={busy === m.userId} disabled={Boolean(busy)} onClick={() => remove(m)} aria-label={`برداشتن ${personName(m)}`}>
                  برداشتن
                </Button>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </div>
    </Modal>
  );
}

// ── Groups ─────────────────────────────────────────────────────────────────

function GroupsCard({ groups, features, onCreate, onEdit, onMembers, onDelete }) {
  const usedBy = (key) => features.filter((f) => f.groups.includes(key)).map((f) => f.label);
  return (
    <Card
      padding="lg"
      icon={<UsersRound size={18} />}
      title="گروه‌ها"
      subtitle="کاربران را در گروه‌ها قرار دهید؛ هر ویژگی می‌تواند فقط برای اعضای گروه‌هایی باز باشد."
      actions={<Button size="sm" icon={<Plus size={14} />} onClick={onCreate}>گروه جدید</Button>}
    >
      <ul className="admin-group-list">
        {groups.map((g) => {
          const features = usedBy(g.key);
          return (
            <li key={g.id} className="admin-group-row">
              <div className="admin-group-main">
                <strong>
                  {g.key === 'pro' && <Crown size={14} className="admin-group-crown" />}
                  {g.name}
                  <bdi className="admin-chip admin-mono">{g.key}</bdi>
                  {g.isSystem && <span className="admin-chip">سیستمی</span>}
                  {g.allowRequests && <span className="admin-chip is-blue">پذیرش درخواست</span>}
                  {g.requestCount > 0 && <span className="admin-chip is-amber">{faNum(g.requestCount)} درخواست</span>}
                </strong>
                {g.description && <small>{g.description}</small>}
                <small>
                  {faNum(g.memberCount)} عضو
                  {features.length > 0 && <> · دسترسی به: {features.join('، ')}</>}
                </small>
              </div>
              <div className="admin-group-actions">
                <Button size="sm" variant="secondary" icon={<UsersRound size={14} />} onClick={() => onMembers(g)}>اعضا</Button>
                <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => onEdit(g)} aria-label={`ویرایش ${g.name}`} />
                {!g.isSystem && (
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => onDelete(g)} aria-label={`حذف ${g.name}`} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── Feature access ─────────────────────────────────────────────────────────

function FeatureRuleRow({ feature, groups, onSave, onReset }) {
  const [stage, setStage] = useState(feature.stage);
  const [chosen, setChosen] = useState(feature.groups);
  const [busy, setBusy] = useState(null);
  const dirty = stage !== feature.stage || chosen.join() !== feature.groups.join();

  const toggle = (key) => setChosen((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  const run = async (action, fn) => {
    setBusy(action);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const audience = stage === 'off'
    ? 'برای هیچ‌کس فعال نیست.'
    : stage === 'beta'
      ? 'فقط مدیران سیستم.'
      : chosen.length
        ? `فقط اعضای ${chosen.map((k) => groups.find((g) => g.key === k)?.name || k).join('، ')} (و مدیران).`
        : 'همه‌ی کاربران واردشده.';

  return (
    <li className="admin-feature-row">
      <div className="admin-group-main">
        <strong>
          {feature.label}
          <bdi className="admin-chip admin-mono">{feature.key}</bdi>
          {feature.customized && <span className="admin-chip is-amber">تغییر داده شده</span>}
        </strong>
        <small>{feature.description}</small>
      </div>
      <div className="admin-feature-controls">
        <div className="admin-segmented" role="radiogroup" aria-label={`وضعیت ${feature.label}`}>
          {STAGE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={stage === o.value}
              className={stage === o.value ? 'is-active' : ''}
              onClick={() => setStage(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {stage === 'ga' && (
          <div className="admin-feature-groups" aria-label="گروه‌ها">
            {groups.map((g) => (
              <label key={g.key} className={`admin-chip-toggle ${chosen.includes(g.key) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={chosen.includes(g.key)} onChange={() => toggle(g.key)} />
                {g.name}
              </label>
            ))}
          </div>
        )}
        <small className="admin-feature-audience">{audience}</small>
        <div className="admin-group-actions">
          {dirty && (
            <Button size="sm" disabled={Boolean(busy)} loading={busy === 'save'} onClick={() => run('save', () => onSave(feature.key, { stage, groups: stage === 'ga' ? chosen : [] }))}>
              ذخیره
            </Button>
          )}
          {feature.customized && (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} disabled={Boolean(busy)} loading={busy === 'reset'} onClick={() => run('reset', () => onReset(feature.key))}>
              پیش‌فرض
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function FeaturesCard({ features, groups, onSave, onReset }) {
  return (
    <Card padding="lg" icon={<KeyRound size={18} />} title="دسترسی به ویژگی‌ها" subtitle="هر ویژگی برای چه کسانی باز باشد؛ سرور همین را اجرا می‌کند و تغییر بلافاصله اعمال می‌شود.">
      <ul className="admin-group-list">
        {features.map((f) => (
          // A row starts over from the saved rule after each save (its key changes with it)
          <FeatureRuleRow key={`${f.key}:${f.stage}:${f.groups.join()}`} feature={f} groups={groups} onSave={onSave} onReset={onReset} />
        ))}
      </ul>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminGroupsPage() {
  const { confirm, toast } = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // {} for a new group
  const [membersOf, setMembersOf] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await getAdminGroups());
      setError('');
    } catch (err) {
      setError(err.message || 'دریافت گروه‌ها ممکن نشد.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const answer = async (request, approve) => {
    const key = `${request.groupId}:${request.userId}:${approve ? 'yes' : 'no'}`;
    setBusy(key);
    try {
      const res = await answerAdminGroupRequest(request.groupId, request.userId, approve);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message || 'انجام نشد.');
    } finally {
      setBusy(null);
    }
  };

  const removeGroup = async (group) => {
    const ok = await confirm({
      title: 'حذف گروه',
      message: `«${group.name}» و عضویت ${faNum(group.memberCount)} کاربر در آن حذف می‌شود. حساب کاربران و اطلاعاتشان دست نمی‌خورد.`,
      confirmLabel: 'حذف شود',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await deleteAdminGroup(group.id);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message || 'حذف ممکن نشد.');
    }
  };

  const saveRule = async (key, rule) => {
    try {
      const res = await saveAdminFeatureRule(key, rule);
      toast.success(res.message);
      setData((d) => ({ ...d, features: res.features }));
    } catch (err) {
      toast.error(err.message || 'ذخیره ممکن نشد.');
    }
  };

  const resetRule = async (key) => {
    try {
      const res = await resetAdminFeatureRule(key);
      toast.success(res.message);
      setData((d) => ({ ...d, features: res.features }));
    } catch (err) {
      toast.error(err.message || 'انجام نشد.');
    }
  };

  return (
    <div className="incomes-page-container admin-page">
      <FeaturePageHeader icon={<UsersRound size={24} />} title="گروه‌ها و دسترسی‌ها" subtitle="گروه‌های کاربران، اعضا، درخواست‌ها و اینکه هر ویژگی برای چه کسانی باز است" />

      {error ? (
        <EmptyState title="دریافت اطلاعات ممکن نشد" description={error} action={<Button onClick={load}>تلاش دوباره</Button>} />
      ) : !data ? (
        <SkeletonRows rows={6} columns={2} label="در حال دریافت گروه‌ها" />
      ) : (
        <div className="admin-groups-layout">
          <RequestsCard requests={data.requests} groups={data.groups} onAnswer={answer} busy={busy} />
          <GroupsCard
            groups={data.groups}
            features={data.features}
            onCreate={() => setEditing({})}
            onEdit={setEditing}
            onMembers={setMembersOf}
            onDelete={removeGroup}
          />
          <FeaturesCard features={data.features} groups={data.groups} onSave={saveRule} onReset={resetRule} />
        </div>
      )}

      {editing && (
        <GroupFormModal
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {membersOf && <MembersModal group={membersOf} onClose={() => setMembersOf(null)} onChanged={load} />}
    </div>
  );
}
