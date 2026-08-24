import analysisData from './beatmaps/wonders-of-the-earth.analysis.json';
import type { HandRhythmDifficulty } from './handRhythmDifficulty';
import { HAND_RHYTHM_GESTURES } from './levels/handRhythmLevel';
import type { RhythmSongAnalysis } from './rhythmAnalysis';
import { deriveDifficultyChart, generateMusicAwareChart } from './rhythmChartGenerator';
import { HAND_RHYTHM_PLAYBACK } from './handRhythmSongMetadata';
import type { RhythmNote, RhythmSong } from './rhythmTiming';

export const WONDERS_OF_THE_EARTH_ANALYSIS = analysisData as RhythmSongAnalysis;

const hardNotes = generateMusicAwareChart(WONDERS_OF_THE_EARTH_ANALYSIS);

export const HAND_RHYTHM_SONGS: Record<HandRhythmDifficulty, RhythmSong> = {
  easy: {
    ...HAND_RHYTHM_PLAYBACK,
    notes: deriveDifficultyChart(hardNotes, 'easy'),
  },
  medium: {
    ...HAND_RHYTHM_PLAYBACK,
    notes: deriveDifficultyChart(hardNotes, 'medium'),
  },
  hard: {
    ...HAND_RHYTHM_PLAYBACK,
    notes: hardNotes,
  },
};

/** The original music-aware chart remains the Hard chart. */
export const HAND_RHYTHM_SONG: RhythmSong = HAND_RHYTHM_SONGS.hard;

export function getHandRhythmSong(difficulty: HandRhythmDifficulty): RhythmSong {
  return HAND_RHYTHM_SONGS[difficulty];
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
