import celticAnalysis from './beatmaps/alex-morgan-celtic-591333.analysis.json';
import surfRockAnalysis from './beatmaps/alex-morgan-surf-rock-591326.analysis.json';
import wondersAnalysis from './beatmaps/wonders-of-the-earth.analysis.json';
import type { RhythmSongAnalysis } from './rhythmAnalysis';
import type { RhythmPlaybackDefinition } from './rhythmTiming';

const APP_BASE_URL = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export type SongId = 'wonders-of-the-earth' | 'celtic' | 'surf-rock';

export type SongDefinition = RhythmPlaybackDefinition & {
  analysis: RhythmSongAnalysis;
  artist: string;
};

function createSong(
  id: SongId,
  title: string,
  artist: string,
  filename: string,
  analysis: RhythmSongAnalysis,
): SongDefinition {
  return {
    id,
    title,
    artist,
    audioUrl: `${APP_BASE_URL}music/${filename}`,
    bpm: analysis.bpm,
    beatOffsetSeconds: analysis.beatOffsetSeconds,
    durationSeconds: analysis.durationSeconds,
    beatsPerBar: 4,
    approachBeats: 4,
    analysis,
  };
}

export const SONGS: readonly SongDefinition[] = [
  createSong('wonders-of-the-earth', 'Wonders of the Earth', 'Grand Project', 'grand_project-wonders-of-the-earth-550792.mp3', wondersAnalysis as RhythmSongAnalysis),
  createSong('celtic', 'Celtic', 'Alex Morgan', 'alex-morgan-celtic-591333.mp3', celticAnalysis as RhythmSongAnalysis),
  createSong('surf-rock', 'Surf Rock', 'Alex Morgan', 'alex-morgan-surf-rock-591326.mp3', surfRockAnalysis as RhythmSongAnalysis),
];

export const DEFAULT_SONG_ID: SongId = 'wonders-of-the-earth';

export function isSongId(value: unknown): value is SongId {
  return typeof value === 'string' && SONGS.some((song) => song.id === value);
}

export function getSong(songId: SongId): SongDefinition {
  return SONGS.find((song) => song.id === songId) ?? SONGS[0];
}
