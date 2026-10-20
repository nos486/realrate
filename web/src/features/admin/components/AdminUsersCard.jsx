/**
 * AdminUsersCard.jsx — The users list of the admin panel: search, quick filters with counts,
 * sortable dates, pagination; each user opens the detail view. Users can be ticked (across pages,
 * or every match of the search and filter) and their groups changed at once.
 */

import React, { useState } from 'react';
import { Users, Ban, MailWarning, ShieldCheck, Eye, Lock, Smartphone, UsersRound } from 'lucide-react';
import { Button, EmptyState, FilterPills, Pagination, ResponsiveDataTable, SearchBar } from '../../../shared/ui/index.js';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { useIsMobile } from '../../../hooks/useMediaQuery.js';
import { USERS_PAGE_SIZE } from '../hooks/useAdminUsers.js';
import { faNum, faVersion, formatDateTime, formatDate, displayName } from '../utils/adminFormat.js';
import GoogleIcon from '../../auth/components/GoogleIcon.jsx';
import AdminBulkGroupsModal from './AdminBulkGroupsModal.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';

const USER_FILTER_OPTIONS = [
  { value: 'all', label: 'همه' },
  { value: 'new', label: 'ثبت‌نام این هفته' },
  { value: 'inactive', label: '۳۰ روز غیرفعال' },
  { value: 'unverified', label: 'ایمیل تأییدنشده' },
  { value: 'app', label: 'کاربران اپ' },
  { value: 'google', label: 'ورود با گوگل' },
  { value: 'blocked', label: 'مسدود' },
  { value: 'noE2ee', label: 'بدون رمزنگاری' },
  { value: 'e2ee', label: 'رمزنگاری فعال' },
];

const SORT_OPTIONS = [
  { value: 'lastLogin|desc', label: 'آخرین ورود (جدیدترین)' },
  { value: 'lastLogin|asc', label: 'آخرین ورود (قدیمی‌ترین)' },
  { value: 'createdAt|desc', label: 'ثبت‌نام (جدیدترین)' },
  { value: 'createdAt|asc', label: 'ثبت‌نام (قدیمی‌ترین)' },
];

/** Small status chips of a user row */
export function UserBadges({ user }) {
  return (
    <span className="admin-user-badges">
      {user.role === 'admin' && (
        <span className="admin-chip is-blue">
          <ShieldCheck size={11} /> مدیر
        </span>
      )}
      {user.disabled && (
        <span className="admin-chip is-red">
          <Ban size={11} /> مسدود
        </span>
      )}
      {!user.emailVerified && (
        <span className="admin-chip is-amber">
          <MailWarning size={11} /> تأییدنشده
        </span>
      )}
    </span>
  );
}

export default function AdminUsersCard({ list, filterCounts = {}, onOpenUser }) {
  const isMobile = useIsMobile();
  const { users, total, page, loading } = list;
  const { toast } = useFeedback();
  // The ticked users (kept across pages), or every user matching the search and filter
  const [selected, setSelected] = useState(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const count = allMatching ? total : selected.size;
  const pageAllTicked = users.length > 0 && users.every((u) => allMatching || selected.has(u.id));
  const clearSelection = () => {
    setSelected(new Set());
    setAllMatching(false);
  };
  const toggleUser = (id) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePage = () => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of users) {
        if (pageAllTicked) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  };
  // «Every match» follows the search and filter it was chosen for
  const matchKey = `${list.query}|${list.filter}`;
  const [matchKeyAtPick, setMatchKeyAtPick] = useState(matchKey);
  if (allMatching && matchKeyAtPick !== matchKey) clearSelection();

  const columns = [
    {
      key: 'user',
      header: 'کاربر',
      mobile: 'title',
      render: (u) => (
        <span className="admin-user-pick">
        <input
          type="checkbox"
          checked={allMatching || selected.has(u.id)}
          onChange={() => toggleUser(u.id)}
          aria-label={`انتخاب ${displayName(u)}`}
        />
        <button type="button" className="admin-user-cell" onClick={() => onOpenUser(u)}>
          {u.picture ? (
            <img src={u.picture} alt="" className="admin-user-avatar" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
          ) : (
            <span className="admin-user-avatar is-fallback" aria-hidden="true">{displayName(u).charAt(0)}</span>
          )}
          <span className="admin-user-text">
            <strong>{displayName(u)}</strong>
            <small dir="ltr">{u.email}</small>
          </span>
        </button>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      mobile: 'meta',
      render: (u) => (
        <span className="admin-status-cell">
          <span className="admin-login-methods" title={[u.googleLinked && 'گوگل', u.hasPassword && 'ایمیل و رمز'].filter(Boolean).join('، ')}>
            {u.googleLinked && <GoogleIcon size={13} />}
            {u.hasPassword && <span className="admin-chip">رمز</span>}
          </span>
          {u.usesApp && (
            <span className="admin-chip is-blue" title={`اپ اندروید — آخرین بار ${formatDateTime(u.appLastSeen)}`}>
              <Smartphone size={11} /> اپ{u.appVersion && ` ${faVersion(u.appVersion)}`}
            </span>
          )}
          {u.e2eeEnabled && (
            <span className="admin-chip is-green" title="رمزنگاری سرتاسری فعال است">
              <Lock size={11} /> رمزنگاری
            </span>
          )}
          <UserBadges user={u} />
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'تاریخ ثبت‌نام',
      sortKey: 'createdAt',
      mobile: 'stat',
      render: (u) => (
        <span className="table-date-text">
          {isMobile && <small className="admin-stat-label">ثبت‌نام</small>}
          {isMobile ? formatDate(u.createdAt) : formatDateTime(u.createdAt)}
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'آخرین ورود',
      sortKey: 'lastLogin',
      mobile: 'stat',
      render: (u) => (
        <span className="table-date-text">
          {isMobile && <small className="admin-stat-label">آخرین ورود</small>}
          {isMobile ? formatDate(u.lastLogin) : formatDateTime(u.lastLogin)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobile: 'actions',
      thClassName: 'admin-actions-th',
      render: (u) => (
        <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => onOpenUser(u)} aria-label={`جزئیات ${displayName(u)}`}>
          {isMobile ? null : 'جزئیات'}
        </Button>
      ),
    },
  ];

  const filterOptions = USER_FILTER_OPTIONS.map((o) => ({
    ...o,
    badge: filterCounts[o.value] !== undefined ? faNum(filterCounts[o.value]) : undefined,
  }));


  return (
    <div className="portfolio-table-card admin-users-card">
      <div className="portfolio-table-header">
        <div className="table-title">
          <div className="table-title-main">
            <h3>کاربران</h3>
          </div>
        </div>
        <SearchBar
          value={list.search}
          onChange={(e) => list.setSearch(e.target.value)}
          onClear={() => list.setSearch('')}
          placeholder="جستجو در نام، ایمیل، شناسه یا اسلاگ..."
          badge={`${faNum(total)} نفر`}
          className="incomes-search"
        />
      </div>

      <div className="table-card-body">
        <div className="admin-users-toolbar">
          <FilterPills options={filterOptions} activeValue={list.filter} onChange={list.setFilter} size="sm" className="admin-filter-pills" />
          {isMobile && (
            <select
              className="admin-sort-select"
              aria-label="مرتب‌سازی"
              value={`${list.sort.key}|${list.sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split('|');
                list.setSort({ key, dir });
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>

        {users.length > 0 && (
          <div className="admin-bulk-bar" role="group" aria-label="انتخاب گروهی">
            <label className="admin-bulk-all">
              <input type="checkbox" checked={pageAllTicked} onChange={togglePage} />
              انتخاب همه‌ی این صفحه
            </label>
            {count > 0 && (
              <>
                <span className="admin-bulk-count">{faNum(count)} کاربر انتخاب شده</span>
                {!allMatching && total > count && total <= 1000 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAllMatching(true);
                      setMatchKeyAtPick(matchKey);
                    }}
                  >
                    انتخاب همه‌ی {faNum(total)} نتیجه
                  </Button>
                )}
                <Button size="sm" icon={<UsersRound size={14} />} onClick={() => setBulkOpen(true)}>تعیین گروه</Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>لغو انتخاب</Button>
              </>
            )}
          </div>
        )}

        {loading && users.length === 0 ? (
          <SkeletonRows rows={6} columns={4} label="در حال دریافت کاربران" />
        ) : (
          <div className={loading ? 'admin-users-loading' : ''} aria-busy={loading}>
            <ResponsiveDataTable
              columns={columns}
              rows={users}
              wrapperClassName="portfolio-table-responsive"
              tableClassName="portfolio-data-table admin-users-table"
              rowClassName={(u) => `portfolio-table-row ${u.disabled ? 'is-blocked' : ''}`}
              sortState={list.sort}
              onSortChange={list.toggleSort}
              emptyState={
                <EmptyState
                  icon={<Users size={40} strokeWidth={1.5} />}
                  title="کاربری پیدا نشد"
                  description={list.query ? `هیچ کاربری با «${list.query}» مطابقت ندارد.` : 'در این دسته کاربری وجود ندارد.'}
                  action={
                    list.query || list.filter !== 'all' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          list.setSearch('');
                          list.setFilter('all');
                        }}
                      >
                        نمایش همه کاربران
                      </Button>
                    ) : null
                  }
                />
              }
            />
          </div>
        )}

        <Pagination
          page={page}
          pageSize={USERS_PAGE_SIZE}
          total={total}
          loading={loading}
          onChange={list.setPage}
          label="صفحه‌بندی کاربران"
        />
      </div>

      {bulkOpen && (
        <AdminBulkGroupsModal
          count={count}
          getWho={() => (allMatching ? { match: { q: list.query, filter: list.filter } } : { userIds: [...selected] })}
          onClose={() => setBulkOpen(false)}
          onDone={(res) => {
            toast.success(res.message);
            setBulkOpen(false);
            clearSelection();
          }}
        />
      )}
    </div>
  );
}
