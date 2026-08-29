import { WONDERS_OF_THE_EARTH_ANALYSIS } from './handRhythmSong';
import { HAND_RHYTHM_PLAYBACK } from './handRhythmSongMetadata';
import type { RhythmSongAnalysis } from './rhythmAnalysis';
import { beatToTime, type RhythmPlaybackDefinition } from './rhythmTiming';

export type PoseRunnerRhythmEvent = {
  id: string;
  beat: number;
  strength: number;
};

export const POSE_RUNNER_APPROACH_BEATS = 7;

export const POSE_RUNNER_PLAYBACK: RhythmPlaybackDefinition = {
  ...HAND_RHYTHM_PLAYBACK,
  approachBeats: POSE_RUNNER_APPROACH_BEATS,
};

export function generatePoseRunnerRhythmEvents(
  analysis: RhythmSongAnalysis,
  approachBeats = POSE_RUNNER_APPROACH_BEATS
): PoseRunnerRhythmEvent[] {
  const finalHitBeat = Math.floor(
    (analysis.durationSeconds - analysis.beatOffsetSeconds) * analysis.bpm / 60
  ) - 1;

  return analysis.bars.flatMap((bar) => {
    const beat = analysis.beats[bar.strongestBeat];
    if (
      bar.silent ||
      !beat ||
      beat.silent ||
      beat.beat < approachBeats ||
      beat.beat > finalHitBeat ||
      beatToTime(analysis, beat.beat - approachBeats) < 0
    ) {
      return [];
    }
    return [{ id: `runner-beat-${beat.beat}`, beat: beat.beat, strength: beat.accent }];
  });
}

export const POSE_RUNNER_RHYTHM_EVENTS = generatePoseRunnerRhythmEvents(
  WONDERS_OF_THE_EARTH_ANALYSIS
);
