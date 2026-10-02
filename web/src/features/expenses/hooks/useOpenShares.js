import { useCallback, useEffect, useState } from 'react';
import * as api from '../../../shared/vault/vaultExpenses.js';

const failed = (err) => ({ loading: false, error: err?.message || 'دریافت طلب‌ها ممکن نشد.', expenses: [] });

/** Shared expenses («دنگ») with something still owed back, from every section and month */
export function useOpenShares() {
  const [state, setState] = useState({ loading: true, error: '', expenses: [] });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api.getOpenSharedExpenses()
      .then((expenses) => !cancelled && setState({ loading: false, error: '', expenses }))
      .catch((err) => !cancelled && setState(failed(err)));
    return () => {
      cancelled = true;
    };
  }, [version]);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    setVersion((v) => v + 1);
  }, []);
  return { ...state, reload };
}
