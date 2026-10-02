/**
 * alertActions.js — Following an alert's action
 *
 * An action's `path` is an app route (navigated to), or `#<name>` for something that is not a
 * page: the app update prompt (#app-update).
 */

import { openUpdatePrompt } from '../native/appUpdate.js';

const SPECIAL = {
  'app-update': () => openUpdatePrompt(),
};

export function runAlertAction(alert, navigate) {
  const path = alert?.action?.path;
  if (!path) return;
  if (path.startsWith('#')) SPECIAL[path.slice(1)]?.();
  else navigate(path);
}
