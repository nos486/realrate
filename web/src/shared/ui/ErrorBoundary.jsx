/**
 * ErrorBoundary.jsx — A page that fails to render shows a message with «تلاش دوباره», not a blank
 * screen; the rest of the app keeps working, and moving to another page tries again.
 *
 * A lazy page whose file is gone (a new version was deployed while the app was open, so the old
 * chunk's hashed name no longer exists) reloads the app once to fetch the new version instead.
 *
 *   <ErrorBoundary resetKey={location.pathname}>…</ErrorBoundary>
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { isChunkLoadError, reloadOnceForNewVersion } from './chunkReload.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Another page: try again
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && reloadOnceForNewVersion()) return;
    console.error('[ErrorBoundary] a page failed to render:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkLoadError(this.state.error);
    return (
      <div className="error-boundary" role="alert">
        <AlertTriangle size={28} aria-hidden="true" />
        <h2>{chunk ? 'نسخه‌ی تازه‌ی برنامه آماده است' : 'این بخش درست نمایش داده نشد'}</h2>
        <p>
          {chunk
            ? 'برای ادامه، برنامه را دوباره بارگذاری کنید.'
            : 'مشکلی پیش آمد. دوباره امتحان کنید؛ اگر تکرار شد، برنامه را دوباره باز کنید. اطلاعات شما سالم است.'}
        </p>
        <div className="error-boundary-actions">
          {!chunk && (
            <button type="button" className="error-boundary-retry" onClick={() => this.setState({ error: null })}>
              <RotateCcw size={16} aria-hidden="true" />
              تلاش دوباره
            </button>
          )}
          <button type="button" className="error-boundary-reload" onClick={() => window.location.reload()}>
            بارگذاری دوباره‌ی برنامه
          </button>
        </div>
      </div>
    );
  }
}
