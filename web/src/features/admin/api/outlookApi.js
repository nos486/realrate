/**
 * outlookApi.js — Admin: the dollar outlook experiment
 */

import { httpClient } from '../../../shared/api/httpClient.js';

/** The recorded scenarios, scored against the real closes, with totals */
export const getDollarOutlook = () => httpClient.get('/api/admin/outlook');

/** Write today's scenario now: { result, ...the same as getDollarOutlook } */
export const runDollarOutlookNow = () => httpClient.post('/api/admin/outlook/run', {});
