import { useState, useRef, useCallback, useEffect } from 'react';
import { resizeImage } from '../../../../shared/utils/imageResize.js';
import { scanCheque, getScanQuota } from '../../api/chequeApi.js';

export function useChequeScan() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'resizing' | 'ready' | 'uploading' | 'done' | 'error'
  const [file, setFile] = useState(null);
  const [resized, setResized] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);

  // Today's scans (limit null: no limit); refreshed by every scan
  const [quota, setQuota] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getScanQuota()
      .then((res) => { if (!cancelled && res?.quota) setQuota(res.quota); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const selectFile = useCallback(async (newFile) => {
    if (!newFile) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setFile(newFile);
    setError(null);
    setStatus('resizing');

    try {
      const resizeResult = await resizeImage(newFile, { maxSide: 1600, quality: 0.8 });
      setResized(resizeResult);

      const url = URL.createObjectURL(resizeResult.blob);
      setPreviewUrl(url);
      setStatus('ready');
    } catch (err) {
      setError(err.message || 'خطا در پردازش تصویر');
      setStatus('error');
    }
  }, []);

  const startScan = useCallback(async () => {
    if (!resized?.blob) return;

    setError(null);
    setStatus('uploading');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await scanCheque(resized.blob, { signal: controller.signal });
      setResult(res);
      if (res?.quota) setQuota(res.quota);
      setStatus('done');
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('ready');
      } else {
        setError(err.message || 'پردازش تصویر ناموفق بود.');
        setStatus('error');
        // Out of scans for today (a busy service is a 429 too, but only for a moment)
        if (err.code === 'QUOTA_EXCEEDED') {
          setQuota((q) => (q && q.limit !== null ? { ...q, used: q.limit, remaining: 0 } : q));
        }
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [resized]);

  const cancelScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('ready');
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setStatus('idle');
    setFile(null);
    setResized(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  }, [previewUrl]);

  return {
    status,
    quota,
    file,
    resized,
    previewUrl,
    result,
    error,
    selectFile,
    startScan,
    cancelScan,
    reset,
  };
}
