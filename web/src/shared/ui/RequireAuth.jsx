import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../features/auth/index.js';
import { LANDING_PATH } from '../routes.js';

/**
 * RequireAuth — route guard for the authenticated application
 *
 * Renders the nested routes only for a logged-in user. Guests (including a user who just
 * logged out) are sent to the landing page. While the session is still being checked a
 * neutral loader is shown, so an OAuth redirect carrying `auth_token` is never bounced away
 * before the token is picked up.
 */
export default function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="require-auth-loading">
        <div className="spinner-glow" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={LANDING_PATH} replace />;
  }

  return <Outlet />;
}
