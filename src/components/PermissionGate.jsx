import { useAuth } from '@/lib/AuthContext';

export default function PermissionGate({ permission, children, fallback = null }) {
  const { can } = useAuth();
  return can(permission) ? children : fallback;
}
