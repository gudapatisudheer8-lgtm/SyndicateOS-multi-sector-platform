import { Alert, Platform } from 'react-native';

/** Small in-app leave guard: editors with unsaved work register a message; navigation asks before unmounting them. */
type Guard = () => string | null;
const guards = new Set<Guard>();
export function registerLeaveGuard(fn: Guard): () => void { guards.add(fn); return () => { guards.delete(fn); }; }
export function pendingLeaveMessage(): string | null {
  for (const g of guards) { const m = g(); if (m) return m; }
  return null;
}
/** Runs proceed immediately when nothing is pending, otherwise after the user chooses to discard. Cancel keeps the editor as is. */
export function guardLeave(proceed: () => void): void {
  const m = pendingLeaveMessage();
  if (!m) { proceed(); return; }
  if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm(m)) proceed(); return; }
  Alert.alert('Unsaved changes', m, [{ text: 'Stay', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: proceed }]);
}
