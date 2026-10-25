/**
 * useBotSettings.js — The state of a messenger bot's admin page (ربات تلگرام, ربات روبیکا): what the
 * server saved, the form being edited, whether it differs (save first, then test), and the page's
 * actions (save, test the connection, send now, forget the saved token).
 *
 * Every bot has the same base form (on/off, token, channel, the nightly analysis, daily report, which feeds); a page adds
 * its own fields with `extra` (the Telegram page: the admin's username).
 */

import { useCallback, useEffect, useState } from 'react';
import { intlLocale } from '../../../utils/i18n.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());
const sameIds = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const baseForm = (res) => ({
  enabled: res.config.enabled,
  channel: res.config.channel,
  dailyReport: res.config.dailyReport === true,
  dailyAnalysis: res.config.dailyAnalysis === true,
  allFeeds: !res.config.feeds,
  feedIds: res.config.feeds || res.feeds.map((f) => f.id),
  token: '',
});

/**
 * @param {{
 *   api: { get: () => Promise<any>, save: (patch: object) => Promise<any>, test: () => Promise<any>, run: () => Promise<any> },
 *   name: string,
 *   extra?: { fromConfig: (config: object) => object, isDirty: (form: object, config: object) => boolean, toPayload: (form: object) => object },
 * }} options
 *   name: the messenger's name in the messages (تلگرام, روبیکا)
 */
export function useBotSettings({ api, name, extra = null }) {
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [check, setCheck] = useState(null);

  const apply = useCallback((res) => {
    setData(res);
    setForm({ ...baseForm(res), ...(extra ? extra.fromConfig(res.config) : {}) });
  }, [extra]);

  const load = useCallback(() => {
    setError('');
    api.get().then(apply).catch((err) => setError(err?.message || 'خوانده نشد.'));
  }, [api, apply]);
  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  /** Run one action at a time; a failure is a toast */
  const guard = (kind, fn) => async () => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(err?.message || 'انجام نشد.');
    } finally {
      setBusy(null);
    }
  };

  const config = data?.config;
  const savedFeeds = config?.feeds || null;
  const dirty = Boolean(data && form) && (
    form.enabled !== config.enabled
    || form.channel.trim() !== config.channel
    || form.dailyReport !== (config.dailyReport === true)
    || form.dailyAnalysis !== (config.dailyAnalysis === true)
    || form.token.trim() !== ''
    || form.allFeeds !== !savedFeeds
    || (!form.allFeeds && !sameIds(form.feedIds, savedFeeds || []))
    || Boolean(extra && extra.isDirty(form, config))
  );

  const save = guard('save', async () => {
    const res = await api.save({
      enabled: form.enabled,
      channel: form.channel.trim(),
      dailyReport: form.dailyReport,
      dailyAnalysis: form.dailyAnalysis,
      feeds: form.allFeeds ? null : form.feedIds,
      ...(extra ? extra.toPayload(form) : {}),
      ...(form.token.trim() ? { token: form.token.trim() } : {}),
    });
    apply(res);
    setCheck(null);
    if (res.webhook && !res.webhook.ok) toast.warning(`تنظیمات ذخیره شد، ولی اتصال ${name} به سرور برقرار نشد: ${res.webhook.error}`);
    else toast.success(`تنظیمات ربات ${name} ذخیره شد.`);
  });

  const test = guard('test', async () => {
    const res = await api.test();
    setCheck(res);
    if (res.ok) toast.success('اتصال برقرار است و پیام آزمایشی در کانال فرستاده شد.');
    else toast.error(res.error);
  });

  const run = guard('run', async () => {
    const res = await api.run();
    setData((d) => ({ ...d, status: res.status, config: res.config }));
    if (res.result?.skipped) toast.warning(`ربات ${name} خاموش است.`);
    else toast.success(`${fa(res.result?.sent)} خبر فرستاده شد، ${fa(res.result?.waiting)} در صف.`);
  });

  const removeToken = guard('remove', async () => {
    apply(await api.save({ token: null, enabled: false }));
    toast.success('توکن پاک شد.');
  });

  return { data, setData, config, error, load, form, setField, busy, guard, check, dirty, save, test, run, removeToken };
}
