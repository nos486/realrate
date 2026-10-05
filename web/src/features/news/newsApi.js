import { httpClient } from '../../shared/api/httpClient.js';

/**
 * Published news, newest first
 * @param {{ limit?: number, before?: number, category?: string, important?: boolean }} [opts]
 * @returns {Promise<{ items: object[], hasMore: boolean }>}
 */
export function getNews({ limit = 20, before = 0, category = '', important = false } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', String(before));
  if (category) params.set('category', category);
  if (important) params.set('important', '1');
  return httpClient.get(`/api/news?${params}`);
}

/** Admin: the channels read and the last run of each */
export const getNewsChannels = () => httpClient.get('/api/admin/news/channels');

/** Admin: save the channels ([{ username, enabled }]) */
export const saveNewsChannels = (channels) => httpClient.put('/api/admin/news/channels', { channels });

/** Admin: read the channels now */
export const runNewsNow = () => httpClient.post('/api/admin/news/run', {});

/** Admin: take an item down (or put it back) */
export const setNewsHidden = (id, hidden = true) =>
  httpClient.post(`/api/admin/news/${id}/hidden`, { hidden }, { silent: true });
