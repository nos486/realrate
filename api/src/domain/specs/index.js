/**
 * index.js — Centralized Domain Specifications & Formulas Export
 */

export * from './gold.spec.js';
export * from './coin.spec.js';
export * from './silver.spec.js';
export * from './forex.spec.js';
export * from './crypto.spec.js';
export * from './cash.spec.js';
export * from './registry.js';
export * from '../formulas.js';
export {
  getSourceConfig,
  resolveAssetDisplayName,
  resolveAssetDisplayWithSource,
  getSourceShortBrand,
  resolveAssetUnit,
  getSourceParser,
  resolveCategory,
} from '../../config/sourceRegistry.js';
