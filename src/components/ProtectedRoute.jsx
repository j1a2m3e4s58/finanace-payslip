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
  const privilegedMfaRequired = portalSettings?.requirePrivilegedMfa !== false;
  if (privilegedMfaRequired && ['SuperAdmin', 'Admin', 'FinanceOfficer', 'FinanceApprover'].includes(user?.role) && !user?.mfaEnabled && !['/profile', '/change-password'].includes(location.pathname)) return <Navigate to="/profile" replace />;
  return <Outlet />;
}
