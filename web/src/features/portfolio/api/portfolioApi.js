/**
 * portfolioApi.js — Portfolio Feature API Calls
 * Interfaces with RealRate Cloudflare Worker API via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';

export async function getPortfolios() {
  return httpClient.get('/api/portfolios');
}

export async function createPortfolio(portfolioData) {
  return httpClient.post('/api/portfolios', portfolioData);
}

export async function updatePortfolio(portfolioData) {
  return httpClient.put('/api/portfolios', portfolioData);
}

export async function deletePortfolio(id) {
  return httpClient.delete(`/api/portfolios?id=${encodeURIComponent(id)}`);
}

export async function getPortfolio(portfolioId = null) {
  const cleanId = (typeof portfolioId === 'string' && portfolioId.trim() && portfolioId !== '[object Object]')
    ? portfolioId.trim()
    : (typeof portfolioId === 'object' && portfolioId !== null && typeof portfolioId.id === 'string' && portfolioId.id.trim())
      ? portfolioId.id.trim()
      : null;
  const url = cleanId
    ? `/api/portfolio?portfolioId=${encodeURIComponent(cleanId)}`
    : '/api/portfolio';
  return httpClient.get(url);
}

export async function addPortfolioHolding(holdingData) {
  return httpClient.post('/api/portfolio', holdingData);
}

export async function updatePortfolioHolding(holdingData) {
  return httpClient.put('/api/portfolio', holdingData);
}

export async function deletePortfolioHolding(id) {
  return httpClient.delete(`/api/portfolio?id=${encodeURIComponent(id)}`);
}

export async function getSharedPortfolio(slug, password = '') {
  return httpClient.post('/api/portfolio/shared', { slug, password });
}

export async function getUserSettings() {
  return httpClient.get('/api/user/settings');
}

export async function updateUserSettings(settings) {
  return httpClient.post('/api/user/settings', settings);
}

export async function searchBourseSymbols(q = '', limit = 50) {
  return httpClient.get(`/api/bourse/symbols?q=${encodeURIComponent(q)}&limit=${limit}`);
}
