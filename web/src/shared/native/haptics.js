/**
 * haptics.js — A light vibration on touch, like native apps (Android app only; nothing on the web)
 *
 * tap(): a choice (a tab, a sheet item); impact(): a main action (the + button);
 * success() / warning(): something saved, or refused.
 */

import { Capacitor } from '@capacitor/core';

let plugin = null;
function load() {
  if (!Capacitor.isNativePlatform()) return null;
  plugin ??= import('@capacitor/haptics').catch(() => null);
  return plugin;
}

function run(fn) {
  const loading = load();
  if (!loading) return;
  loading.then((mod) => mod && fn(mod)).catch(() => {});
}

export const tap = () => run(async ({ Haptics }) => {
  await Haptics.selectionStart();
  await Haptics.selectionChanged();
  await Haptics.selectionEnd();
});
export const impact = () => run(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));
export const success = () => run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }));
export const warning = () => run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Warning }));
