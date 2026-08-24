import type { HandRhythmCell, HandRhythmGesture } from './levels/handRhythmLevel';

export type RhythmNote = {
  id: string;
  beat: number;
  cell: HandRhythmCell;
  gesture: HandRhythmGesture;
};

export type RhythmSong = {
  id: string;
  title: string;
  audioUrl: string;
  bpm: number;
  beatOffsetSeconds: number;
  durationSeconds: number;
  beatsPerBar: number;
  approachBeats: number;
  notes: readonly RhythmNote[];
};

export function beatToTime(song: Pick<RhythmSong, 'bpm' | 'beatOffsetSeconds'>, beat: number): number {
  return song.beatOffsetSeconds + beat * 60 / song.bpm;
}

export function getRhythmNoteTimes(
  song: Pick<RhythmSong, 'approachBeats' | 'beatOffsetSeconds' | 'bpm'>,
  note: Pick<RhythmNote, 'beat'>
): { hitTimeSeconds: number; spawnTimeSeconds: number } {
  return {
    hitTimeSeconds: beatToTime(song, note.beat),
    spawnTimeSeconds: beatToTime(song, note.beat - song.approachBeats),
  };
}

export function getRhythmTargetZ(
  song: Pick<RhythmSong, 'approachBeats' | 'beatOffsetSeconds' | 'bpm'>,
  note: Pick<RhythmNote, 'beat'>,
  songTimeSeconds: number,
  spawnZ: number,
  hitZ: number
): number {
  const { hitTimeSeconds, spawnTimeSeconds } = getRhythmNoteTimes(song, note);
  const progress = (songTimeSeconds - spawnTimeSeconds) / (hitTimeSeconds - spawnTimeSeconds);
  return spawnZ + (hitZ - spawnZ) * progress;
}

export function isRhythmNoteVisible(
  song: Pick<RhythmSong, 'approachBeats' | 'beatOffsetSeconds' | 'bpm'>,
  note: Pick<RhythmNote, 'beat'>,
  songTimeSeconds: number,
  spawnZ: number,
  hitZ: number,
  despawnZ: number
): boolean {
  const { spawnTimeSeconds } = getRhythmNoteTimes(song, note);
  return songTimeSeconds >= spawnTimeSeconds &&
    getRhythmTargetZ(song, note, songTimeSeconds, spawnZ, hitZ) <= despawnZ;
}
