import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
  type FirestoreConnectionState,
} from '../firebase';
import type { UserRiskSettings } from '../shared/types/risk';

export const DEFAULT_USER_SETTINGS: Omit<UserRiskSettings, 'userId'> = {
  accountEquity: 10000,
  accountCurrency: 'USD',
  riskPercentagePerTrade: 1.0,
  dailyLossLimitPct: 3.0,
  maxOpenPositions: 4,
  maxPortfolioRiskPct: 5.0,
  maxContractsPerInstrument: 5,
  defaultTradingStyle: 'SWING',
  defaultTimeframe: 'H4',
  displayTimezone: 'Asia/Ho_Chi_Minh',
};

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  firestoreStatus: FirestoreConnectionState;
  settings: UserRiskSettings;
  settingsLoaded: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  saveSettings: (updates: Partial<Omit<UserRiskSettings, 'userId'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreConnectionState>('CHECKING');
  const [settings, setSettings] = useState<UserRiskSettings>({
    userId: 'anonymous',
    ...DEFAULT_USER_SETTINGS,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void testFirestoreConnection().then(setFirestoreStatus);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setAuthError(null);

      if (!nextUser) {
        setSettings({ userId: 'anonymous', ...DEFAULT_USER_SETTINGS });
        setSettingsLoaded(true);
        return;
      }

      if (!nextUser.emailVerified || !nextUser.email) {
        setAuthError('Verified email required for Cloud Firestore persistence.');
        setSettingsLoaded(true);
        return;
      }

      const userPath = `users/${nextUser.uid}`;
      try {
        const userRef = doc(db, 'users', nextUser.uid);
        const userSnap = await getDoc(userRef);
        const safeName = (nextUser.displayName || nextUser.email.split('@')[0] || 'Trader').slice(0, 120);
        const safeEmail = nextUser.email.slice(0, 254);

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: nextUser.uid,
            email: safeEmail,
            displayName: safeName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(userRef, {
            email: safeEmail,
            displayName: safeName,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, userPath);
      }

      const settingsPath = `userSettings/${nextUser.uid}`;
      try {
        const settingsRef = doc(db, 'userSettings', nextUser.uid);
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
          await setDoc(settingsRef, {
            userId: nextUser.uid,
            ...DEFAULT_USER_SETTINGS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, settingsPath);
      }
    });

    return () => unsubscribe();
  }, []);

  // Attach onSnapshot listener strictly when auth is ready and user is authenticated & verified
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      return;
    }

    const settingsPath = `userSettings/${user.uid}`;
    const settingsRef = doc(db, 'userSettings', user.uid);
    const unsubSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSettings({
            userId: user.uid,
            accountEquity: Number(data.accountEquity ?? DEFAULT_USER_SETTINGS.accountEquity),
            accountCurrency: data.accountCurrency === 'VND' ? 'VND' : 'USD',
            riskPercentagePerTrade: Number(
              data.riskPercentagePerTrade ?? DEFAULT_USER_SETTINGS.riskPercentagePerTrade
            ),
            dailyLossLimitPct: Number(
              data.dailyLossLimitPct ?? DEFAULT_USER_SETTINGS.dailyLossLimitPct
            ),
            maxOpenPositions: Math.trunc(
              Number(data.maxOpenPositions ?? DEFAULT_USER_SETTINGS.maxOpenPositions)
            ),
            maxPortfolioRiskPct: Number(
              data.maxPortfolioRiskPct ?? DEFAULT_USER_SETTINGS.maxPortfolioRiskPct
            ),
            maxContractsPerInstrument: Math.trunc(
              Number(data.maxContractsPerInstrument ?? DEFAULT_USER_SETTINGS.maxContractsPerInstrument)
            ),
            defaultTradingStyle:
              data.defaultTradingStyle ?? DEFAULT_USER_SETTINGS.defaultTradingStyle,
            defaultTimeframe: data.defaultTimeframe ?? DEFAULT_USER_SETTINGS.defaultTimeframe,
            displayTimezone: data.displayTimezone ?? DEFAULT_USER_SETTINGS.displayTimezone,
          });
        }
        setSettingsLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, settingsPath);
      }
    );

    return () => unsubSettings();
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const saveSettings = useCallback(
    async (updates: Partial<Omit<UserRiskSettings, 'userId'>>) => {
      if (!user || !user.emailVerified) {
        throw new Error('Authentication with verified email is required to save settings.');
      }

      // Clamp and validate payload strictly matching firebase-blueprint.json & firestore.rules
      const sanitized = {
        accountEquity: Math.max(
          0,
          Math.min(1_000_000_000_000, Number(updates.accountEquity ?? settings.accountEquity))
        ),
        accountCurrency: (updates.accountCurrency ?? settings.accountCurrency) === 'VND' ? 'VND' : 'USD',
        riskPercentagePerTrade: Math.max(
          0.05,
          Math.min(10, Number(updates.riskPercentagePerTrade ?? settings.riskPercentagePerTrade))
        ),
        dailyLossLimitPct: Math.max(
          0.5,
          Math.min(25, Number(updates.dailyLossLimitPct ?? settings.dailyLossLimitPct))
        ),
        maxOpenPositions: Math.max(
          1,
          Math.min(50, Math.trunc(Number(updates.maxOpenPositions ?? settings.maxOpenPositions)))
        ),
        maxPortfolioRiskPct: Math.max(
          0.5,
          Math.min(50, Number(updates.maxPortfolioRiskPct ?? settings.maxPortfolioRiskPct))
        ),
        maxContractsPerInstrument: Math.max(
          1,
          Math.min(
            100,
            Math.trunc(Number(updates.maxContractsPerInstrument ?? settings.maxContractsPerInstrument))
          )
        ),
        defaultTradingStyle: updates.defaultTradingStyle ?? settings.defaultTradingStyle,
        defaultTimeframe: updates.defaultTimeframe ?? settings.defaultTimeframe,
        displayTimezone: updates.displayTimezone ?? settings.displayTimezone,
      };

      const settingsPath = `userSettings/${user.uid}`;
      try {
        await updateDoc(doc(db, 'userSettings', user.uid), {
          ...sanitized,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, settingsPath);
      }

      const logId = `settings_${Date.now()}`;
      const logPath = `auditLogs/${logId}`;
      try {
        await setDoc(doc(db, 'auditLogs', logId), {
          userId: user.uid,
          action: 'UPDATE_USER_SETTINGS',
          resource: settingsPath,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, logPath);
      }
    },
    [user, settings]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        firestoreStatus,
        settings,
        settingsLoaded,
        authError,
        signInWithGoogle,
        logout,
        saveSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
