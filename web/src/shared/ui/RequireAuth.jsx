import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/index.js';
import { LANDING_PATH, rememberPostLoginPath } from '../routes.js';

/**
 * RequireAuth — route guard for the authenticated application
 *
 * Renders the nested routes only for a logged-in user. Guests (including a user who just
 * logged out) are sent to the landing page; the page they asked for is remembered so signing
 * in takes them straight back to it. While the session is still being checked a
 * neutral loader is shown, so an OAuth redirect carrying `auth_token` is never bounced away
 * before the token is picked up.
 */
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="require-auth-loading">
        <div className="spinner-glow" />
      </div>
    );
  }

  if (!user) {
    // Come back to this exact page after signing in from the landing page
    rememberPostLoginPath(`${location.pathname}${location.search}`);
    return <Navigate to={LANDING_PATH} replace />;
  }

  return <Outlet />;
}
