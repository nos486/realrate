import { useEffect, useState } from 'react';
import { useVault } from './useVault.js';
import { getPortfolioKey, isAccountVaultPortfolio } from './vaultStore.js';

/**
 * Key of a portfolio protected by the account vault (null while locked, or for portfolios that
 * aren't). Portfolios with their own older passphrase vault resolve their key elsewhere.
 * @returns {{ accountManaged: boolean, key: CryptoKey|null, resolving: boolean }}
 */
export function usePortfolioVaultKey(portfolio) {
  const vault = useVault();
  const accountManaged = isAccountVaultPortfolio(portfolio);
  const wrapped = portfolio?.e2eeWrappedKey || '';
  const [resolved, setResolved] = useState({ wrapped: '', epoch: -1, key: null });

  useEffect(() => {
    if (!wrapped || vault.status !== 'unlocked') return undefined;
    let cancelled = false;
    getPortfolioKey({ e2eeWrappedKey: wrapped })
      .then((key) => {
        if (!cancelled) setResolved({ wrapped, epoch: vault.epoch, key });
      })
      .catch(() => {
        if (!cancelled) setResolved({ wrapped, epoch: vault.epoch, key: null });
      });
    return () => {
      cancelled = true;
    };
  }, [wrapped, vault.status, vault.epoch]);

  const upToDate = resolved.wrapped === wrapped && resolved.epoch === vault.epoch;
  const key = accountManaged && vault.status === 'unlocked' && upToDate ? resolved.key : null;
  return {
    accountManaged,
    key,
    resolving: accountManaged && vault.status === 'unlocked' && !upToDate,
  };
}
