import { Navigate, useLocation } from 'react-router-dom';
import { dashboardPath, useAuth } from './AuthContext.jsx';
import Loader from '../components/Loader.jsx';

export default function ProtectedRoute({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <Loader message="Loading your workspace..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={dashboardPath(user.role)} replace />;
  }
  return children;
}
