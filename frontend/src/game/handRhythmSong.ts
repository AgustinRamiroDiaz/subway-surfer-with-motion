import type { HandRhythmDifficulty } from './handRhythmDifficulty';
import { HAND_RHYTHM_GESTURES } from './levels/handRhythmLevel';
import { getSong, type SongId } from './songCatalog';
import { deriveDifficultyChart, generateMusicAwareChart } from './rhythmChartGenerator';
import type { RhythmNote, RhythmSong } from './rhythmTiming';

export const WONDERS_OF_THE_EARTH_ANALYSIS = getSong('wonders-of-the-earth').analysis;

export function getHandRhythmSongs(songId: SongId): Record<HandRhythmDifficulty, RhythmSong> {
  const song = getSong(songId);
  const hardNotes = generateMusicAwareChart(song.analysis);
  return {
    easy: { ...song, notes: deriveDifficultyChart(hardNotes, 'easy') },
    medium: { ...song, notes: deriveDifficultyChart(hardNotes, 'medium') },
    hard: { ...song, notes: hardNotes },
  };
}

export const HAND_RHYTHM_SONGS = getHandRhythmSongs('wonders-of-the-earth');

/** The original music-aware chart remains the Hard chart. */
export const HAND_RHYTHM_SONG: RhythmSong = HAND_RHYTHM_SONGS.hard;

export function getHandRhythmSong(difficulty: HandRhythmDifficulty, songId: SongId = 'wonders-of-the-earth'): RhythmSong {
  return getHandRhythmSongs(songId)[difficulty];
}

export function fitRhythmNoteToGrid(note: RhythmNote, gridSize: number): RhythmNote {
  const scale = (gridSize - 1) / 2;
  return {
    ...note,
    cell: {
      row: Math.round(note.cell.row * scale),
      column: Math.round(note.cell.column * scale),
    },
  };
}

export function getCompanionRhythmNote(note: RhythmNote, gridSize: number): RhythmNote {
  const nextGestureIndex = (HAND_RHYTHM_GESTURES.indexOf(note.gesture) + 1) % HAND_RHYTHM_GESTURES.length;
  return {
    ...note,
    id: `${note.id}-companion`,
    cell: {
      row: (note.cell.row + 1) % gridSize,
      column: (note.cell.column + 1) % gridSize,
    },
    gesture: HAND_RHYTHM_GESTURES[nextGestureIndex] ?? 'Victory',
  };
}
