/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCurrentUserApi,
  logoutApi,
  subscribeToSessionChanges,
} from '../services/authApi';
import type { UserSession } from '../services/authApi';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: UserSession | null;
  status: AuthStatus;
  setAuthenticatedUser: (user: UserSession) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeToSessionChanges((authenticated) => {
      if (!active) return;
      if (!authenticated) {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    void getCurrentUserApi()
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setStatus(currentUser ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('unauthenticated');
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    setAuthenticatedUser: (authenticatedUser) => {
      setUser(authenticatedUser);
      setStatus('authenticated');
    },
    signOut: async () => {
      await logoutApi();
      setUser(null);
      setStatus('unauthenticated');
    },
  }), [status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
