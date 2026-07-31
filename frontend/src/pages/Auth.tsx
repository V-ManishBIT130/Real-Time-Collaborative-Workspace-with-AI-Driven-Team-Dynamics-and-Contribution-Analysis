import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import '../styles/Auth.css';

export default function Auth() {
  const navigate = useNavigate();
  const { login, register, error, loading, clearError, isAuthenticated } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // If already authenticated, redirect (via effect to avoid setState-during-render)
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let success = false;

    if (mode === 'register') {
      success = await register(name.trim(), email.trim(), password);
    } else {
      success = await login(email.trim(), password);
    }

    if (success) {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="auth-page">
      {/* Animated gradient background */}
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <div className="auth-container">
        {/* Logo */}
        <div className="auth-header">
          <div className="auth-logo-icon">
            <svg width="44" height="44" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="12" r="4" fill="#6366f1" />
              <circle cx="10" cy="28" r="4" fill="#f43f5e" />
              <circle cx="30" cy="28" r="4" fill="#10b981" />
              <line x1="20" y1="16" x2="10" y2="24" stroke="#6366f1" strokeWidth="2" opacity="0.5" />
              <line x1="20" y1="16" x2="30" y2="24" stroke="#10b981" strokeWidth="2" opacity="0.5" />
              <line x1="14" y1="28" x2="26" y2="28" stroke="#f43f5e" strokeWidth="2" opacity="0.5" />
            </svg>
          </div>
          <h1 className="auth-logo-text">Collab<span>Lens</span></h1>
          <p className="auth-tagline">AI-driven team dynamics & contribution analysis</p>
        </div>

        {/* Auth Card */}
        <div className="auth-card">
          {/* Tab toggle */}
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); clearError(); }}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); clearError(); }}
            >
              Create Account
            </button>
            <div className={`auth-tab-indicator ${mode === 'register' ? 'right' : ''}`} />
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {/* Name field — register only */}
            {mode === 'register' && (
              <div className="auth-field" style={{ animationDelay: '0.05s' }}>
                <label htmlFor="auth-name">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  autoFocus
                  required
                />
              </div>
            )}

            {/* Email field */}
            <div className="auth-field" style={{ animationDelay: '0.1s' }}>
              <label htmlFor="auth-email">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={mode === 'login'}
                required
              />
            </div>

            {/* Password field */}
            <div className="auth-field" style={{ animationDelay: '0.15s' }}>
              <label htmlFor="auth-password">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Password
              </label>
              <div className="password-wrapper">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Min. 6 characters' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" />
              ) : mode === 'login' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Switch mode */}
          <p className="auth-switch">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button onClick={switchMode}>
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="auth-footer">
          Collaborative workspace for measuring team cognition
        </p>
      </div>
    </div>
  );
}
