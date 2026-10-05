/**
 * AdminNewsAnalysisLab.jsx — The model lab for «تحلیل روز»: build today's input once (shown as
 * it is sent: the instructions and the news, prices and trends), run it on the Cloudflare-hosted
 * models the admin picks — each model on its own request, three at a time — and compare the
 * answers side by side (the card as readers would see it, time, tokens, cost, the raw answer).
 * Then choose a model for the analysis from now on, and optionally publish its answer now.
 */

import React, { useState } from 'react';
import { FlaskConical, Play, CheckCircle2, AlertTriangle, Clock, Coins, Send } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { createNewsAnalysisLab, runNewsAnalysisLabModel, chooseNewsAnalysisModel } from '../../news/newsApi.js';
import NewsAnalysisCard from '../../news/NewsAnalysisCard.jsx';

const CONCURRENCY = 3;
const fa = (n, digits = 0) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: digits });
const ERRORS = {
  'foreign-text': 'متن جواب کلمه‌ی غیرفارسی داشت',
  'bad-answer': 'جواب قالب درستی نداشت (JSON)',
  'lab-expired': 'ورودی منقضی شده؛ دوباره بسازید',
  'unknown-model': 'مدل در فهرست نیست',
};
const LAB_REASONS = { 'no-news': 'امروز هنوز خبری نیست.', 'no-model': 'هوش مصنوعی (Workers AI) وصل نیست.', 'no-store': 'پایگاه داده در دسترس نیست.' };
const tokensOf = (usage) => ({
  input: Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0,
  output: Number(usage?.completion_tokens ?? usage?.output_tokens) || 0,
});

function ResultCard({ model, state, isCurrent, onChoose, choosing }) {
  const result = state?.result;
  const tokens = tokensOf(result?.usage);
  return (
    <article className={`admin-lab-result ${result?.ok ? 'is-ok' : result ? 'is-failed' : ''}`}>
      <header className="admin-lab-result-head">
        <strong>{model.label}</strong>
        <small>{model.vendor}{isCurrent ? ' · مدل فعلی' : ''}</small>
      </header>

      {state?.status === 'running' && <div className="admin-lab-running"><span className="spinner-glow" /> در حال اجرا…</div>}

      {result && (
        <>
          <div className="admin-lab-meta">
            <span><Clock size={12} /> {fa((result.durationMs || 0) / 1000, 1)} ثانیه</span>
            {(tokens.input > 0 || tokens.output > 0) && <span>{fa(tokens.input)} توکن ورودی · {fa(tokens.output)} خروجی</span>}
            {result.cost !== null && result.cost !== undefined && <span><Coins size={12} /> {fa(result.cost * 100, 3)} سنت</span>}
          </div>
          {result.ok ? (
            <NewsAnalysisCard analysis={{ ...result.analysis, at: state.at }} className="is-preview" />
          ) : (
            <p className="admin-lab-error"><AlertTriangle size={14} /> {ERRORS[result.error] || `خطا: ${result.error}`}</p>
          )}
          {result.raw && (
            <details className="admin-lab-raw">
              <summary>جواب خام مدل</summary>
              <pre dir="ltr">{result.raw}</pre>
            </details>
          )}
          <div className="admin-lab-actions">
            {result.ok && (
              <Button size="sm" icon={<Send size={14} />} loading={choosing === `${model.id}:publish`} disabled={Boolean(choosing)} onClick={() => onChoose(model, true)}>
                انتخاب و انتشار همین تحلیل
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<CheckCircle2 size={14} />} loading={choosing === model.id} disabled={Boolean(choosing) || isCurrent} onClick={() => onChoose(model, false)}>
              {isCurrent ? 'مدل فعلی' : 'انتخاب این مدل'}
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

export default function AdminNewsAnalysisLab({ aiConfigured, current: initialCurrent, onChosen }) {
  const { toast } = useFeedback();
  const [lab, setLab] = useState(null);
  const [models, setModels] = useState([]);
  const [current, setCurrent] = useState(initialCurrent || '');
  const [selected, setSelected] = useState(new Set());
  const [results, setResults] = useState({});
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [choosing, setChoosing] = useState('');

  const build = async () => {
    setBuilding(true);
    try {
      const res = await createNewsAnalysisLab();
      setModels(res.models || []);
      setCurrent(res.current || current);
      setResults({});
      if (!res.lab) {
        setLab(null);
        toast.warning(LAB_REASONS[res.reason] || 'ورودی ساخته نشد.');
        return;
      }
      setLab(res.lab);
      setSelected((prev) => (prev.size ? prev : new Set((res.models || []).map((m) => m.id))));
    } catch (err) {
      toast.error(err?.message || 'ورودی ساخته نشد.');
    } finally {
      setBuilding(false);
    }
  };

  const runAll = async () => {
    const queue = models.filter((m) => selected.has(m.id)).map((m) => m.id);
    if (!queue.length) return;
    setRunning(true);
    setResults((r) => ({ ...r, ...Object.fromEntries(queue.map((id) => [id, { status: 'queued' }])) }));
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        setResults((r) => ({ ...r, [id]: { status: 'running' } }));
        let result;
        try {
          result = (await runNewsAnalysisLabModel(lab.id, id)).result;
        } catch (err) {
          result = { model: id, ok: false, error: err?.message || 'request failed' };
        }
        setResults((r) => ({ ...r, [id]: { status: 'done', result, at: Date.now() } }));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  };

  const choose = async (model, publish) => {
    setChoosing(publish ? `${model.id}:publish` : model.id);
    try {
      const res = await chooseNewsAnalysisModel(model.id, publish ? lab?.id : '');
      setCurrent(res.model);
      onChosen?.(model);
      toast.success(res.published
        ? `${model.label} انتخاب شد و تحلیلش منتشر شد.`
        : `از این پس «تحلیل روز» با ${model.label} نوشته می‌شود.`);
    } catch (err) {
      toast.error(err?.message || 'انتخاب نشد.');
    } finally {
      setChoosing('');
    }
  };

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const [system, user] = lab?.messages || [];
  const shown = models.filter((m) => results[m.id]);

  return (
    <div className="portfolio-stat-card admin-lab">
      <div className="stat-header">
        <span className="stat-label"><FlaskConical size={14} /> آزمایشگاه مدل «تحلیل روز»</span>
        <Button size="sm" variant="secondary" icon={<FlaskConical size={14} />} loading={building} disabled={!aiConfigured || building || running} onClick={build}>
          {lab ? 'ساختن دوباره‌ی ورودی' : 'ساختن ورودی امروز'}
        </Button>
      </div>
      <p className="admin-card-hint">
        ورودی امروز (دستورالعمل، خبرها، قیمت‌ها و روند هفتگی و ماهانه) یک بار ساخته می‌شود و همان را به مدل‌های
        انتخاب‌شده‌ی کلادفلر می‌دهیم تا جواب‌ها کنار هم مقایسه شوند. هر اجرای هر مدل یک درخواست Workers AI است.
      </p>

      {lab && (
        <>
          <details className="admin-lab-input">
            <summary>ورودی‌ای که به مدل داده می‌شود ({fa(lab.newsCount)} خبر)</summary>
            {system && <><h4>دستورالعمل (system)</h4><pre dir="ltr">{system.content}</pre></>}
            {user && <><h4>داده‌ها (user)</h4><pre dir="auto">{user.content}</pre></>}
          </details>

          <ul className="admin-lab-models">
            {models.map((m) => (
              <li key={m.id}>
                <label>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} disabled={running} />
                  <span>
                    <strong>{m.label}</strong>
                    <small>{m.vendor} · {fa(m.price?.[0], 2)} / {fa(m.price?.[1], 2)} دلار در میلیون توکن{m.id === current ? ' · مدل فعلی' : ''}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="admin-lab-run">
            <Button size="sm" icon={<Play size={14} />} loading={running} disabled={running || !selected.size} onClick={runAll}>
              اجرای {fa(selected.size)} مدل
            </Button>
          </div>
        </>
      )}

      {shown.length > 0 && (
        <div className="admin-lab-results">
          {shown.map((m) => (
            <ResultCard key={m.id} model={m} state={results[m.id]} isCurrent={m.id === current} onChoose={choose} choosing={choosing} />
          ))}
        </div>
      )}
    </div>
  );
}
