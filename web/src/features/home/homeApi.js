import { httpClient } from '../../shared/api/httpClient.js';

/** @returns {Promise<{ success: boolean, layout: object|null }>} */
export const getHomeLayout = () => httpClient.get('/api/user/home-layout');

/** Save a layout, or pass null to go back to the default home page */
export const saveHomeLayout = (layout) =>
  httpClient.put('/api/user/home-layout', { layout }, { silent: true });
