export { default } from '../features/portfolio/components/PortfolioTracker.jsx';

export {
  PORTFOLIO_CATEGORIES,
  CATEGORY_DEFINITIONS,
  getCategoryLabel,
  getCategoryBadge,
  resolveItemCategory,
} from '../utils/financialSpecs.js';

export {
  CategoryIcon,
  formatAssetName,
  formatNum,
  parseInputNumber,
  normalizeHolding,
} from '../features/portfolio/utils/holdingHelpers.js';
