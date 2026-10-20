/**
 * ReauthButton.jsx — "Sign in with Google again", next to a REAUTH_REQUIRED error
 *
 * An account without a password may set its first one, reset the vault or delete itself only
 * within minutes of signing in (the server's assertRecentSignIn, api/src/lib/auth.js), so a
 * session taken from a device cannot. This signs in again and comes back to the same page.
 */

import { t } from '../../../utils/i18n.js';
import React from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { rememberPostLoginPath } from '../../../shared/routes.js';
import { useAuth } from '../context/AuthContext.jsx';

/** The server's code for "sign in again first" */
export const REAUTH_REQUIRED = 'REAUTH_REQUIRED';

/** Whether a failed request asks for a fresh sign-in */
export const needsReauth = (err) => err?.code === REAUTH_REQUIRED;

export default function ReauthButton() {
  const { loginWithGoogle } = useAuth();
  const signInAgain = () => {
    const { pathname, search } = window.location;
    rememberPostLoginPath(`${pathname}${search}`);
    loginWithGoogle();
  };
  return (
    <Button type="button" variant="secondary" size="sm" icon={<LogIn size={14} />} onClick={signInAgain}>
      {t('ورود دوباره با گوگل')}
    </Button>
  );
}
