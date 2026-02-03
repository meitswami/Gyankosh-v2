import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { IndexAuthed } from './IndexAuthed';

export default function Index() {
  const { isLoggedIn, loading: authLoading, logout, user } = useAuth();
  const forcedLogoutRef = useRef(false);

  // Extra safety: if auth restore hangs on refresh/new tab, force logout quickly.
  useEffect(() => {
    if (!authLoading) return;

    const t = window.setTimeout(() => {
      if (forcedLogoutRef.current) return;
      forcedLogoutRef.current = true;
      console.warn('[auth] authLoading hang detected - forcing logout');
      logout();
    }, 4500);

    return () => window.clearTimeout(t);
  }, [authLoading, logout]);

  // If auth says we're logged out but the SPA navigation doesn't happen, hard-redirect.
  useEffect(() => {
    if (authLoading || isLoggedIn) return;
    const t = window.setTimeout(() => {
      if (window.location.pathname !== '/auth') {
        window.location.replace('/auth');
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [authLoading, isLoggedIn]);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <IndexAuthed user={user} onLogout={logout} />;
}

