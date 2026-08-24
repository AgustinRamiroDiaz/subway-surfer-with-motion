import {
  HAND_RHYTHM_GESTURES,
  type HandRhythmCell,
} from './levels/handRhythmLevel';
import type { RhythmNote, RhythmSong } from './rhythmTiming';

const SONG_DURATION_SECONDS = 149.603265;
const SONG_BPM = 140;
const FIRST_NOTE_BEAT = 8;
const FINAL_NOTE_BEAT = Math.floor(SONG_DURATION_SECONDS * SONG_BPM / 60) - 4;
const CELLS: readonly HandRhythmCell[] = [
  { row: 1, column: 1 },
  { row: 0, column: 0 },
  { row: 2, column: 2 },
  { row: 0, column: 2 },
  { row: 2, column: 0 },
  { row: 1, column: 0 },
  { row: 1, column: 2 },
  { row: 2, column: 1 },
  { row: 0, column: 1 },
];

function createQuarterBeatChart(): RhythmNote[] {
  const notes: RhythmNote[] = [];
  for (let beat = FIRST_NOTE_BEAT; beat <= FINAL_NOTE_BEAT; beat += 2) {
    const patternIndex = Math.floor((beat - FIRST_NOTE_BEAT) / 2);
    notes.push({
      id: `beat-${beat}`,
      beat,
      cell: CELLS[patternIndex % CELLS.length] ?? CELLS[0],
      gesture: HAND_RHYTHM_GESTURES[patternIndex % HAND_RHYTHM_GESTURES.length] ?? 'Open_Palm',
    });
  }
  return notes;
}

export const HAND_RHYTHM_SONG: RhythmSong = {
  id: 'wonders-of-the-earth',
  title: 'Wonders of the Earth',
  audioUrl: '/music/grand_project-wonders-of-the-earth-550792.mp3',
  bpm: SONG_BPM,
  beatOffsetSeconds: 0,
  durationSeconds: SONG_DURATION_SECONDS,
  beatsPerBar: 4,
  approachBeats: 4,
  notes: createQuarterBeatChart(),
};

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
