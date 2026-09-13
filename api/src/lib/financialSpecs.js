/**
 * financialSpecs.js — Backward-Compatibility & Symlink Re-Export Bridge
 *
 * NOTE: The domain specifications and calculation formulas have been decomposed
 * into modular files under `api/src/domain/specs/` and `api/src/domain/formulas.js`.
 *
 * This file is preserved at its canonical location to support:
 * 1. The symlink `web/src/utils/financialSpecs.js -> ../../../api/src/lib/financialSpecs.js`
 * 2. Any internal imports referencing `api/src/lib/financialSpecs.js`
 */

export * from '../domain/specs/index.js';
export * from '../domain/formulas.js';
