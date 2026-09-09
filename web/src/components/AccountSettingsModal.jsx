import React, { useState, useEffect } from 'react';
import { User, Check, AlertTriangle, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/context/AuthContext.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';
import { apiGetUserSettings, apiUpdateUserSettings } from '@/api/client.js';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils.js';

export default function AccountSettingsModal({ isOpen, onClose }) {
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [customName, setCustomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (isOpen) {
      setMsg({ text: '', type: '' });
      setCustomName(user?.customName || '');
      setLoading(true);

      apiGetUserSettings()
        .then((res) => {
          if (res.success && res.settings) {
            setCustomName(res.settings.customName || user?.customName || '');
          }
        })
        .catch((err) => {
          setMsg({ text: 'خطا در دریافت اطلاعات: ' + err.message, type: 'error' });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });

    try {
      const res = await apiUpdateUserSettings({
        customName: customName.trim(),
      });

      if (res.success) {
        setMsg({ text: 'تنظیمات با موفقیت ذخیره شد.', type: 'success' });
        updateUser({ customName: customName.trim() });
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        setMsg({ text: res.message || 'خطا در ذخیره تنظیمات', type: 'error' });
      }
    } catch (err) {
      setMsg({ text: err.message || 'خطای سرور', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <User size={16} />
            </div>
            <DialogTitle>تنظیمات حساب کاربری</DialogTitle>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span>در حال دریافت اطلاعات...</span>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <DialogBody className="space-y-4">
              {msg.text && (
                <div
                  className={cn(
                    'p-3 rounded-xl text-xs font-semibold flex items-center gap-2',
                    msg.type === 'success'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  )}
                >
                  {msg.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span>{msg.text}</span>
                </div>
              )}

              {/* User Profile Card */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/5 light:bg-slate-50 light:border-slate-200">
                {user?.picture && (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-10 h-10 rounded-full border border-amber-500/50 object-cover"
                  />
                )}
                <div className="flex flex-col">
                  <strong className="text-xs font-bold text-white light:text-slate-900">
                    {user?.name || 'کاربر'}
                  </strong>
                  <span className="text-[11px] text-slate-400 font-mono dir-ltr text-start">
                    {user?.email}
                  </span>
                </div>
              </div>

              {/* Custom Nickname Input */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="userCustomNickname">نام مستعار (Nickname):</Label>
                <Input
                  type="text"
                  id="userCustomNickname"
                  placeholder="مثلاً: آریا، سرمایه‌گذار..."
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  maxLength={40}
                  autoFocus
                />
                <span className="text-[10px] text-slate-400 leading-relaxed">
                  این نام در پورتفوهای اشتراک‌گذاشته‌شده به عنوان نام مالک نمایش داده می‌شود.
                </span>
              </div>

              {/* Theme Selector */}
              <div className="flex flex-col gap-2">
                <Label>حالت نمایش (پوسته):</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={cn(
                      'flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none',
                      theme === 'dark'
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-sm'
                        : 'bg-white/[0.03] text-slate-400 border-white/10 hover:bg-white/[0.06] light:bg-slate-100 light:text-slate-600 light:border-slate-200'
                    )}
                    onClick={() => setTheme('dark')}
                  >
                    <Moon size={15} strokeWidth={2.2} />
                    <span>حالت تاریک</span>
                  </button>

                  <button
                    type="button"
                    className={cn(
                      'flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none',
                      theme === 'light'
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-sm'
                        : 'bg-white/[0.03] text-slate-400 border-white/10 hover:bg-white/[0.06] light:bg-slate-100 light:text-slate-600 light:border-slate-200'
                    )}
                    onClick={() => setTheme('light')}
                  >
                    <Sun size={15} strokeWidth={2.2} />
                    <span>حالت روشن</span>
                  </button>
                </div>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                انصراف
              </Button>
              <Button type="submit" variant="primary" disabled={saving} isLoading={saving}>
                {saving ? 'در حال ذخیره...' : 'ذخیره'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
