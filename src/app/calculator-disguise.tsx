import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalcKey, type KeyVariant } from '@/components/calc-key';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluateExpression, formatResult } from '@/lib/calc-engine';
import {
  MAX_CODE_LENGTH,
  MIN_CODE_LENGTH,
  isBiometricAvailable,
  isBiometricEnabled,
  loadBiometricKey,
  unlockWithSecretCode,
} from '@/lib/vault-secret';
import { isUnlocked, unlock } from '@/lib/vault-session';
import {
  clearPinFailures,
  getLockoutState,
  recordPinFailure,
  remainingMs,
  type LockoutState,
} from '@/lib/vault-lockout';

type KeyAction =
  | { t: 'digit'; v: string }
  | { t: 'dot' }
  | { t: 'op'; v: string }
  | { t: 'eq' }
  | { t: 'clear' }
  | { t: 'back' }
  | { t: 'neg' };

interface KeyDef {
  label: string;
  variant: KeyVariant;
  action: KeyAction;
  span?: number;
}

interface CalcState {
  expr: string;
  evaluated: boolean;
}

const KEYS: KeyDef[][] = [
  [
    { label: 'C', variant: 'fn', action: { t: 'clear' } },
    { label: '⌫', variant: 'fn', action: { t: 'back' } },
    { label: '±', variant: 'fn', action: { t: 'neg' } },
    { label: '÷', variant: 'op', action: { t: 'op', v: '/' } },
  ],
  [
    { label: '7', variant: 'digit', action: { t: 'digit', v: '7' } },
    { label: '8', variant: 'digit', action: { t: 'digit', v: '8' } },
    { label: '9', variant: 'digit', action: { t: 'digit', v: '9' } },
    { label: '×', variant: 'op', action: { t: 'op', v: '*' } },
  ],
  [
    { label: '4', variant: 'digit', action: { t: 'digit', v: '4' } },
    { label: '5', variant: 'digit', action: { t: 'digit', v: '5' } },
    { label: '6', variant: 'digit', action: { t: 'digit', v: '6' } },
    { label: '−', variant: 'op', action: { t: 'op', v: '-' } },
  ],
  [
    { label: '1', variant: 'digit', action: { t: 'digit', v: '1' } },
    { label: '2', variant: 'digit', action: { t: 'digit', v: '2' } },
    { label: '3', variant: 'digit', action: { t: 'digit', v: '3' } },
    { label: '+', variant: 'op', action: { t: 'op', v: '+' } },
  ],
  [
    { label: '0', variant: 'digit', action: { t: 'digit', v: '0' }, span: 2 },
    { label: '.', variant: 'digit', action: { t: 'dot' } },
    { label: '=', variant: 'accent', action: { t: 'eq' } },
  ],
];

const MAX_EXPR = 24;
const MATCH_DEBOUNCE_MS = 300;
const DIGITS_ONLY = /^\d+$/;
const OP_TAIL_RE = /[+\-*/]$/;

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function displayExpr(expr: string): string {
  return expr.replace(/\*/g, '×').replace(/\//g, '÷');
}

function trailingNumberStart(expr: string): number {
  let i = expr.length;
  while (i > 0 && ((expr[i - 1] >= '0' && expr[i - 1] <= '9') || expr[i - 1] === '.')) i--;
  return i;
}

function applyKey(state: CalcState, action: KeyAction): CalcState {
  const { expr, evaluated } = state;
  const fresh = evaluated && (action.t === 'digit' || action.t === 'dot');

  switch (action.t) {
    case 'clear':
      return { expr: '', evaluated: false };

    case 'back':
      if (evaluated) return { expr: '', evaluated: false };
      return { expr: expr.slice(0, -1), evaluated: false };

    case 'digit': {
      let base = fresh ? '' : expr;
      if (base === '0') base = '';
      if (base.length >= MAX_EXPR) return state;
      return { expr: base + action.v, evaluated: false };
    }

    case 'dot': {
      const base = fresh ? '' : expr;
      if (base.length >= MAX_EXPR) return state;
      const start = trailingNumberStart(base);
      if (base.slice(start).includes('.')) return state;
      if (base === '' || OP_TAIL_RE.test(base)) return { expr: base + '0.', evaluated: false };
      return { expr: base + '.', evaluated: false };
    }

    case 'op': {
      if (expr === '') {
        return action.v === '-' ? { expr: '-', evaluated: false } : state;
      }
      let base = expr;
      while (OP_TAIL_RE.test(base)) base = base.slice(0, -1);
      if (base === '') {
        return action.v === '-' ? { expr: '-', evaluated: false } : state;
      }
      if (base.length >= MAX_EXPR) return state;
      return { expr: base + action.v, evaluated: false };
    }

    case 'neg': {
      const start = trailingNumberStart(expr);
      if (start === expr.length) return state;
      const prev = start > 0 ? expr[start - 1] : '';
      const prevPrev = start > 1 ? expr[start - 2] : '';
      const isUnaryMinus = prev === '-' && (start === 1 || /[+\-*/]/.test(prevPrev));
      if (isUnaryMinus) {
        return { expr: expr.slice(0, start - 1) + expr.slice(start), evaluated: false };
      }
      return { expr: expr.slice(0, start) + '-' + expr.slice(start), evaluated: false };
    }

    case 'eq': {
      const value = evaluateExpression(expr);
      if (value === null) return state;
      return { expr: formatResult(value), evaluated: true };
    }
  }
}

export default function CalculatorDisguiseScreen() {
  const theme = useTheme();
  const [calc, setCalc] = useState<CalcState>({ expr: '', evaluated: false });
  const [lockRemaining, setLockRemaining] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const navigatingRef = useRef(false);
  const biometricBusyRef = useRef(false);
  const verifyingRef = useRef(false);
  const lockoutRef = useRef<LockoutState | null>(null);
  const exprRef = useRef('');

  useEffect(() => {
    exprRef.current = calc.expr;
  }, [calc.expr]);

  useEffect(() => {
    if (navigatingRef.current) return;
    if (calc.evaluated) return;
    if (!DIGITS_ONLY.test(calc.expr)) return;
    if (calc.expr.length < MIN_CODE_LENGTH || calc.expr.length > MAX_CODE_LENGTH) return;

    const code = calc.expr;
    const timer = setTimeout(() => {
      void (async () => {
        if (verifyingRef.current || navigatingRef.current) return;

        // lockout gate: during backoff the code is not even verified
        if (lockoutRef.current === null) lockoutRef.current = await getLockoutState();
        const remaining = remainingMs(lockoutRef.current, Date.now());
        console.log(`[unlock] len=${code.length} fails=${lockoutRef.current?.fails ?? 0} remainingMs=${remaining}`);
        if (remaining > 0) {
          setLockRemaining(Math.ceil(remaining / 1000));
          return;
        }

        verifyingRef.current = true;
        const t0 = Date.now();
        try {
          const masterKey = await unlockWithSecretCode(code);
          console.log(`[unlock] verify done in ${Date.now() - t0}ms match=${masterKey !== null}`);
          if (masterKey === null) {
            // real verification, wrong code — count it
            lockoutRef.current = await recordPinFailure();
            const after = remainingMs(lockoutRef.current, Date.now());
            setLockRemaining(after > 0 ? Math.ceil(after / 1000) : 0);
            setNotice('Error'); // calculator-style hint, no vault wording
            return;
          }
          // Bail only if the user actually edited the expression while the
          // check ran — previously ANY keypress swallowed a successful unlock.
          if (navigatingRef.current || exprRef.current !== code) return;
          void clearPinFailures();
          lockoutRef.current = null;
          navigatingRef.current = true;
          unlock(masterKey);
          router.replace('/vault');
        } finally {
          verifyingRef.current = false;
        }
      })().catch((e) => {
        console.log(`[unlock] crashed: ${e instanceof Error ? e.message : String(e)}`);
      });
    }, MATCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [calc]);

  // tick the lockout countdown once per second while it is active
  const lockedOut = lockRemaining > 0;
  useEffect(() => {
    if (!lockedOut) return;
    const interval = setInterval(() => {
      setLockRemaining((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedOut]);

  // Gate: on mount and every foreground, offer biometric unlock when enabled.
  // Cancelled/failed prompts silently fall through to typing the code.
  useEffect(() => {
    const tryBiometric = async () => {
      if (navigatingRef.current || biometricBusyRef.current) return;
      if (isUnlocked()) return;
      if (exprRef.current !== '') return; // don't interrupt code entry
      biometricBusyRef.current = true;
      try {
        const [enabled, available] = await Promise.all([
          isBiometricEnabled(),
          isBiometricAvailable(),
        ]);
        if (!enabled || !available || navigatingRef.current || isUnlocked()) return;
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock',
          cancelLabel: 'Cancel',
          disableDeviceFallback: true,
        });
        if (!result.success || navigatingRef.current || isUnlocked()) return;
        const masterKey = await loadBiometricKey();
        if (!masterKey || navigatingRef.current) return;
        navigatingRef.current = true;
        unlock(masterKey);
        router.replace('/vault');
      } catch {
        // any failure just leaves the calculator usable
      } finally {
        biometricBusyRef.current = false;
      }
    };

    void tryBiometric();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tryBiometric();
    });
    return () => subscription.remove();
  }, []);

  const onPress = (action: KeyAction) => {
    setNotice(null);
    setCalc((current) => applyKey(current, action));
  };

  const preview =
    !calc.evaluated && /[+\-*/]/.test(calc.expr) ? evaluateExpression(calc.expr) : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.inner}>
          <View style={styles.display}>
            <Text
              style={[styles.displayText, { color: theme.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.35}
              selectable={false}>
              {calc.expr === '' ? '0' : displayExpr(calc.expr)}
            </Text>
            <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
              {lockRemaining > 0
                ? `Locked · ${formatCountdown(lockRemaining)}`
                : notice !== null
                  ? `= ${notice}`
                  : preview !== null && Number.isFinite(preview)
                    ? `= ${formatResult(preview)}`
                    : ''}
            </Text>
          </View>

          <View style={[styles.keypad, { backgroundColor: theme.backgroundSelected }]}>
            {KEYS.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={[styles.row, { backgroundColor: theme.background }]}>
                {row.map((key) => (
                  <CalcKey
                    key={key.label}
                    label={key.label}
                    variant={key.variant}
                    span={key.span}
                    onPress={() => onPress(key.action)}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const LINE = 1;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  display: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.four,
    gap: Spacing.one,
    minHeight: 140,
  },
  displayText: {
    fontFamily: Fonts.mono,
    fontSize: 56,
    textAlign: 'right',
    width: '100%',
  },
  preview: {
    fontFamily: Fonts.mono,
    fontSize: 18,
    textAlign: 'right',
    width: '100%',
    minHeight: 24,
  },
  keypad: {
    flex: 2,
    gap: LINE,
    padding: LINE,
    borderRadius: 0,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: LINE,
  },
});
