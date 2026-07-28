import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { config } from './config.js';
import type { TtsEngine, TtsSettings } from './types.js';

export type SynthesisInput = {
  text: string;
  voice: string;
  engine: TtsEngine;
  language: string;
  settings: TtsSettings;
};

export type SynthesizedAudio = {
  body: Buffer;
  contentType: string;
  extension: string;
  engine: TtsEngine;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildSsml(input: SynthesisInput): string {
  const text = escapeXml(input.text);
  const breakTag = input.settings.breakTimeMs > 0
    ? `<break time="${input.settings.breakTimeMs}ms"/>`
    : '';
  return `<speak><prosody rate="${input.settings.speed}%" volume="${input.settings.volume}dB">${text}${breakTag}</prosody></speak>`;
}

function createMockWave(text: string, voice: string): Buffer {
  const sampleRate = 16_000;
  const duration = Math.max(0.8, Math.min(5, text.length / 24));
  const sampleCount = Math.floor(sampleRate * duration);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  const frequency = 220 + Math.abs(voice.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 220);
  for (let index = 0; index < sampleCount; index++) {
    const value = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 3500;
    buffer.writeInt16LE(Math.round(value), 44 + index * 2);
  }
  return buffer;
}

class SpeechService {
  private readonly polly = new PollyClient({ region: config.aws.region });

  async synthesize(input: SynthesisInput): Promise<SynthesizedAudio> {
    if (!config.aws.enabled) {
      return {
        body: createMockWave(input.text, input.voice),
        contentType: 'audio/wav',
        extension: 'wav',
        engine: input.engine
      };
    }
    // eu-north-1 supports Polly Standard voices, but not Neural or Long-form.
    const engine: TtsEngine = config.aws.region === 'eu-north-1' ? 'standard' : input.engine;
    const response = await this.polly.send(new SynthesizeSpeechCommand({
      Text: buildSsml(input),
      TextType: 'ssml',
      OutputFormat: 'mp3',
      VoiceId: input.voice as any,
      Engine: engine,
      LanguageCode: input.language as any
    }));
    if (!response.AudioStream) throw new Error('Amazon Polly did not return an audio stream.');
    return {
      body: Buffer.from(await response.AudioStream.transformToByteArray()),
      contentType: response.ContentType ?? 'audio/mpeg',
      extension: 'mp3',
      engine
    };
  }
}

export const speechService = new SpeechService();
