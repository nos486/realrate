/**
 * MobileNavDrawer.jsx — Side menu for phones
 *
 * Replaces the tab bar on small screens: slides in from the start side (right in RTL) with the
 * user's profile, every section of the app, and the account actions (hide values, lock
 * encrypted data, sign out). Closes on Escape, on the backdrop, or after choosing an item.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff, Lock, LogOut } from 'lucide-react';

export default function MobileNavDrawer({
  isOpen,
  onClose,
  items = [],
  activeTab,
  onSelect,
  user,
  brand,
  hideValues,
  onTogglePrivacy,
  canLock,
  onLock,
  onLogout,
  onLogin,
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [isOpen, onClose]);

  const run = (fn) => () => {
    onClose();
    fn?.();
  };

  const displayName = user ? (user.customName || user.name || user.email) : '';

  // Portalled: the sticky header's backdrop-filter would otherwise trap position: fixed
  return createPortal(
    <div className={`nav-drawer-root ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
      <div className="nav-drawer-backdrop" onClick={onClose} />
      <aside
        className="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="منوی اصلی"
        inert={!isOpen}
      >
        <div className="nav-drawer-head">
          {/* The brand links home: leaving through it closes the menu too */}
          <div onClick={onClose}>{brand}</div>
          <button ref={closeRef} type="button" className="nav-drawer-close" onClick={onClose} aria-label="بستن منو">
            <X size={18} />
          </button>
        </div>

        {user && (
          <div className="nav-drawer-user">
            {user.picture ? (
              <img src={user.picture} alt="" className="nav-drawer-avatar" onError={(e) => { e.target.style.display = 'none'; }} />
            ) : (
              <span className="nav-drawer-avatar is-fallback">{(displayName || 'U')[0]}</span>
            )}
            <div className="nav-drawer-user-text">
              <strong>{displayName}</strong>
              {user.email && <small>{user.email}</small>}
            </div>
          </div>
        )}

        <nav className="nav-drawer-list" aria-label="بخش‌ها">
          {items.map((item) => {
            const active = item.value === activeTab;
            return (
              <button
                key={item.value}
                type="button"
                className={`nav-drawer-item ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={run(() => onSelect?.(item.value))}
              >
                <span className="nav-drawer-item-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav-drawer-actions">
          {user ? (
            <>
              <button type="button" className="nav-drawer-item" onClick={onTogglePrivacy} aria-pressed={hideValues}>
                <span className="nav-drawer-item-icon">{hideValues ? <Eye size={16} /> : <EyeOff size={16} />}</span>
                <span>{hideValues ? 'نمایش مبالغ' : 'پنهان کردن مبالغ'}</span>
              </button>
              {canLock && (
                <button type="button" className="nav-drawer-item" onClick={run(onLock)}>
                  <span className="nav-drawer-item-icon"><Lock size={16} /></span>
                  <span>قفل کردن اطلاعات رمزنگاری‌شده</span>
                </button>
              )}
              <button type="button" className="nav-drawer-item is-danger" onClick={run(onLogout)}>
                <span className="nav-drawer-item-icon"><LogOut size={16} /></span>
                <span>خروج از حساب</span>
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary nav-drawer-login" onClick={run(onLogin)}>
              ورود یا ثبت‌نام
            </button>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
