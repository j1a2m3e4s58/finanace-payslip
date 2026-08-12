import { Toaster } from '@/components/ui/toaster';
import { lazy, Suspense } from 'react';
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
import { AppLoadingState, OfflineBanner, PageState, SystemStateBoundary } from '@/components/SystemStateBoundary';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Profile = lazy(() => import('@/pages/Profile'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Settings = lazy(() => import('@/pages/Settings'));
const Reports = lazy(() => import('@/pages/ReportsPage'));
const PayrollApprovals = lazy(() => import('@/pages/PayrollModule').then((module) => ({ default: module.PayrollApprovals })));
const PayrollEntry = lazy(() => import('@/pages/PayrollModule').then((module) => ({ default: module.PayrollEntry })));
const PayrollBatches = lazy(() => import('@/pages/PayrollBatchesPage'));
const PayrollSetupPage = lazy(() => import('@/pages/PayrollSetupPage'));
const AddNewStaff = lazy(() => import('@/pages/AddNewStaffPage'));
const StaffDirectory = lazy(() => import('@/pages/StaffDirectoryPage'));
const UploadStaffEmails = lazy(() => import('@/pages/StaffUploadPage'));
const AuditLogs = lazy(() => import('@/pages/AuditLogsPage'));
const SendPayslips = lazy(() => import('@/pages/SendPayslipsPage'));
const SalaryHistory = lazy(() => import('@/pages/SalaryHistoryPage'));
const PayslipPdfPage = lazy(() => import('@/pages/PayslipPreviewPage'));
const UserManagement = lazy(() => import('@/pages/UserManagement'));
const MyPayslips = lazy(() => import('@/pages/MyPayslipsPage'));

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
        <Route path="/my-payslips" element={<RequirePermission permission="my-payslips.view"><MyPayslips /></RequirePermission>} />
        <Route path="/" element={<RequirePermission permission="dashboard.view"><Dashboard /></RequirePermission>} />
        <Route path="/staff" element={<RequirePermission permission="staff.view"><StaffDirectory /></RequirePermission>} />
        <Route path="/staff/upload-emails" element={<RequirePermission permission="staff.manage"><UploadStaffEmails /></RequirePermission>} />
        <Route path="/staff/new" element={<RequirePermission permission="staff.manage"><AddNewStaff /></RequirePermission>} />
        <Route path="/payroll/batches" element={<RequirePermission permission="payroll.view"><PayrollBatches /></RequirePermission>} />
        <Route path="/payroll/setup" element={<RequirePermission permission="payroll.setup.view"><PayrollSetupPage /></RequirePermission>} />
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
  return <SystemStateBoundary><AuthProvider><ThemeProvider><QueryClientProvider client={queryClientInstance}><Router><ScrollToTop /><OfflineBanner /><Suspense fallback={<AppLoadingState />}><AuthenticatedApp /></Suspense><PwaInstallPrompt /></Router><Toaster /></QueryClientProvider></ThemeProvider></AuthProvider></SystemStateBoundary>;
}
