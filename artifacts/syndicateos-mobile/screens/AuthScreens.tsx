import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { changeCredential, getMe, login, resolveCompany, useReadinessCheck, type LoginInput } from '@workspace/api-client-react';
import { BrandBackdrop, BrandLogo } from '@/components/Brand';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PinField } from '@/components/PinField';
import { Banner, Btn, Card, Field } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { errMessage, httpStatus, isUnavailable, reportError, useAuth } from '@/lib/session';

function utf8Len(v: string) {
  let n = 0;
  for (const ch of v) {
    const p = ch.codePointAt(0) ?? 0;
    n += p < 0x80 ? 1 : p < 0x800 ? 2 : p < 0x10000 ? 3 : 4;
  }
  return n;
}

function Frame({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <BrandBackdrop>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          st.frame,
          { paddingTop: Math.max(24, insets.top + 12), paddingBottom: Math.max(24, insets.bottom + 24) },
        ]}
        bottomOffset={24}
        extraKeyboardSpace={20}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={st.brand}>
          <BrandLogo width={240} />
        </View>
        <View style={{ width: '100%', maxWidth: 440 }}>{children}</View>
      </KeyboardAwareScrollViewCompat>
    </BrandBackdrop>
  );
}

function Notices({ error }: { error: { text: string; infra: boolean } | null }) {
  const { bootError, retryBoot } = useAuth();
  const ready = useReadinessCheck({ query: { queryKey: ['readyz'], retry: false, refetchInterval: 30000 } });
  return (
    <>
      {ready.isError ? (
        <Banner tone="warn" title="Infrastructure pending" text="The SyndicateOS database is not reachable yet, so sign-in is unavailable." action={{ label: 'Check again', onPress: () => void ready.refetch() }} />
      ) : null}
      {bootError ? <Banner tone="warn" title="Could not restore your session" text={bootError} action={{ label: 'Retry', onPress: retryBoot }} /> : null}
      {error ? <Banner tone={error.infra ? 'warn' : 'error'} title={error.infra ? 'Infrastructure pending' : 'Sign-in failed'} text={error.text} /> : null}
    </>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  const c = useColors();
  return (
    <>
      <Text style={{ color: c.foreground, fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.8, marginBottom: 6 }}>{title}</Text>
      <Text style={{ color: c.mutedForeground, marginBottom: 22, lineHeight: 20 }}>{text}</Text>
    </>
  );
}

function normalizeMobile(v: string) {
  let d = v.replace(/[^0-9]/g, '');
  if (d.length >= 12 && d.startsWith('91')) d = d.slice(2);
  return d.slice(0, 10);
}
const PIN_RE = /^[0-9]{6}$/;
const MOBILE_RE = /^[6-9][0-9]{9}$/;

function LinkBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 10, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: c.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}

/** Client entry: step 1 company code, step 2 mobile + six-digit PIN. */
export function LoginScreen() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [clientCode, setClientCode] = useState('');
  const [firmName, setFirmName] = useState('');
  const [resolvedCode, setResolvedCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [credential, setCredential] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; infra: boolean } | null>(null);
  const reqId = useRef(0);
  const code = clientCode.trim();
  const pending = resolving || busy;

  const next = async () => {
    if (pending) return;
    if (!code) return setCodeErr('Enter your company code.');
    if (code.length > 32) return setCodeErr('Company codes are at most 32 characters.');
    setCodeErr(null);
    setError(null);
    const id = ++reqId.current;
    setResolving(true);
    try {
      const res = await resolveCompany({ clientCode: code });
      if (id !== reqId.current) return;
      setFirmName(res.name);
      setResolvedCode(res.clientCode || code);
      setStep(2);
    } catch (e) {
      if (id !== reqId.current) return;
      setError({ text: errMessage(e), infra: isUnavailable(e) });
    } finally {
      if (id === reqId.current) setResolving(false);
    }
  };

  const back = () => {
    if (busy) return;
    reqId.current++;
    setResolving(false);
    setStep(1);
    setFirmName('');
    setResolvedCode('');
    setCredential('');
    setLegacy(false);
    setError(null);
    setCodeErr(null);
  };

  const submit = async () => {
    if (busy) return;
    if (!MOBILE_RE.test(mobile)) return setError({ text: 'Enter a valid 10-digit Indian mobile number.', infra: false });
    if (legacy) {
      if (!credential) return setError({ text: 'Enter your previous credential.', infra: false });
      if (utf8Len(credential) > 72) return setError({ text: 'Previous credential is too long.', infra: false });
    } else if (!PIN_RE.test(credential)) {
      return setError({ text: 'Enter your six-digit PIN.', infra: false });
    }
    setBusy(true);
    setError(null);
    try {
      const input: LoginInput = { role: 'CLIENT', clientCode: resolvedCode, mobile: `+91${mobile}`, credential };
      const res = await login(input);
      setCredential('');
      await signIn(res);
    } catch (e) {
      setError({ text: errMessage(e), infra: isUnavailable(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      {step === 1 ? (
        <>
          <Heading title="Enter your company workspace" text="Use the company code your firm gave you. Your workspace opens with the screens set up for your sector." />
          <Card>
            <Notices error={error} />
            <Field label="Company code" value={clientCode} onChangeText={(v) => { setClientCode(v); setCodeErr(null); setError(null); }} error={codeErr} editable={!resolving} onSubmit={() => void next()} autoFocus testID="input-client-code" />
            <Btn label={resolving ? 'Checking' : 'Next'} icon="arrow-right" onPress={() => void next()} loading={resolving} disabled={pending} testID="button-next" />
          </Card>
        </>
      ) : (
        <>
          <Heading title={firmName} text="Sign in with your registered mobile number and PIN." />
          <Card>
            <Notices error={error} />
            <Field label="Mobile number (+91)" value={mobile} onChangeText={(v) => setMobile(normalizeMobile(v))} keyboardType="phone-pad" hint="10 digits, without +91." autoFocus editable={!busy} onSubmit={() => void submit()} testID="input-mobile" />
            {legacy ? (
              <Field label="Previous credential" value={credential} onChangeText={setCredential} secure editable={!busy} onSubmit={() => void submit()} hint="After a verified sign-in you must set a new six-digit PIN." testID="input-credential" />
            ) : (
              <PinField label="PIN" value={credential} onChangeText={setCredential} editable={!busy} onSubmit={() => void submit()} testID="input-credential" />
            )}
            <View style={{ gap: 8 }}>
              <Btn label={busy ? 'Signing in' : 'Sign in'} icon="log-in" onPress={() => void submit()} loading={busy} testID="button-login" />
              <Btn label="Change company" icon="arrow-left" variant="ghost" disabled={busy} onPress={back} testID="button-back" />
            </View>
          </Card>
        </>
      )}
    </Frame>
  );
}

/** Separate owner entry; no company code. */
export function OwnerLoginScreen() {
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; infra: boolean } | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!mobile.trim() || !credential) return setError({ text: 'Enter your mobile number and credential.', infra: false });
    setBusy(true);
    setError(null);
    try {
      const res = await login({ role: 'OWNER', mobile: mobile.trim(), credential });
      setCredential('');
      await signIn(res);
    } catch (e) {
      setError({ text: errMessage(e), infra: isUnavailable(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <Heading title="Owner management" text="Firms, sectors and configuration releases." />
      <Card>
        <Notices error={error} />
        <Field label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" autoFocus testID="input-mobile" />
        <Field label="Credential" value={credential} onChangeText={setCredential} secure onSubmit={() => void submit()} testID="input-credential" />
        <Btn label={busy ? 'Signing in' : 'Sign in'} icon="log-in" onPress={() => void submit()} loading={busy} testID="button-login" />
      </Card>
    </Frame>
  );
}

export function ResetGate() {
  const c = useColors();
  const { account, signIn, signOut } = useAuth();
  const isOwner = account?.role === 'OWNER';
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!cur) return setError('Enter your current credential.');
    if (!isOwner && !legacy && !PIN_RE.test(cur)) return setError('Enter your current six-digit PIN.');
    if (!isOwner && legacy && utf8Len(cur) > 72) return setError('Previous credential is too long.');
    if (isOwner) {
      if (next.length < 8) return setError('New credential must be at least 8 characters.');
      if (utf8Len(next) > 72) return setError('New credential must be at most 72 bytes.');
    } else if (!PIN_RE.test(next)) {
      return setError('New PIN must be exactly six digits.');
    }
    if (next !== again) return setError(isOwner ? 'The new credentials do not match.' : 'The new PINs do not match.');
    if (next === cur) return setError(isOwner ? 'Choose a credential different from the current one.' : 'Choose a PIN different from the current one.');
    setBusy(true);
    setError(null);
    try {
      const res = await changeCredential({ currentCredential: cur, newCredential: next });
      setCur('');
      setNext('');
      setAgain('');
      await signIn(res);
    } catch (e) {
      setError(errMessage(e));
      if (httpStatus(e) === 401) {
        try {
          await getMe();
        } catch (me) {
          reportError(me);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <Card>
        <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 4, color: c.foreground }}>{isOwner ? 'Set a private credential' : 'Set your six-digit PIN'}</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, marginBottom: 14, color: c.mutedForeground }}>
          {isOwner
            ? `${account?.displayName}, your account uses a temporary credential. Nothing in the workspace opens until you replace it.`
            : `${account?.displayName}, your account uses a temporary or previous credential. Nothing in the workspace opens until you set a six-digit PIN.`}
        </Text>
        {isOwner ? (
          <>
            <Field label="Current (temporary) credential" value={cur} onChangeText={setCur} secure />
            <Field label="New credential" value={next} onChangeText={setNext} secure hint="At least 8 characters." />
            <Field label="Repeat new credential" value={again} onChangeText={setAgain} secure onSubmit={() => void submit()} />
          </>
        ) : (
          <>
            {legacy ? (
              <Field label="Previous credential" value={cur} onChangeText={setCur} secure editable={!busy} />
            ) : (
              <PinField label="Current (temporary) PIN" value={cur} onChangeText={setCur} editable={!busy} />
            )}
            <LinkBtn label={legacy ? 'Use six-digit PIN' : 'Use previous credential'} disabled={busy} onPress={() => { setLegacy(!legacy); setCur(''); setError(null); }} />
            <PinField label="New PIN" value={next} onChangeText={setNext} editable={!busy} hint="Exactly six digits." />
            <PinField label="Repeat new PIN" value={again} onChangeText={setAgain} editable={!busy} onSubmit={() => void submit()} />
          </>
        )}
        {error ? <Banner tone="error" title="Could not update" text={error} /> : null}
        <View style={{ gap: 8 }}>
          <Btn label="Save and continue" onPress={() => void submit()} loading={busy} />
          <Btn label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </Card>
    </Frame>
  );
}

const st = StyleSheet.create({
  frame: { flexGrow: 1, padding: 20, paddingVertical: 40, justifyContent: 'center', alignItems: 'center', gap: 26 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center' },
});
