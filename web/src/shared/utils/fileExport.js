/**
 * fileExport.js — Save a file the app made (a CSV export, the full backup)
 *
 * In the browser: a download. In the Android app a WebView cannot download a file the page built
 * itself, so the text goes to the native share sheet (FileExportPlugin.java), where the user saves
 * it to Files / Drive or sends it.
 */

import { isNativeApp } from '../native/nativeApp.js';
import { FileExport } from '../native/nativePlugins.js';

/**
 * @param {string} filename
 * @param {string} text the file's content
 * @param {string} [mimeType]
 */
export async function saveTextFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
  if (isNativeApp()) {
    await FileExport.share({ filename, text, mimeType: mimeType.split(';')[0] });
    return;
  }
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
