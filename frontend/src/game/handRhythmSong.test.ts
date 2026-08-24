import { describe, expect, test } from 'vitest';
import { fitRhythmNoteToGrid, HAND_RHYTHM_SONG } from './handRhythmSong';

describe('Hand Rhythm song chart', () => {
  test('keeps every chart event on the analyzed quarter-beat grid', () => {
    expect(HAND_RHYTHM_SONG.bpm).toBe(140);
    expect(HAND_RHYTHM_SONG.notes.length).toBeGreaterThan(100);
    expect(HAND_RHYTHM_SONG.notes.every((note) => Number.isInteger(note.beat))).toBe(true);
  });

  test('fits the authored 3 by 3 chart into the selected 2 by 2 grid', () => {
    const note = fitRhythmNoteToGrid({
      id: 'corner',
      beat: 8,
      cell: { row: 2, column: 2 },
      gesture: 'Victory',
    }, 2);

    expect(note.cell).toEqual({ row: 1, column: 1 });
  });
});
