import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from '@/components/ScrollToTop';
import PageNotFound from '@/lib/PageNotFound';
import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ChangePassword from '@/pages/ChangePassword';
import Dashboard from '@/pages/Dashboard';
import Profile from '@/pages/Profile';
import Notifications from '@/pages/Notifications';
import Settings from '@/pages/Settings';
import Reports from '@/pages/ReportsPage';
import { PayrollApprovals, PayrollEntry } from '@/pages/PayrollModule';
import PayrollBatches from '@/pages/PayrollBatchesPage';
import AddNewStaff from '@/pages/AddNewStaffPage';
import StaffDirectory from '@/pages/StaffDirectoryPage';
import UploadStaffEmails from '@/pages/StaffUploadPage';
import AuditLogs from '@/pages/AuditLogsPage';
import SendPayslips from '@/pages/SendPayslipsPage';
import SalaryHistory from '@/pages/SalaryHistoryPage';
import PayslipPdfPage from '@/pages/PayslipPreviewPage';
import UserManagement from '@/pages/UserManagement';
import { AppLoadingState, OfflineBanner, PageState, SystemStateBoundary } from '@/components/SystemStateBoundary';

const RequirePermission = ({ permission, children }) => {
  const { can, firstAllowedPath } = useAuth();
  const navigate = useNavigate();
  return can(permission) ? children : <PageState type="error" title="Access restricted" message="Your account does not have permission to open this page. No confidential information has been displayed." retryLabel="Go to my workspace" onRetry={() => navigate(firstAllowedPath(), { replace: true })} />;
};

function AuthenticatedApp() {
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AppLoadingState />;
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
      <Route path="/change-password" element={<ChangePassword />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<RequirePermission permission="dashboard.view"><Dashboard /></RequirePermission>} />
        <Route path="/staff" element={<RequirePermission permission="staff.view"><StaffDirectory /></RequirePermission>} />
        <Route path="/staff/upload-emails" element={<RequirePermission permission="staff.manage"><UploadStaffEmails /></RequirePermission>} />
        <Route path="/staff/new" element={<RequirePermission permission="staff.manage"><AddNewStaff /></RequirePermission>} />
        <Route path="/payroll/batches" element={<RequirePermission permission="payroll.view"><PayrollBatches /></RequirePermission>} />
        <Route path="/payroll/entry" element={<RequirePermission permission="payroll.prepare"><PayrollEntry /></RequirePermission>} />
        <Route path="/payroll/approvals" element={<RequirePermission permission="payroll.approve"><PayrollApprovals /></RequirePermission>} />
        <Route path="/payslips/preview" element={<RequirePermission permission="payslips.preview"><PayslipPdfPage /></RequirePermission>} />
        <Route path="/payslips/send" element={<RequirePermission permission="payslips.send"><SendPayslips /></RequirePermission>} />
        <Route path="/salary-history" element={<RequirePermission permission="salary.view"><SalaryHistory /></RequirePermission>} />
        <Route path="/audit-logs" element={<RequirePermission permission="audit.view"><AuditLogs /></RequirePermission>} />
        <Route path="/reports" element={<RequirePermission permission="reports.view"><Reports /></RequirePermission>} />
        <Route path="/users" element={<RequirePermission permission="users.view"><UserManagement /></RequirePermission>} />
        <Route path="/portal-control" element={<RequirePermission permission="portal.manage"><Settings /></RequirePermission>} />
        <Route path="/settings" element={<RequirePermission permission="portal.manage"><Navigate to="/portal-control" replace /></RequirePermission>} />
        <Route path="/profile" element={<RequirePermission permission="profile.view"><Profile /></RequirePermission>} />
        <Route path="/notifications" element={<RequirePermission permission="notifications.view"><Notifications /></RequirePermission>} />
      </Route>
    </Route>
    <Route path="*" element={<PageNotFound />} />
  </Routes>;
}

export default function App() {
  return <SystemStateBoundary><AuthProvider><ThemeProvider><QueryClientProvider client={queryClientInstance}><Router><ScrollToTop /><OfflineBanner /><AuthenticatedApp /></Router><Toaster /></QueryClientProvider></ThemeProvider></AuthProvider></SystemStateBoundary>;
}
