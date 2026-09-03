import { useEffect, useMemo } from 'react';
import { getSong, type SongId } from './songCatalog';
import { createRhythmMusicPlayer } from './rhythmMusicPlayer';

export function useGameMusic(songId: SongId): ReturnType<typeof createRhythmMusicPlayer> {
  const music = useMemo(() => createRhythmMusicPlayer(getSong(songId)), [songId]);

  useEffect(() => {
    void music.preload().catch(() => undefined);
    return () => music.dispose();
  }, [music]);

  return music;
}
