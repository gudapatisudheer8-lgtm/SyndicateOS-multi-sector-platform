import React, { useEffect, useRef, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { Banner, Btn, Field } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { nativeApi } from '@/lib/native-api';
import { errMessage } from '@/lib/session';
import { InvitationMemory, invitationMessage, invitationExpiryText, marketingPortalEntry, normalizeAgentMobile, type InvitePayload } from '@/lib/marketingInvites';
import { Dialog } from '@/screens/ErpScreens';

type Create = Parameters<InvitationMemory['obtain']>[1];
type Note = { tone: 'ok' | 'warn' | 'error'; t: string } | null;

function portalEntry(): { url: string | null; error: string | null } {
  try {
    const url = marketingPortalEntry({
      platform: Platform.OS,
      domain: process.env.EXPO_PUBLIC_DOMAIN,
      origin: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
      development: __DEV__,
    });
    return { url, error: null };
  } catch (e) { return { url: null, error: errMessage(e) }; }
}

/** Accountant-only personal marketing invitation. Opening never POSTs; the cache lives in memory for this keyed scope only. */
export function NativeMarketingShare({ projectId, projectName, firmName, onClose }: { projectId: string; projectName: string; firmName: string; onClose: () => void }) {
  const c = useColors();
  const memory = useRef<InvitationMemory | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const scope = new InvitationMemory();
    memory.current = scope; alive.current = true;
    return () => { alive.current = false; scope.dispose(); memory.current = null; };
  }, []);

  const mobileOk = normalizeAgentMobile(phone) !== null;
  const canAct = !pending && name.trim().length > 0 && name.trim().length <= 100 && mobileOk;

  const obtain = async (): Promise<{ inv: InvitePayload; text: string } | null> => {
    const entry = portalEntry();
    if (!entry.url) { setNote({ tone: 'error', t: entry.error || 'The marketing portal address is not configured for this build. No invitation was created.' }); return null; }
    const create: Create = (body) => nativeApi<Awaited<ReturnType<Create>>>('/api/marketing/invitations', { method: 'POST', body });
    const scope = memory.current;
    if (!scope) return null;
    const inv = await scope.obtain({ projectId, agentName: name.trim(), mobile: phone, portalEntry: entry.url }, create);
    const text = invitationMessage({ projectName, firmName, invite: inv });
    if (!alive.current) return null;
    setInvite(inv); setMessage(text);
    return { inv, text };
  };

  const run = async (deliver: (text: string) => Promise<Note>) => {
    if (lock.current) return;
    lock.current = true; setPending(true); setNote(null);
    try {
      const got = await obtain();
      if (!got || !alive.current) return;
      const result = await deliver(got.text);
      if (alive.current) setNote(result);
    } catch (e) {
      if (alive.current) setNote({ tone: 'error', t: errMessage(e) });
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
    }
  };

  const copyWeb = async (text: string): Promise<NonNullable<Note>> => {
    try {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clip?.writeText) throw new Error('unavailable');
      await clip.writeText(text);
      return { tone: 'ok', t: 'Full invitation copied, including any temporary PIN. Send it privately to the agent.' };
    } catch {
      return { tone: 'warn', t: 'Copying was blocked. Select the invitation text below and copy it manually.' };
    }
  };

  const share = (text: string): Promise<Note> => (async () => {
    if (Platform.OS !== 'web') {
      try {
        const r = await Share.share({ message: text });
        if (r.action === Share.dismissedAction) return { tone: 'warn', t: 'Sharing was cancelled. The invitation is kept below; share again or copy it manually.' } as Note;
        return { tone: 'ok', t: 'Invitation handed to the share sheet.' } as Note;
      } catch {
        return { tone: 'warn', t: 'The share sheet could not open. Select the invitation text below and send it manually.' } as Note;
      }
    }
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : undefined;
    if (nav?.share) {
      try { await nav.share({ text }); return { tone: 'ok', t: 'Invitation shared.' } as Note; }
      catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return { tone: 'warn', t: 'Sharing was cancelled. The invitation is kept below.' } as Note;
      }
    }
    const copied = await copyWeb(text);
    return { ...copied, t: `${nav?.share ? 'The share sheet could not open.' : 'This browser does not support a share sheet.'} ${copied.t}` };
  })();

  const pin = invite?.requiresPinChange && invite.temporaryPin ? invite.temporaryPin : null;

  return (
    <Dialog title="Marketing Portal & Share Link" onClose={onClose}>
      <View style={{ borderRadius: 14, padding: 12, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#fcd34d', marginBottom: 12 }}>
        <Text style={{ color: '#451a03', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{projectName}</Text>
        <Text style={{ color: '#78350f', fontSize: 12, marginTop: 2 }}>Promoted by {firmName}. Each agent gets a personal link and signs in to the marketing portal with their own mobile number and PIN. Agents never see sold or booked prices.</Text>
      </View>
      <Field label="Agent / broker name *" value={name} onChangeText={(v) => { if (!pending) { setName(v); setInvite(null); setMessage(''); setNote(null); } }} editable={!pending} error={name.trim().length > 100 ? 'Use 100 characters or fewer.' : undefined} placeholder="Full name" testID="marketing-agent-name" />
      <Field label="Agent mobile *" value={phone} onChangeText={(v) => { if (!pending) { setPhone(v); setInvite(null); setMessage(''); setNote(null); } }} editable={!pending} keyboardType="phone-pad" placeholder="10-digit Indian mobile" error={phone.trim() && !mobileOk ? 'Enter a valid 10-digit Indian mobile number.' : undefined} testID="marketing-agent-mobile" />
      <Text style={{ color: c.mutedForeground, fontSize: 11, marginBottom: 10 }}>Nothing is created until you share or copy. Retries reuse this invitation until its activation deadline; sharing after that creates a fresh link without resetting an existing agent’s PIN.</Text>
      {note ? <Banner tone={note.tone} title={note.t} /> : null}
      <View style={{ gap: 8 }}>
        <Btn label={pending ? 'Preparing invitation...' : 'Share invitation'} icon="share-2" loading={pending} disabled={!canAct} onPress={() => void run(share)} testID="marketing-share" />
        {Platform.OS === 'web' ? <Btn label="Copy full invitation (link and PIN)" icon="copy" variant="ghost" disabled={!canAct} onPress={() => void run(copyWeb)} testID="marketing-copy" /> : null}
      </View>
      {invite ? <Text testID="marketing-expiry" selectable style={{ color: c.mutedForeground, fontSize: 12, marginTop: 12 }}>{invitationExpiryText(invite.activationExpiresAt)}</Text> : null}
      {pin ? <View style={{ marginTop: 12, borderRadius: 12, padding: 10, backgroundColor: c.warningSurface }}>
        <Text style={{ color: c.foreground, fontSize: 12 }}>New agent temporary PIN, share privately. The agent must change it at first sign-in.</Text>
        <Text selectable style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 4, marginTop: 4 }}>{pin}</Text>
      </View> : null}
      {message ? <View style={{ marginTop: 12 }}>
        <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', marginBottom: 4 }}>Invitation message (select to copy)</Text>
        <Text selectable testID="marketing-message" style={{ color: c.foreground, fontSize: 12, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, backgroundColor: c.muted }}>{message}</Text>
      </View> : null}
    </Dialog>
  );
}
