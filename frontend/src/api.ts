const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';

type ApiEnvelope<T> = { data: T };

export type TtsRequest = {
  text: string;
  language: string;
  voice: string;
  engine: 'neural' | 'standard' | 'long-form';
  outputFormat: 'mp3';
  preset: string;
  settings: {
    speed: number;
    volume: number;
    breakTimeMs: number;
    pitch: number;
    emphasis: string;
    domainStyle: string;
  };
};

export type TtsResult = {
  id: string;
  status: string;
  text: string;
  voice: string;
  engine: 'neural' | 'standard' | 'long-form';
  characterCount: number;
  media: { contentType: string; fileSize: number; downloadUrl: string; expiresIn: number };
  createdAt: string;
};

export type SttResult = {
  id: string;
  fileName: string;
  audioFileSize: number;
  status: string;
  resultText: string;
  downloadUrl: string | null;
  createdAt: string;
};

function authHeaders(): Record<string, string> {
  const accessToken = localStorage.getItem('access_token');
  if (accessToken) return { Authorization: `Bearer ${accessToken}` };
  return { 'X-User-Id': localStorage.getItem('local_user_id') ?? 'guest' };
}

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `API error ${response.status}`);
  return (body as ApiEnvelope<T>).data;
}

export async function createTts(payload: TtsRequest, preview: boolean): Promise<TtsResult> {
  const response = await fetch(`${API_BASE_URL}/tts${preview ? '/preview' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload)
  });
  return parse<TtsResult>(response);
}

export async function fetchTtsHistory(): Promise<TtsResult[]> {
  return parse<TtsResult[]>(await fetch(`${API_BASE_URL}/tts/history`, { headers: authHeaders() }));
}

export async function deleteTtsHistory(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/tts/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error('Unable to delete TTS history.');
}

export async function createStt(file: File): Promise<SttResult> {
  const form = new FormData();
  form.append('file', file);
  return parse<SttResult>(await fetch(`${API_BASE_URL}/stt`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  }));
}

export async function fetchSttHistory(): Promise<SttResult[]> {
  return parse<SttResult[]>(await fetch(`${API_BASE_URL}/stt/history`, { headers: authHeaders() }));
}

export async function deleteSttHistory(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/stt/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error('Unable to delete STT history.');
}
