import { httpClient } from '../../shared/api/httpClient.js';

/**
 * Published news, newest first
 * @param {{ limit?: number, before?: number, category?: string, important?: boolean }} [opts]
 * @returns {Promise<{ items: object[], hasMore: boolean, total: number }>}
 */
export function getNews({ limit = 20, page = 0, before = 0, category = '', important = false } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (page > 1) params.set('page', String(page));
  if (before) params.set('before', String(before));
  if (category) params.set('category', category);
  if (important) params.set('important', '1');
  return httpClient.get(`/api/news?${params}`);
}

/** The analyst's card and today's most important news: { analysis, top } */
export const getNewsToday = () => httpClient.get('/api/news/today');

/** The latest analyst's card only (the landing page; served from KV, cached at the edge): { analysis } */
export const getLatestNewsAnalysis = () => httpClient.get('/api/news/analysis', { silent: true });

/** Admin: write the analyst's card now */
export const runNewsAnalysisNow = () => httpClient.post('/api/admin/news/analysis', {});

/** Admin: the channels read, the last runs' report and the last published news */
export const getNewsChannels = () => httpClient.get('/api/admin/news/channels');

/** Admin: save the channels ([{ username, enabled }]) */
export const saveNewsChannels = (channels) => httpClient.put('/api/admin/news/channels', { channels });

/** Admin: read the channels now */
export const runNewsNow = () => httpClient.post('/api/admin/news/run', {});

/** Admin: take an item down (or put it back) */
export const setNewsHidden = (id, hidden = true) =>
  httpClient.post(`/api/admin/news/${id}/hidden`, { hidden }, { silent: true });
