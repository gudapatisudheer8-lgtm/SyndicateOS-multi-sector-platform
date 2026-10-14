import * as adapter from '../../../adapter/api';
import type { BlueprintState, Geometry } from './blueprintGeometry';

const base = (projectId: string) => `/erp/${encodeURIComponent(projectId)}/blueprint`;

export const getBlueprint = (projectId: string) => adapter.api<BlueprintState>(base(projectId));

export const analyzeBlueprint = (projectId: string, attachmentId: string, revision: number) =>
  adapter.api<BlueprintState>(`${base(projectId)}/analyze`, { method: 'POST', body: { attachmentId, revision } });

export const saveBlueprint = (
  projectId: string,
  body: { attachmentId: string | null; revision: number; geometry: Geometry; confirm: boolean; reviewAcknowledged: boolean },
) => adapter.api<BlueprintState>(`${base(projectId)}/save`, { method: 'POST', body });

/** Deterministic, non-AI starter layout from live project inventory; saved as a new draft. */
export const generateLayout = (projectId: string, revision: number) =>
  adapter.api<BlueprintState>(`${base(projectId)}/generate`, { method: 'POST', body: { revision } });

/** Original attachment bytes, fetched privately with the bearer session (never a public URL). */
export const fetchAttachmentBlob = (projectId: string, attachmentId: string): Promise<Blob> =>
  adapter.fetchProjectAttachmentBlob(projectId, attachmentId);

export function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string' && (e as any).message) return (e as any).message;
  return fallback;
}
