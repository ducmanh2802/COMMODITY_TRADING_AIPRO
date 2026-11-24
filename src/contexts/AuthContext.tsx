import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Auth, User } from 'firebase/auth';
import {
  getAuthModules,
  getFirestoreModules,
  getLoadedAuthModules,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
  type FirestoreConnectionState,
} from '../firebase';
import type { Timeframe, TradingStyle } from '../shared/types/instrument';
import type { AccountCurrency, DisplayTimezone, UserRiskSettings } from '../shared/types/risk';

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

// Allowed enum values — must stay in sync with firestore.rules (isValidUserSettings).
const TRADING_STYLES: readonly TradingStyle[] = ['SCALPING', 'INTRADAY', 'SWING', 'POSITION'];
const TIMEFRAMES: readonly Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
const DISPLAY_TIMEZONES: readonly DisplayTimezone[] = [
  'Asia/Ho_Chi_Minh',
  'UTC',
  'America/Chicago',
  'Europe/London',
];
const ACCOUNT_CURRENCIES: readonly AccountCurrency[] = ['USD', 'VND'];

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  firestoreStatus: FirestoreConnectionState;
  settings: UserRiskSettings;
  settingsLoaded: boolean;
  authError: string | null;
  settingsError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  saveSettings: (updates: Partial<Omit<UserRiskSettings, 'userId'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreConnectionState>('SIGNED_OUT');
  const [settings, setSettings] = useState<UserRiskSettings>({
    userId: 'anonymous',
    ...DEFAULT_USER_SETTINGS,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  // uid of the verified user whose profile/settings bootstrap has finished (success or failure).
  // The settings listener is attached only after this, avoiding a race with doc creation.
  const [bootstrappedUid, setBootstrappedUid] = useState<string | null>(null);

  // Firestore (large chunk) is loaded only once a user signs in; anonymous sessions never need it.
  const signedInUid = user?.uid ?? null;
  useEffect(() => {
    if (!signedInUid) {
      setFirestoreStatus('SIGNED_OUT');
      return;
    }
    let cancelled = false;
    setFirestoreStatus('CHECKING');
    testFirestoreConnection()
      .then((state) => {
        if (!cancelled) setFirestoreStatus(state);
      })
      .catch(() => {
        if (!cancelled) setFirestoreStatus('ERROR');
      });
    return () => {
      cancelled = true;
    };
  }, [signedInUid]);

  // Warm up firebase/auth when the user approaches a sign-in button (data-signin) so the popup opens synchronously on click.
  useEffect(() => {
    const warm = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-signin]')) void getAuthModules().catch(() => {});
    };
    const evs = ['pointerover', 'focusin', 'pointerdown', 'touchstart'];
    evs.forEach((n) => document.addEventListener(n, warm, { capture: true, passive: true }));
    return () => evs.forEach((n) => document.removeEventListener(n, warm, { capture: true }));
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: () => void = () => {};
    let authInstance: Auth | null = null;

    // Firebase Auth is loaded after first paint (idle) so it never blocks LCP.
    const startAuth = () => {
      void getAuthModules()
        .then(({ auth, onAuthStateChanged }) => {
          if (disposed) return;
          authInstance = auth;
          unsubscribe = onAuthStateChanged(auth, handleAuthChange);
        })
        .catch((err) => {
          if (disposed) return;
          setAuthError(err instanceof Error ? err.message : 'Could not load sign-in.');
          setAuthReady(true);
          setSettingsLoaded(true);
        });
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    if (typeof w.requestIdleCallback === 'function') idleId = w.requestIdleCallback(startAuth, { timeout: 2500 });
    else timerId = setTimeout(startAuth, 1200);

    const handleAuthChange = (nextUser: User | null) => {
      setUser(nextUser);
      setAuthReady(true);
      setAuthError(null);
      setSettingsError(null);
      setBootstrappedUid(null);
      setSettings({ userId: nextUser?.uid ?? 'anonymous', ...DEFAULT_USER_SETTINGS });

      if (!nextUser) {
        setSettingsLoaded(true);
        return;
      }

      if (!nextUser.emailVerified || !nextUser.email) {
        setAuthError('Verified email required for Cloud Firestore persistence.');
        setSettingsLoaded(true);
        return;
      }

      setSettingsLoaded(false);
      void bootstrapUserDocs(nextUser);
    };

    // Ensures profile + settings docs exist. Never throws; errors become UI state.
    async function bootstrapUserDocs(nextUser: User): Promise<void> {
      const isCurrent = () => authInstance?.currentUser?.uid === nextUser.uid;
      const email = nextUser.email ?? '';

      const userPath = `users/${nextUser.uid}`;
      let fsm: Awaited<ReturnType<typeof getFirestoreModules>>;
      try {
        fsm = await getFirestoreModules();
      } catch (err) {
        const info = handleFirestoreError(err, OperationType.WRITE, userPath);
        if (isCurrent()) {
          setAuthError(`Could not sync user profile: ${info.userMessage}`);
          setSettingsError(`Could not initialize settings: ${info.userMessage}`);
          setBootstrappedUid(nextUser.uid);
        }
        return;
      }
      const { db, doc, getDoc, setDoc, updateDoc, serverTimestamp } = fsm;
      try {
        const userRef = doc(db, 'users', nextUser.uid);
        const userSnap = await getDoc(userRef);
        const safeName = (nextUser.displayName || email.split('@')[0] || 'Trader').slice(0, 120);
        const safeEmail = email.slice(0, 254);

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
        const info = handleFirestoreError(err, OperationType.WRITE, userPath);
        if (isCurrent()) setAuthError(`Could not sync user profile: ${info.userMessage}`);
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
        const info = handleFirestoreError(err, OperationType.WRITE, settingsPath);
        if (isCurrent()) setSettingsError(`Could not initialize settings: ${info.userMessage}`);
      } finally {
        // Always hand off to the listener (which also marks settingsLoaded on any outcome).
        if (isCurrent()) setBootstrappedUid(nextUser.uid);
      }
    }

    return () => {
      disposed = true;
      if (idleId !== null) w.cancelIdleCallback?.(idleId);
      if (timerId !== null) clearTimeout(timerId);
      unsubscribe();
    };
  }, []);

  // Attach onSnapshot listener only for a verified user whose bootstrap has completed.
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !user.email) {
      return;
    }
    if (bootstrappedUid !== user.uid) {
      return;
    }

    const uid = user.uid;
    const settingsPath = `userSettings/${uid}`;
    let disposed = false;
    let unsubSettings: (() => void) | null = null;
    void getFirestoreModules()
      .then(({ db, doc, onSnapshot }) => {
        if (disposed) return;
        unsubSettings = onSnapshot(
      doc(db, 'userSettings', uid),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSettings({
            userId: uid,
            accountEquity: finiteOr(data.accountEquity, DEFAULT_USER_SETTINGS.accountEquity),
            accountCurrency: isOneOf(ACCOUNT_CURRENCIES, data.accountCurrency)
              ? data.accountCurrency
              : DEFAULT_USER_SETTINGS.accountCurrency,
            riskPercentagePerTrade: finiteOr(
              data.riskPercentagePerTrade,
              DEFAULT_USER_SETTINGS.riskPercentagePerTrade
            ),
            dailyLossLimitPct: finiteOr(data.dailyLossLimitPct, DEFAULT_USER_SETTINGS.dailyLossLimitPct),
            maxOpenPositions: Math.trunc(
              finiteOr(data.maxOpenPositions, DEFAULT_USER_SETTINGS.maxOpenPositions)
            ),
            maxPortfolioRiskPct: finiteOr(
              data.maxPortfolioRiskPct,
              DEFAULT_USER_SETTINGS.maxPortfolioRiskPct
            ),
            maxContractsPerInstrument: Math.trunc(
              finiteOr(data.maxContractsPerInstrument, DEFAULT_USER_SETTINGS.maxContractsPerInstrument)
            ),
            defaultTradingStyle: isOneOf(TRADING_STYLES, data.defaultTradingStyle)
              ? data.defaultTradingStyle
              : DEFAULT_USER_SETTINGS.defaultTradingStyle,
            defaultTimeframe: isOneOf(TIMEFRAMES, data.defaultTimeframe)
              ? data.defaultTimeframe
              : DEFAULT_USER_SETTINGS.defaultTimeframe,
            displayTimezone: isOneOf(DISPLAY_TIMEZONES, data.displayTimezone)
              ? data.displayTimezone
              : DEFAULT_USER_SETTINGS.displayTimezone,
          });
        }
        setSettingsLoaded(true);
      },
      (err) => {
        const info = handleFirestoreError(err, OperationType.GET, settingsPath);
        setSettingsError(`Could not load settings: ${info.userMessage}`);
        setSettingsLoaded(true);
      }
    );
      })
      .catch((err) => {
        if (disposed) return;
        const info = handleFirestoreError(err, OperationType.GET, settingsPath);
        setSettingsError(`Could not load settings: ${info.userMessage}`);
        setSettingsLoaded(true);
      });

    return () => {
      disposed = true;
      unsubSettings?.();
    };
  }, [authReady, user, bootstrappedUid]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const m = getLoadedAuthModules() ?? (await getAuthModules());
      await m.signInWithPopup(m.auth, m.googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      const m = getLoadedAuthModules() ?? (await getAuthModules());
      await m.signOut(m.auth);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign out failed.');
    }
  }, []);

  const saveSettings = useCallback(
    async (updates: Partial<Omit<UserRiskSettings, 'userId'>>) => {
      if (!user || !user.emailVerified) {
        throw new Error('Authentication with verified email is required to save settings.');
      }

      const accountCurrency = updates.accountCurrency ?? settings.accountCurrency;
      const defaultTradingStyle = updates.defaultTradingStyle ?? settings.defaultTradingStyle;
      const defaultTimeframe = updates.defaultTimeframe ?? settings.defaultTimeframe;
      const displayTimezone = updates.displayTimezone ?? settings.displayTimezone;

      if (!isOneOf(ACCOUNT_CURRENCIES, accountCurrency)) {
        throw new Error(`Invalid account currency. Allowed: ${ACCOUNT_CURRENCIES.join(', ')}.`);
      }
      if (!isOneOf(TRADING_STYLES, defaultTradingStyle)) {
        throw new Error(`Invalid trading style. Allowed: ${TRADING_STYLES.join(', ')}.`);
      }
      if (!isOneOf(TIMEFRAMES, defaultTimeframe)) {
        throw new Error(`Invalid timeframe. Allowed: ${TIMEFRAMES.join(', ')}.`);
      }
      if (!isOneOf(DISPLAY_TIMEZONES, displayTimezone)) {
        throw new Error(`Invalid display timezone. Allowed: ${DISPLAY_TIMEZONES.join(', ')}.`);
      }

      const numeric = {
        accountEquity: Number(updates.accountEquity ?? settings.accountEquity),
        riskPercentagePerTrade: Number(updates.riskPercentagePerTrade ?? settings.riskPercentagePerTrade),
        dailyLossLimitPct: Number(updates.dailyLossLimitPct ?? settings.dailyLossLimitPct),
        maxOpenPositions: Number(updates.maxOpenPositions ?? settings.maxOpenPositions),
        maxPortfolioRiskPct: Number(updates.maxPortfolioRiskPct ?? settings.maxPortfolioRiskPct),
        maxContractsPerInstrument: Number(
          updates.maxContractsPerInstrument ?? settings.maxContractsPerInstrument
        ),
      };
      const nonFinite = Object.entries(numeric).find(([, v]) => !Number.isFinite(v));
      if (nonFinite) {
        throw new Error(`Invalid numeric value for ${nonFinite[0]}.`);
      }

      // Clamp to the bounds enforced by firestore.rules (isValidUserSettings).
      const sanitized = {
        accountEquity: Math.max(0, Math.min(1_000_000_000_000, numeric.accountEquity)),
        accountCurrency,
        riskPercentagePerTrade: Math.max(0.05, Math.min(10, numeric.riskPercentagePerTrade)),
        dailyLossLimitPct: Math.max(0.5, Math.min(25, numeric.dailyLossLimitPct)),
        maxOpenPositions: Math.max(1, Math.min(50, Math.trunc(numeric.maxOpenPositions))),
        maxPortfolioRiskPct: Math.max(0.5, Math.min(50, numeric.maxPortfolioRiskPct)),
        maxContractsPerInstrument: Math.max(
          1,
          Math.min(100, Math.trunc(numeric.maxContractsPerInstrument))
        ),
        defaultTradingStyle,
        defaultTimeframe,
        displayTimezone,
      };

      const settingsPath = `userSettings/${user.uid}`;
      const { db, doc, collection, writeBatch, serverTimestamp } = await getFirestoreModules();
      // Firestore auto-id: 20 alphanumeric chars, satisfies isValidId in firestore.rules.
      const logRef = doc(collection(db, 'auditLogs'));

      // Settings update + audit log are committed atomically.
      const batch = writeBatch(db);
      batch.update(doc(db, 'userSettings', user.uid), {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
      // Fields must exactly match isValidAuditLog: userId, action, resource, createdAt.
      batch.set(logRef, {
        userId: user.uid,
        action: 'UPDATE_USER_SETTINGS',
        resource: settingsPath,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        const info = handleFirestoreError(err, OperationType.WRITE, settingsPath);
        throw new Error(`Failed to save settings: ${info.userMessage}`);
      }
      setSettingsError(null);
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
        settingsError,
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
