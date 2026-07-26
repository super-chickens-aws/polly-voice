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
};
declare class SpeechService {
    private readonly polly;
    synthesize(input: SynthesisInput): Promise<SynthesizedAudio>;
}
export declare const speechService: SpeechService;
export {};
