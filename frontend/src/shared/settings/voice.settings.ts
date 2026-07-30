import type { PresetItem } from '../models/speech.models';

export const VOICE_PRESETS: PresetItem[] = [
  { id: 'none', name: 'Custom (No Preset)', desc: 'Adjust all voice settings manually' },
  { id: 'deep_male', name: 'Deep Male', voice: 'Matthew', engine: 'neural', desc: 'Deep and authoritative male voice' },
  { id: 'young_male', name: 'Young Male', voice: 'Kevin', engine: 'neural', desc: 'Young and energetic male voice' },
  { id: 'soft_female', name: 'Soft Female', voice: 'Joanna', engine: 'neural', desc: 'Soft and gentle female voice' },
  { id: 'expressive_female', name: 'Expressive Female', voice: 'Danielle', engine: 'long-form', desc: 'Expressive female storytelling voice' },
  { id: 'mc', name: 'MC', voice: 'Stephen', engine: 'neural', desc: 'Clear voice for hosting and presenting' },
  { id: 'podcast', name: 'Podcast', voice: 'Matthew', engine: 'neural', domain: 'conversational', desc: 'Natural podcast voice' },
  { id: 'audiobook', name: 'Audiobook', voice: 'Joanna', engine: 'long-form', desc: 'Calm, slower-paced audiobook voice' }
];

export const POLLY_VOICES = [
  'Joanna', 'Salli', 'Kendra', 'Kimberly', 'Ivy',
  'Matthew', 'Justin', 'Joey', 'Amy', 'Emma', 'Brian'
];

export const STOCKHOLM_PRESET_OVERRIDES: Record<string, Pick<PresetItem, 'voice' | 'engine'>> = {
  deep_male: { voice: 'Matthew', engine: 'standard' },
  young_male: { voice: 'Justin', engine: 'standard' },
  soft_female: { voice: 'Joanna', engine: 'standard' },
  expressive_female: { voice: 'Salli', engine: 'standard' },
  mc: { voice: 'Matthew', engine: 'standard' },
  podcast: { voice: 'Matthew', engine: 'standard' },
  audiobook: { voice: 'Joanna', engine: 'standard' }
};
