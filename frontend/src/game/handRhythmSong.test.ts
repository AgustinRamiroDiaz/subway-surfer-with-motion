import { describe, expect, test } from 'vitest';
import {
  fitRhythmNoteToGrid,
  HAND_RHYTHM_SONG,
  WONDERS_OF_THE_EARTH_ANALYSIS,
} from './handRhythmSong';

describe('Hand Rhythm song chart', () => {
  test('keeps every chart event on the analyzed quarter or eighth-beat grid', () => {
    expect(HAND_RHYTHM_SONG.bpm).toBe(140);
    expect(HAND_RHYTHM_SONG.notes.length).toBeGreaterThan(80);
    expect(HAND_RHYTHM_SONG.notes.every((note) => Number.isInteger(note.beat * 2))).toBe(true);
    expect(HAND_RHYTHM_SONG.notes.some((note) => note.kind === 'burst')).toBe(true);
    expect(HAND_RHYTHM_SONG.notes.some((note) => note.twoHandEligible)).toBe(true);
  });

  test('does not schedule notes on analyzed silent beats', () => {
    const silentBeats = new Set(
      WONDERS_OF_THE_EARTH_ANALYSIS.beats.filter((beat) => beat.silent).map((beat) => beat.beat)
    );
    expect(HAND_RHYTHM_SONG.notes.every((note) => !silentBeats.has(Math.floor(note.beat)))).toBe(true);
  });

  test('fits the authored 3 by 3 chart into the selected 2 by 2 grid', () => {
    const note = fitRhythmNoteToGrid({
      id: 'corner',
      beat: 8,
      cell: { row: 2, column: 2 },
      gesture: 'Victory',
      kind: 'accent',
      strength: 0.9,
      twoHandEligible: true,
    }, 2);

    expect(note.cell).toEqual({ row: 1, column: 1 });
  });
});
