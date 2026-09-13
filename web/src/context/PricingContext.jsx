/**
 * Backward-compatibility bridge.
 * Canonical PricingContext has moved to `features/market`.
 */
export { PricingProvider, usePricing } from '../features/market/index.js';
export { PricingProvider as default } from '../features/market/index.js';
