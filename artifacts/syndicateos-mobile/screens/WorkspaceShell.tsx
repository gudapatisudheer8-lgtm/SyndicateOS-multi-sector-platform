import { Feather } from '@expo/vector-icons';
import { guardLeave } from '@/lib/leaveGuard';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '@/components/Brand';
import { Banner, Btn, Field, Skeleton } from '@/components/ui';
import { changeCredential } from '@workspace/api-client-react';
import { setLang, useLang } from '@/screens/ErpScreens';
import { useColors } from '@/hooks/useColors';
import { errMessage, isUnavailable, useAuth } from '@/lib/session';
import { useWorkspace } from '@/lib/workspace';
import { OwnerFirms } from '@/screens/OwnerFirms';
import { OwnerSectors } from '@/screens/OwnerSectors';
import { SectorWorkspace, type Frame } from '@/screens/SectorInterface';
import { NativeNotificationBell } from '@/screens/NativeNotificationBell';

type Tab = 'firms' | 'sectors' | 'work';

/** mode 'owner' renders management only; 'client' renders only the sector workspace. */
export function WorkspaceShell({ mode, bell }: { mode: 'owner' | 'client'; bell?: React.ReactNode }) {
  const c = useColors();
  const { account, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  const owner = mode === 'owner';
  const [tab, setTab] = useState<Tab>(owner ? 'firms' : 'work');
  const q = useWorkspace(true);
  const ws = q.data;

  const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = owner
    ? [{ key: 'firms', label: 'Firms', icon: 'briefcase' }, { key: 'sectors', label: 'Sectors', icon: 'grid' }]
    : [{ key: 'work', label: account?.role === 'PARTNER' ? 'My projects' : 'Workspace', icon: 'layers' }];

  let body: React.ReactNode;
  if (q.isLoading) body = <Skeleton lines={4} />;
  else if (q.isError || !ws)
    body = (
      <Banner tone={isUnavailable(q.error) ? 'warn' : 'error'} title={isUnavailable(q.error) ? 'Infrastructure pending' : 'Workspace could not load'} text={errMessage(q.error)} action={{ label: 'Retry', onPress: () => void q.refetch() }} />
    );
  else if (owner && tab === 'firms') body = <OwnerFirms ws={ws} />;
  else if (owner && tab === 'sectors') body = <OwnerSectors ws={ws} />;
  else if (!owner && account) body = <SectorWorkspace ws={ws} account={account} />;

  const firm = !owner ? ws?.firms.find((f) => f.id === account?.firmId) ?? ws?.firms[0] : undefined;
  const company = !owner ? (firm ? `${firm.name} (${firm.clientCode})` : account?.clientCode) : null;
  const nav = (
    <View style={wide ? { gap: 6, marginTop: 24 } : { flexDirection: 'row', gap: 6 }}>
      {tabs.map((t) => {
        const on = t.key === tab;
        return (
          <Pressable key={t.key} onPress={() => (t.key === tab ? undefined : guardLeave(() => setTab(t.key)))} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
            <Feather name={t.icon} size={16} color={c.heroForeground} />
            <Text style={{ color: c.heroForeground, fontFamily: 'Inter_600SemiBold' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const head = (
    <View>
      <BrandLogo layout="horizontal" width={wide ? 150 : 116} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Text numberOfLines={1} style={{ color: c.heroForeground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>{firm ? firm.name : owner ? 'Owner console' : 'Workspace'}</Text>
      </View>
      <Text style={{ color: c.heroForeground, opacity: 0.65, fontSize: 12, marginTop: 4 }}>
        {account?.displayName}{firm ? ` · ${firm.clientCode}` : company ? ` · ${company}` : owner ? ' · Owner' : ''}
      </Text>
    </View>
  );

  if (!owner) {
    const frame: Frame = ({ selectors, nav, content, activeFirmId }) => {
      // Active firm comes from the selected sector/project in SectorWorkspace; account firm is only the fallback.
      const af = (activeFirmId ? ws?.firms.find((f) => f.id === activeFirmId) : undefined) ?? firm;
      return (
      <View style={{ flex: 1, backgroundColor: '#F4F4F6' }}>
        <View style={{ backgroundColor: '#FBFAF6', borderBottomWidth: 1, borderBottomColor: '#e7e5e4', paddingTop: Platform.OS === 'web' ? 10 : insets.top + 6, paddingHorizontal: wide ? 28 : 12, paddingBottom: 10, gap: 8, zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'Inter_900Black', fontWeight: 'normal', fontSize: 15, color: '#0f172a', letterSpacing: -1 }}>S<Text style={{ fontFamily: 'Inter_900Black', fontWeight: 'normal', color: '#451a03' }}>OS</Text></Text>
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontFamily: 'Inter_900Black', fontWeight: 'normal', fontSize: 16, color: '#0f172a' }}>Syndicate<Text style={{ fontFamily: 'Inter_900Black', fontWeight: 'normal', color: '#d97706' }}>OS</Text></Text>
                <Text numberOfLines={1} style={{ color: '#57534e', fontSize: 11 }}>{af ? af.name : 'No active firm assigned'} · {account?.role === 'PARTNER' ? 'Partner' : 'Accountant'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {account?.role === 'PARTNER' ? <CompactLang /> : null}
              {bell ?? <NativeNotificationBell />}
              <ProfileMenu name={account?.displayName ?? ''} role={account?.role === 'PARTNER' ? 'Partner' : 'Accountant'} firm={af ? `${af.name} (${af.clientCode})` : ''} onSignOut={() => guardLeave(() => void signOut())} />
            </View>
          </View>
          {selectors}
          {nav}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? 28 : 12, paddingBottom: 60, maxWidth: 1240, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      </View>
      );
    };
    if (ws && account && !q.isLoading) return <SectorWorkspace ws={ws} account={account} frame={frame} />;
    return <>{frame({ content: body })}</>;
  }

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: c.background }}>
      {wide ? (
        <View style={{ width: 240, backgroundColor: c.hero, padding: 20, justifyContent: 'space-between' }}>
          <View>{head}{nav}</View>
          <Btn label="Sign out" variant="ghost" icon="log-out" onPress={() => guardLeave(() => void signOut())} />
        </View>
      ) : (
        <View style={{ backgroundColor: c.hero, paddingTop: Platform.OS === 'web' ? 24 : insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            {head}
            <Pressable onPress={() => guardLeave(() => void signOut())} accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={10}>
              <Feather name="log-out" size={20} color={c.heroForeground} />
            </Pressable>
          </View>
          {tabs.length > 1 ? nav : null}
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? 32 : 16, paddingBottom: 60, maxWidth: 980, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {q.isFetching && !q.isLoading ? <Text style={{ color: c.mutedForeground, fontSize: 11, marginBottom: 6 }}>Refreshing…</Text> : null}
        {body}
      </ScrollView>
    </View>
  );
}

function CompactLang() {
  const { lang } = useLang();
  return (
    <View style={{ flexDirection: 'row', borderRadius: 10, backgroundColor: '#f3f4f6', padding: 2 }}>
      {(['en', 'te'] as const).map((l) => (
        <Pressable key={l} onPress={() => setLang(l)} accessibilityRole="button" accessibilityLabel={l === 'en' ? 'English' : 'Telugu'} style={{ paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, backgroundColor: lang === l ? '#FFB800' : 'transparent' }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#111827' }}>{l === 'en' ? 'En' : 'తె'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProfileMenu({ name, role, firm, onSignOut }: { name: string; role: string; firm: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState(false);
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [conf, setConf] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  const save = async () => {
    if (!cur || !next) return setMsg({ ok: false, t: 'Enter your current and new PIN.' });
    if (next !== conf) return setMsg({ ok: false, t: 'New PINs do not match.' });
    setBusy(true); setMsg(null);
    try { await changeCredential({ currentCredential: cur, newCredential: next }); setMsg({ ok: true, t: 'PIN changed.' }); setCur(''); setNext(''); setConf(''); }
    catch (e) { setMsg({ ok: false, t: errMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Profile menu" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFB800', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{initials}</Text>
      </Pressable>
      {open ? (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.25)' }}>
            <Pressable onPress={() => undefined} style={{ position: 'absolute', top: 64, right: 12, width: 290, backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', padding: 14 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', color: '#111827', fontSize: 15 }}>{name}</Text>
              <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>{role}{firm ? ` · ${firm}` : ''}</Text>
              {pin ? (
                <View>
                  <Field label="Current PIN" value={cur} onChangeText={setCur} secure keyboardType="numeric" />
                  <Field label="New PIN" value={next} onChangeText={setNext} secure keyboardType="numeric" />
                  <Field label="Confirm new PIN" value={conf} onChangeText={setConf} secure keyboardType="numeric" />
                  {msg ? <Text style={{ color: msg.ok ? '#15803d' : '#b91c1c', fontSize: 12, marginBottom: 8 }}>{msg.t}</Text> : null}
                  <Btn label="Save PIN" loading={busy} onPress={() => void save()} />
                  <View style={{ height: 6 }} />
                  <Btn label="Back" variant="ghost" onPress={() => { setPin(false); setMsg(null); }} />
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  <Btn label="Change PIN" variant="ghost" icon="lock" onPress={() => setPin(true)} />
                  <Btn label="Sign out" variant="ghost" icon="log-out" onPress={() => { setOpen(false); onSignOut(); }} />
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
