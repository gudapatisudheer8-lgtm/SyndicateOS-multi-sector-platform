/** Small in-app leave guard: editors with unsaved work register a message; navigation asks before unmounting them. */
type Guard = () => string | null;
const guards = new Set<Guard>();
export function registerLeaveGuard(fn: Guard): () => void { guards.add(fn); return () => { guards.delete(fn); }; }
export function pendingLeaveMessage(): string | null {
  for (const g of guards) { const m = g(); if (m) return m; }
  return null;
}
/** True when nothing is pending or the user accepts discarding it. */
export function confirmLeave(): boolean {
  const m = pendingLeaveMessage();
  return !m || window.confirm(m);
}
