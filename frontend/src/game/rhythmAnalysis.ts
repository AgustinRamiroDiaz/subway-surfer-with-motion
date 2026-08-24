export type RhythmBeatAnalysis = {
  beat: number;
  timeSeconds: number;
  loudnessDb: number;
  loudness: number;
  onsetStrength: number;
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  novelty: number;
  accent: number;
  silent: boolean;
};

export type RhythmOnsetAnalysis = {
  timeSeconds: number;
  quantizedBeat: number;
  strength: number;
};

export type RhythmBarAnalysis = {
  bar: number;
  startBeat: number;
  timeSeconds: number;
  intensity: number;
  onsetCount: number;
  onsetDensity: number;
  strongestBeat: number;
  silent: boolean;
  novelty: number;
};

export type RhythmSectionAnalysis = {
  startBar: number;
  endBar: number;
  startBeat: number;
  endBeat: number;
  type: 'intro' | 'build' | 'main' | 'breakdown' | 'outro';
  intensity: number;
};

export type RhythmSongAnalysis = {
  source: string;
  durationSeconds: number;
  bpm: number;
  beatOffsetSeconds: number;
  beats: RhythmBeatAnalysis[];
  onsets: RhythmOnsetAnalysis[];
  bars: RhythmBarAnalysis[];
  sections: RhythmSectionAnalysis[];
};
