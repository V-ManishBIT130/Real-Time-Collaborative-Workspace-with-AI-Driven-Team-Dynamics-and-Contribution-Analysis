import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

interface Props {
  children: React.ReactNode;
}

/**
 * Wraps routes that require authentication.
 * Redirects to /auth if user is not logged in.
 * Shows nothing during initial token verification.
 */
export default function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, loading } = useAuthStore();

  // Still verifying token — show nothing (avoid flash)
  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
        fontSize: '0.9rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'
          }} />
          Verifying session...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
