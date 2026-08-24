import { useEffect, useMemo } from 'react';
import { HAND_RHYTHM_PLAYBACK } from '../../handRhythmSongMetadata';
import { createRhythmMusicPlayer } from '../../rhythmMusicPlayer';

export function useHandRhythmMusic(): ReturnType<typeof createRhythmMusicPlayer> {
  const music = useMemo(() => createRhythmMusicPlayer(HAND_RHYTHM_PLAYBACK), []);

  useEffect(() => {
    void music.preload().catch(() => undefined);
    return () => music.dispose();
  }, [music]);

  return music;
}
