import React from "react";
import { Outlet } from "react-router-dom";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export default function ProtectedRoute({ unauthenticatedElement = null }) {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings, portalSettings, user } = useAuth();
  const location = useLocation();

  if (isLoadingAuth || isLoadingPublicSettings) {
    return null;
  }

  if (!isAuthenticated) return unauthenticatedElement;
  if (user?.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  const localTesting = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const privilegedMfaRequired = !localTesting && portalSettings?.requirePrivilegedMfa !== false && portalSettings?.mfaEnrollmentAvailable !== false;
  if (privilegedMfaRequired && ['BossAdmin', 'SuperAdmin', 'Admin', 'FinanceOfficer', 'FinanceApprover'].includes(user?.role) && !user?.mfaEnabled && !['/profile', '/change-password'].includes(location.pathname)) return <Navigate to="/profile" replace />;
  return <Outlet />;
}
