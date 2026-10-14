import { Platform } from 'react-native';
import { currentToken } from '@/lib/session';
import { mobileApiBase } from './api-base';
import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { fetch as deviceFetch } from 'expo/fetch';

export interface Attachment { id: string; fileName: string; contentType: string; size: number }
export const MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'];
export const ACCEPT = ALLOWED.join(',');
export const attachmentsSupported = Platform.OS !== 'web' || typeof document !== 'undefined';

const base = () => mobileApiBase(Platform.OS, process.env.EXPO_PUBLIC_DOMAIN);

export function validateFile(f: { type: string; size: number }): string | null {
  const type = f.type.split(';')[0];
  if (!ALLOWED.includes(type)) return 'Only PDF, PNG, JPEG, WEBP and audio (webm, ogg, mpeg, mp4) files are accepted.';
  if (f.size > MAX_BYTES) return 'File exceeds the 10 MB limit.';
  if (f.size === 0) return 'File is empty.';
  return null;
}

/** Multipart upload. The generated client has no multipart endpoint and does not export customFetch, so this uses fetch with the session token. */
export async function uploadAttachment(projectId: string, file: Blob, name: string): Promise<Attachment> {
  const bad = validateFile(file);
  if (bad) throw new Error(bad);
  const fd = new FormData();
  const uri = (file as Blob & { nativeUri?: string }).nativeUri;
  if (Platform.OS !== 'web' && uri) {
    fd.append('file', { uri, name, type: file.type } as unknown as Blob);
  } else fd.append('file', file, name);
  const token = currentToken();
  const res = await fetch(`${base()}/api/erp/${projectId}/attachments`, { method: 'POST', body: fd, credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) {
    let m = `Upload failed (${res.status}).`;
    try { const j = await res.json(); if (j?.message) m = j.message; } catch { /* ignore */ }
    throw new Error(m);
  }
  return (await res.json()) as Attachment;
}

/** Protected download. The generated client cannot return blobs, so this uses fetch with the bearer token and checks the response. */
export async function fetchAttachmentBlob(projectId: string, id: string): Promise<Blob> {
  const token = currentToken();
  const res = await (Platform.OS === 'web' ? fetch : deviceFetch)(`${base()}/api/erp/${projectId}/attachments/${id}`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) {
    let m = res.status === 404 ? 'Attachment not found.' : res.status === 403 || res.status === 401 ? 'You do not have access to this attachment.' : `Download failed (${res.status}).`;
    try { const j = await res.json(); if (j?.message) m = j.message; } catch { /* body not JSON */ }
    throw new Error(m);
  }
  const b = await res.blob();
  if (b.size === 0) throw new Error('The attachment is empty.');
  return b;
}

export function pickFile(accept = ACCEPT): Promise<File | null> {
  if (Platform.OS !== 'web') return (async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: accept.split(','), copyToCacheDirectory: true, multiple: false,
    });
    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];
    const local = new DeviceFile(asset.uri);
    const file = {
      name: asset.name, type: asset.mimeType || local.type || 'application/octet-stream',
      size: asset.size ?? local.size, nativeUri: asset.uri,
    };
    const invalid = validateFile(file);
    if (invalid) throw new Error(invalid);
    return file as unknown as File;
  })();
  return new Promise((resolve) => {
    if (!attachmentsSupported) return resolve(null);
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    let done = false;
    const finish = (f: File | null) => { if (done) return; done = true; window.removeEventListener('focus', onFocus); resolve(f); };
    // Browsers fire no change event on cancel; 'cancel' (modern) or a focus return settles it so callers never stay busy.
    const onFocus = () => setTimeout(() => finish(i.files?.[0] ?? null), 600);
    i.onchange = () => finish(i.files?.[0] ?? null);
    i.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onFocus);
    i.click();
  });
}

export function saveBlob(blob: Blob, name: string) {
  if (Platform.OS !== 'web') {
    void (async () => {
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
      const file = new DeviceFile(Paths.cache, name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120));
      file.create({ overwrite: true });
      file.write(new Uint8Array(await blob.arrayBuffer()));
      await Sharing.shareAsync(file.uri, { mimeType: blob.type || 'application/octet-stream', dialogTitle: name });
    })().catch(e => Alert.alert('Download failed', e instanceof Error ? e.message : String(e)));
    return;
  }
  if (!attachmentsSupported) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

export interface Recorder { stop: () => Promise<Blob> }
export async function startRecording(): Promise<Recorder> {
  if (Platform.OS !== 'web' || !attachmentsSupported || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') throw new Error('Voice recording is not available on this device in this build. You can upload a recorded audio file.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm', 'audio/ogg', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start();
  return { stop: () => new Promise<Blob>((res) => { rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); }; rec.stop(); }) };
}
