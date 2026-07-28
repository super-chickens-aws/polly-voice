import type { Request } from 'express';

export type UserIdentity = { id: string; email?: string; authenticated: boolean };
export type AuthenticatedRequest = Request & { user: UserIdentity };
export type TtsEngine = 'neural' | 'standard' | 'long-form';
export type TtsSettings = {
  speed: number;
  volume: number;
  breakTimeMs: number;
  pitch: number;
  emphasis: string;
  domainStyle: string;
};
