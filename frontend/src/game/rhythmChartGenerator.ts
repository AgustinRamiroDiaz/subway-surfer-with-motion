import type { HandRhythmCell, HandRhythmGesture } from './levels/handRhythmLevel';
import type {
  RhythmBarAnalysis,
  RhythmBeatAnalysis,
  RhythmSectionAnalysis,
  RhythmSongAnalysis,
} from './rhythmAnalysis';
import type { RhythmNote } from './rhythmTiming';
import type { HandRhythmDifficulty } from './handRhythmDifficulty';

const FIRST_PLAYABLE_BEAT = 8;
const FINAL_APPROACH_BEATS = 4;
const BURST_COOLDOWN_BEATS = 16;
const DOUBLE_ACCENT_COOLDOWN_BEATS = 8;

function sectionAtBeat(sections: RhythmSectionAnalysis[], beat: number): RhythmSectionAnalysis | undefined {
  return sections.find((section) => beat >= section.startBeat && beat < section.endBeat);
}

function beatStep(bar: RhythmBarAnalysis, section: RhythmSectionAnalysis | undefined): number {
  if (section?.type === 'intro' || section?.type === 'outro' || bar.intensity < 0.25) {
    return 4;
  }
  if (section?.type === 'breakdown' || bar.intensity < 0.58) {
    return 2;
  }
  return 1;
}

function dominantRow(beat: RhythmBeatAnalysis): number {
  const bands = [beat.highEnergy, beat.midEnergy, beat.lowEnergy];
  return bands.indexOf(Math.max(...bands));
}

function gestureForBeat(beat: RhythmBeatAnalysis, bar: number): HandRhythmGesture {
  const row = dominantRow(beat);
  const gestures: ReadonlyArray<readonly HandRhythmGesture[]> = [
    ['Pointing_Up', 'ILoveYou'],
    ['Open_Palm', 'Victory'],
    ['Closed_Fist', 'Thumb_Up'],
  ];
  return gestures[row]?.[bar % 2] ?? 'Open_Palm';
}

function limitTravel(previous: RhythmNote | undefined, desired: HandRhythmCell, beat: number): HandRhythmCell {
  if (!previous || beat - previous.beat > 1) {
    return desired;
  }
  return {
    row: previous.cell.row + Math.sign(desired.row - previous.cell.row),
    column: previous.cell.column + Math.sign(desired.column - previous.cell.column),
  };
}

function createNote(
  analysisBeat: RhythmBeatAnalysis,
  beat: number,
  index: number,
  bar: number,
  kind: RhythmNote['kind'],
  previous: RhythmNote | undefined,
  twoHandEligible: boolean
): RhythmNote {
  const desiredCell = {
    row: dominantRow(analysisBeat),
    column: [1, 0, 2, 1, 2, 0][index % 6] ?? 1,
  };
  return {
    id: `${kind}-beat-${beat}`,
    beat,
    cell: limitTravel(previous, desiredCell, beat),
    gesture: gestureForBeat(analysisBeat, bar),
    kind,
    strength: analysisBeat.accent,
    twoHandEligible,
  };
}

function addBurstNotes(
  notes: RhythmNote[],
  analysis: RhythmSongAnalysis,
  bar: RhythmBarAnalysis,
  lastBurstBeat: number
): number {
  if (bar.onsetDensity < 0.78 || bar.intensity < 0.52 || bar.startBeat - lastBurstBeat < BURST_COOLDOWN_BEATS) {
    return lastBurstBeat;
  }
  const candidates = analysis.onsets
    .filter((onset) => onset.quantizedBeat >= bar.startBeat && onset.quantizedBeat < bar.startBeat + 4)
    .filter((onset) => !Number.isInteger(onset.quantizedBeat) && onset.strength >= 0.48);
  let bestWindow: typeof candidates = [];
  candidates.forEach((candidate) => {
    const window = candidates.filter((onset) => (
      onset.quantizedBeat >= candidate.quantizedBeat && onset.quantizedBeat <= candidate.quantizedBeat + 1.5
    ));
    if (window.length > bestWindow.length) {
      bestWindow = window;
    }
  });
  if (bestWindow.length < 2) {
    return lastBurstBeat;
  }

  bestWindow.slice(0, 3).forEach((onset) => {
    if (notes.some((note) => note.beat === onset.quantizedBeat)) {
      return;
    }
    const analysisBeat = analysis.beats[Math.floor(onset.quantizedBeat)];
    if (!analysisBeat?.silent) {
      notes.push(createNote(
        analysisBeat,
        onset.quantizedBeat,
        notes.length,
        bar.bar,
        'burst',
        notes.at(-1),
        false
      ));
    }
  });
  return bestWindow[0]?.quantizedBeat ?? lastBurstBeat;
}

export function generateMusicAwareChart(analysis: RhythmSongAnalysis): RhythmNote[] {
  const notes: RhythmNote[] = [];
  const finalBeat = Math.floor((analysis.durationSeconds - analysis.beatOffsetSeconds) * analysis.bpm / 60) -
    FINAL_APPROACH_BEATS;
  let lastDoubleAccentBeat = -Infinity;
  let lastBurstBeat = -Infinity;

  analysis.beats.forEach((analysisBeat) => {
    const beat = analysisBeat.beat;
    if (beat < FIRST_PLAYABLE_BEAT || beat > finalBeat || analysisBeat.silent) {
      return;
    }
    const bar = analysis.bars[Math.floor(beat / 4)];
    if (!bar?.silent) {
      const section = sectionAtBeat(analysis.sections, beat);
      const step = beatStep(bar, section);
      const isStrongAccent = analysisBeat.accent >= 0.72;
      if (beat % step === 0 && (analysisBeat.onsetStrength >= 0.12 || isStrongAccent)) {
        const twoHandEligible = analysisBeat.accent >= 0.86 &&
          beat - lastDoubleAccentBeat >= DOUBLE_ACCENT_COOLDOWN_BEATS;
        notes.push(createNote(
          analysisBeat,
          beat,
          notes.length,
          bar.bar,
          isStrongAccent ? 'accent' : 'normal',
          notes.at(-1),
          twoHandEligible
        ));
        if (twoHandEligible) {
          lastDoubleAccentBeat = beat;
        }
      }
      lastBurstBeat = addBurstNotes(notes, analysis, bar, lastBurstBeat);
    }
  });

  const sorted = notes.sort((left, right) => left.beat - right.beat);
  return sorted.reduce<RhythmNote[]>((playable, note) => {
    playable.push({
      ...note,
      cell: limitTravel(playable.at(-1), note.cell, note.beat),
    });
    return playable;
  }, []);
}

function isDifficultyCandidate(note: RhythmNote, difficulty: Exclude<HandRhythmDifficulty, 'hard'>): boolean {
  if (note.kind === 'burst') {
    return false;
  }
  if (difficulty === 'medium') {
    return note.kind === 'accent' || note.beat % 2 === 0;
  }
  return (note.kind === 'accent' && note.strength >= 0.78) || note.beat % 4 === 0;
}

function gestureForDifficulty(
  gesture: HandRhythmGesture,
  difficulty: Exclude<HandRhythmDifficulty, 'hard'>
): HandRhythmGesture {
  if (difficulty === 'medium') {
    if (gesture === 'ILoveYou') return 'Pointing_Up';
    if (gesture === 'Thumb_Up') return 'Closed_Fist';
    return gesture;
  }
  if (gesture === 'Pointing_Up' || gesture === 'ILoveYou') return 'Victory';
  if (gesture === 'Closed_Fist' || gesture === 'Thumb_Up') return 'Closed_Fist';
  return 'Open_Palm';
}

/**
 * Derives gentler charts from the authored hard chart so every difficulty keeps
 * the same musical rests, section changes, and accent decisions.
 */
export function deriveDifficultyChart(
  hardNotes: readonly RhythmNote[],
  difficulty: HandRhythmDifficulty
): readonly RhythmNote[] {
  if (difficulty === 'hard') {
    return hardNotes;
  }

  const minimumGapBeats = difficulty === 'easy' ? 2 : 1;
  return hardNotes.reduce<RhythmNote[]>((notes, note) => {
    if (!isDifficultyCandidate(note, difficulty)) {
      return notes;
    }
    const previous = notes.at(-1);
    if (previous && note.beat - previous.beat < minimumGapBeats) {
      return notes;
    }

    notes.push({
      ...note,
      gesture: gestureForDifficulty(note.gesture, difficulty),
      twoHandEligible: difficulty === 'medium' && note.twoHandEligible && note.strength >= 0.94,
    });
    return notes;
  }, []);
}

export function shouldAddCompanionTarget(note: RhythmNote, chance: number): boolean {
  const normalizedChance = Math.min(1, Math.max(0, chance));
  return note.twoHandEligible && normalizedChance > 0 && note.strength >= 1 - normalizedChance;
}
