import { describe, expect, test } from 'vitest';
import {
  beatToTime,
  getRhythmNoteTimes,
  getRhythmTargetZ,
  isRhythmNoteVisible,
  type RhythmNote,
  type RhythmSong,
} from './rhythmTiming';

const song: RhythmSong = {
  id: 'test',
  title: 'Test',
  audioUrl: '/test.mp3',
  bpm: 120,
  beatOffsetSeconds: 0.25,
  durationSeconds: 30,
  beatsPerBar: 4,
  approachBeats: 4,
  notes: [],
};
const note: RhythmNote = {
  id: 'note-8',
  beat: 8,
  cell: { row: 1, column: 1 },
  gesture: 'Open_Palm',
};

describe('rhythm timing', () => {
  test('converts quarter-note beats to seconds using the song offset', () => {
    expect(beatToTime(song, 0)).toBe(0.25);
    expect(beatToTime(song, 8)).toBe(4.25);
  });

  test('makes a note visible for its complete travel through the playfield', () => {
    expect(getRhythmNoteTimes(song, note)).toEqual({
      spawnTimeSeconds: 2.25,
      hitTimeSeconds: 4.25,
    });
    expect(isRhythmNoteVisible(song, note, 2.249, -18, 2.6, 5.2)).toBe(false);
    expect(isRhythmNoteVisible(song, note, 2.25, -18, 2.6, 5.2)).toBe(true);
    expect(isRhythmNoteVisible(song, note, 4.5, -18, 2.6, 5.2)).toBe(true);
    expect(isRhythmNoteVisible(song, note, 4.51, -18, 2.6, 5.2)).toBe(false);
  });

  test('derives target position from song time without accumulated frame deltas', () => {
    expect(getRhythmTargetZ(song, note, 2.25, -18, 2.6)).toBeCloseTo(-18);
    expect(getRhythmTargetZ(song, note, 3.25, -18, 2.6)).toBeCloseTo(-7.7);
    expect(getRhythmTargetZ(song, note, 4.25, -18, 2.6)).toBeCloseTo(2.6);
  });
});
