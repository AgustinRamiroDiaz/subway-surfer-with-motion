import { describe, expect, test } from 'vitest';
import { HAND_RHYTHM_SONG, HAND_RHYTHM_SONGS, WONDERS_OF_THE_EARTH_ANALYSIS } from './handRhythmSong';
import { deriveDifficultyChart, generateMusicAwareChart, shouldAddCompanionTarget } from './rhythmChartGenerator';

describe('music-aware rhythm chart generation', () => {
  test('is deterministic and preserves playable travel between fast notes', () => {
    const regenerated = generateMusicAwareChart(WONDERS_OF_THE_EARTH_ANALYSIS);
    expect(regenerated).toEqual(HAND_RHYTHM_SONG.notes);

    regenerated.slice(1).forEach((note, index) => {
      const previous = regenerated[index];
      if (previous && note.beat - previous.beat <= 1) {
        expect(Math.abs(note.cell.row - previous.cell.row)).toBeLessThanOrEqual(1);
        expect(Math.abs(note.cell.column - previous.cell.column)).toBeLessThanOrEqual(1);
      }
    });
  });

  test('derives progressively denser difficulty charts while preserving Hard', () => {
    const { easy, medium, hard } = HAND_RHYTHM_SONGS;

    expect(hard.notes).toBe(HAND_RHYTHM_SONG.notes);
    expect(deriveDifficultyChart(hard.notes, 'hard')).toBe(hard.notes);
    expect(easy.notes.length).toBeLessThan(medium.notes.length);
    expect(medium.notes.length).toBeLessThan(hard.notes.length);
    expect(easy.notes.every((note) => note.kind !== 'burst' && !note.twoHandEligible)).toBe(true);
    expect(medium.notes.every((note) => note.kind !== 'burst')).toBe(true);
    expect(medium.notes.filter((note) => note.twoHandEligible).length)
      .toBeLessThan(hard.notes.filter((note) => note.twoHandEligible).length);
  });

  test('gives Easy and Medium their promised recovery time and gesture vocabulary', () => {
    const assertMinimumGap = (beats: number[], minimum: number): void => {
      beats.slice(1).forEach((beat, index) => expect(beat - (beats[index] ?? beat)).toBeGreaterThanOrEqual(minimum));
    };

    assertMinimumGap(HAND_RHYTHM_SONGS.easy.notes.map((note) => note.beat), 2);
    assertMinimumGap(HAND_RHYTHM_SONGS.medium.notes.map((note) => note.beat), 1);
    expect(new Set(HAND_RHYTHM_SONGS.easy.notes.map((note) => note.gesture)).size).toBeLessThanOrEqual(3);
    expect(new Set(HAND_RHYTHM_SONGS.medium.notes.map((note) => note.gesture)).size).toBeLessThanOrEqual(4);
  });

  test('uses the preference chance only for musical accent candidates', () => {
    const eligible = HAND_RHYTHM_SONG.notes.find((note) => note.twoHandEligible);
    const ordinary = HAND_RHYTHM_SONG.notes.find((note) => !note.twoHandEligible);
    expect(eligible).toBeDefined();
    expect(ordinary).toBeDefined();
    expect(eligible && shouldAddCompanionTarget(eligible, 1)).toBe(true);
    expect(eligible && shouldAddCompanionTarget(eligible, 0)).toBe(false);
    expect(ordinary && shouldAddCompanionTarget(ordinary, 1)).toBe(false);
    expect(HAND_RHYTHM_SONG.notes.some((note) => shouldAddCompanionTarget(note, 0.1))).toBe(true);
  });
});
