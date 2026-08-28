import type { RhythmPlaybackDefinition } from './rhythmTiming';

const APP_BASE_URL = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export const HAND_RHYTHM_PLAYBACK: RhythmPlaybackDefinition = {
  id: 'wonders-of-the-earth',
  title: 'Wonders of the Earth',
  audioUrl: `${APP_BASE_URL}music/grand_project-wonders-of-the-earth-550792.mp3`,
  bpm: 140,
  beatOffsetSeconds: 0,
  durationSeconds: 149.603265,
  beatsPerBar: 4,
  approachBeats: 4,
};
