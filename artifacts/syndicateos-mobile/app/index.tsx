import React from 'react';
import { guardLeave } from '@/lib/leaveGuard';
import { ActivityIndicator, Text, View } from 'react-native';
import { Btn } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/lib/session';
import { LoginScreen, ResetGate } from '@/screens/AuthScreens';
import { WorkspaceShell } from '@/screens/WorkspaceShell';

export default function Index() {
  const c = useColors();
  const { phase, account, signOut, portal } = useAuth();
  if (phase === 'booting')
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.hero }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  if (phase === 'anon' || !account) return <LoginScreen />;
  if (account.role === 'OWNER' || portal !== 'client')
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.hero, padding: 24, gap: 14 }}>
        <Text style={{ color: c.heroForeground, fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>This session cannot open a company workspace.</Text>
        <Btn label="Sign out" variant="ghost" icon="log-out" onPress={() => guardLeave(() => void signOut())} />
      </View>
    );
  if (account.mustChangeCredential) return <ResetGate />;
  return <WorkspaceShell mode="client" />;
}
