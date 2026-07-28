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

type SttUploadSession = {
  directUpload: boolean;
  uploadId?: string;
  uploadUrl?: string;
  expiresIn?: number;
  maxFileSize?: number;
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

async function createSttLegacy(file: File): Promise<SttResult> {
  const form = new FormData();
  form.append('file', file);
  return parse<SttResult>(await fetch(`${API_BASE_URL}/stt`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  }));
}

function uploadToS3(url: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 60));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`S3 upload failed with status ${request.status}.`));
    };
    request.onerror = () => reject(new Error('The direct upload to Amazon S3 failed.'));
    request.send(file);
  });
}

export async function fetchStt(id: string): Promise<SttResult> {
  return parse<SttResult>(await fetch(`${API_BASE_URL}/stt/${id}`, { headers: authHeaders() }));
}

export async function createStt(file: File, onProgress?: (progress: number) => void): Promise<SttResult> {
  const session = await parse<SttUploadSession>(await fetch(`${API_BASE_URL}/stt/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size
    })
  }));

  if (!session.directUpload || !session.uploadId || !session.uploadUrl) {
    return createSttLegacy(file);
  }

  await uploadToS3(session.uploadUrl, file, onProgress);
  onProgress?.(65);
  let result = await parse<SttResult>(await fetch(`${API_BASE_URL}/stt/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      uploadId: session.uploadId,
      fileName: file.name,
      fileSize: file.size
    })
  }));

  for (let attempt = 0; result.status === 'PROCESSING' && attempt < 300; attempt += 1) {
    onProgress?.(Math.min(95, 65 + Math.floor(attempt / 10)));
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    result = await fetchStt(result.id);
  }

  if (result.status === 'FAILED') {
    throw new Error(result.resultText || 'Amazon Transcribe could not process this file.');
  }
  if (result.status !== 'COMPLETED') {
    throw new Error('Transcription is taking longer than expected. You can check it later in History.');
  }
  onProgress?.(100);
  return result;
}

export async function fetchSttHistory(): Promise<SttResult[]> {
  return parse<SttResult[]>(await fetch(`${API_BASE_URL}/stt/history`, { headers: authHeaders() }));
}

export async function deleteSttHistory(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/stt/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error('Unable to delete STT history.');
}
