import type { RhythmSong } from './rhythmTiming';

export type RhythmMusicClock = {
  getCountInBeat: () => number | null;
  getSongTime: () => number;
  isCountingIn: () => boolean;
};

export type RhythmMusicPlayer = RhythmMusicClock & {
  dispose: () => void;
  pause: () => void;
  playWithCountIn: () => Promise<void>;
  preload: () => Promise<void>;
  stop: () => void;
  unlock: () => Promise<void>;
};

export function createRhythmMusicPlayer(song: RhythmSong): RhythmMusicPlayer {
  let context: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let buffer: AudioBuffer | null = null;
  let bufferPromise: Promise<AudioBuffer> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let countInClicks: OscillatorNode[] = [];
  let playbackOffset = 0;
  let scheduledStart = 0;
  let playing = false;

  const ensureContext = (): AudioContext | null => {
    if (context) {
      return context;
    }
    if (typeof window.AudioContext === 'undefined') {
      return null;
    }
    context = new AudioContext();
    musicGain = context.createGain();
    musicGain.gain.value = 0.58;
    musicGain.connect(context.destination);
    return context;
  };

  const preload = async (): Promise<void> => {
    const audioContext = ensureContext();
    if (!audioContext || buffer) {
      return;
    }
    bufferPromise ??= fetch(song.audioUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load rhythm music: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((data) => audioContext.decodeAudioData(data));
    buffer = await bufferPromise;
  };

  const getSongTime = (): number => {
    if (!playing || !context) {
      return playbackOffset;
    }
    return Math.min(
      song.durationSeconds,
      playbackOffset + Math.max(0, context.currentTime - scheduledStart)
    );
  };

  const clearSources = (): void => {
    const activeSource = source;
    source = null;
    if (activeSource) {
      try {
        activeSource.stop();
      } catch {
        // The source may already have ended naturally.
      }
      activeSource.disconnect();
    }
    countInClicks.forEach((click) => {
      try {
        click.stop();
      } catch {
        // A scheduled click may already have completed.
      }
      click.disconnect();
    });
    countInClicks = [];
  };

  const scheduleCountIn = (audioContext: AudioContext): void => {
    if (!musicGain) {
      return;
    }
    const secondsPerBeat = 60 / song.bpm;
    for (let beat = song.beatsPerBar; beat > 0; beat -= 1) {
      const clickTime = scheduledStart - beat * secondsPerBeat;
      const click = audioContext.createOscillator();
      const clickGain = audioContext.createGain();
      click.frequency.value = beat === song.beatsPerBar ? 1_100 : 820;
      clickGain.gain.setValueAtTime(0.0001, clickTime);
      clickGain.gain.exponentialRampToValueAtTime(0.24, clickTime + 0.004);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, clickTime + 0.065);
      click.connect(clickGain);
      clickGain.connect(musicGain);
      click.start(clickTime);
      click.stop(clickTime + 0.07);
      countInClicks.push(click);
    }
  };

  const unlock = async (): Promise<void> => {
    const audioContext = ensureContext();
    if (audioContext?.state === 'suspended') {
      await audioContext.resume();
    }
  };

  const playWithCountIn = async (): Promise<void> => {
    if (playing || playbackOffset >= song.durationSeconds) {
      return;
    }
    await preload();
    await unlock();
    if (!context || !musicGain || !buffer) {
      return;
    }

    const secondsPerBeat = 60 / song.bpm;
    scheduledStart = context.currentTime + song.beatsPerBar * secondsPerBeat;
    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(musicGain);
    source.start(scheduledStart, playbackOffset);
    playing = true;
    scheduleCountIn(context);
  };

  const pause = (): void => {
    if (!playing) {
      return;
    }
    playbackOffset = getSongTime();
    playing = false;
    clearSources();
  };

  const stop = (): void => {
    pause();
    playbackOffset = 0;
  };

  return {
    dispose: () => {
      stop();
      const activeContext = context;
      context = null;
      musicGain = null;
      buffer = null;
      bufferPromise = null;
      if (activeContext) {
        void activeContext.close();
      }
    },
    getCountInBeat: () => {
      if (!playing || !context || context.currentTime >= scheduledStart) {
        return null;
      }
      return Math.ceil((scheduledStart - context.currentTime) / (60 / song.bpm));
    },
    getSongTime,
    isCountingIn: () => playing && context !== null && context.currentTime < scheduledStart,
    pause,
    playWithCountIn,
    preload,
    stop,
    unlock,
  };
}
