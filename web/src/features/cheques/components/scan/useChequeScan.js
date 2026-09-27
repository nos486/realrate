import { useState, useRef, useCallback, useEffect } from 'react';
import { resizeImage } from '../../../../shared/utils/imageResize.js';
import { scanCheque, getScanModels } from '../../api/chequeApi.js';
import { CHEQUE_SCAN_MODELS } from '../../../../config/ai.config.js';

export function useChequeScan() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'resizing' | 'ready' | 'uploading' | 'done' | 'error'
  const [file, setFile] = useState(null);
  const [resized, setResized] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedModel, setSelectedModel] = useState(CHEQUE_SCAN_MODELS[0].id);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);

  // Which models this Worker can call; until the list arrives every model is offered
  const [models, setModels] = useState(CHEQUE_SCAN_MODELS);
  useEffect(() => {
    let cancelled = false;
    getScanModels()
      .then((res) => {
        if (cancelled || !Array.isArray(res?.models)) return;
        setModels(res.models);
        setSelectedModel((current) => {
          const usable = res.models.filter((m) => m.available);
          return usable.some((m) => m.id === current) ? current : (usable[0]?.id || current);
        });
      })
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

  const startScan = useCallback(async (modelOverride = null) => {
    if (!resized?.blob) return;

    const modelToUse = modelOverride || selectedModel;
    setError(null);
    setStatus('uploading');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await scanCheque(resized.blob, modelToUse, { signal: controller.signal });
      setResult(res);
      setStatus('done');
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('ready');
      } else {
        setError(err.message || 'پردازش تصویر ناموفق بود.');
        setStatus('error');
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [resized, selectedModel]);

  const cancelScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('ready');
  }, []);

  const rescanWithModel = useCallback(async (newModel) => {
    setSelectedModel(newModel);
    await startScan(newModel);
  }, [startScan]);

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
    models,
    file,
    resized,
    previewUrl,
    selectedModel,
    setSelectedModel,
    result,
    error,
    selectFile,
    startScan,
    cancelScan,
    rescanWithModel,
    reset,
  };
}
