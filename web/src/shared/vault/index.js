export { useVault } from './useVault.js';
export { default as VaultUnlockCard } from './VaultUnlockCard.jsx';
export {
  loadVault,
  unlockVault,
  lockVault,
  resetVault,
  isVaultOn,
  isVaultUnlocked,
  isAccountVaultPortfolio,
  getPortfolioKey,
  getPortfolioRawKey,
  createPortfolioKey,
  VaultLockedError,
  VAULT_MIN_PASSPHRASE_LENGTH,
} from './vaultStore.js';
