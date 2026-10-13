import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  VideoCanvas,
  type VideoAspectRatio,
  useVideoPlayer,
} from '@/lib/video';
import { VideoPausedContext } from '@/lib/video/hooks';
import { Tour01, Tour02, Tour03, Tour04, Tour05, Tour06, Tour07, Tour08, Tour09, Tour10, TestBadge } from './scenes/TourScenes';
import './tour.css';

export const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';
export const SCENE_DURATIONS: Record<string, number> = {
  open: 7000,
  projects: 9500,
  accountant: 10000,
  expenses: 9000,
  plotting: 9500,
  booking: 9000,
  blueprint3d: 7500,
  marketing: 8000,
  partner: 11500,
  close: 9000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  open: Tour01, projects: Tour02, accountant: Tour03, expenses: Tour04, plotting: Tour05,
  booking: Tour06, blueprint3d: Tour07, marketing: Tour08, partner: Tour09, close: Tour10,
};
const SCENE_START_SECONDS: Record<string, number> = {};
let cumulativeMs = 0;
Object.entries(SCENE_DURATIONS).forEach(([key, duration]) => {
  SCENE_START_SECONDS[key] = cumulativeMs / 1000;
  cumulativeMs += duration;
});

type VideoTemplateProps = {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (key: string) => void;
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: VideoTemplateProps = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousSceneRef = useRef<string | null>(null);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey] ?? Tour01;

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.9;
    if (paused) {
      audio.pause();
      return;
    }
    if (previousSceneRef.current !== currentSceneKey) {
      previousSceneRef.current = currentSceneKey;
      const sceneStart = SCENE_START_SECONDS[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - sceneStart) > 0.25) audio.currentTime = sceneStart;
    }
    void audio.play().catch(() => undefined);
  }, [baseSceneKey, currentScene, currentSceneKey, muted, paused]);

  return (
    <VideoPausedContext.Provider value={paused}>
      <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} className="tour-canvas">
        <AnimatePresence mode="sync" initial={false}>
          <SceneComponent key={currentSceneKey} />
        </AnimatePresence>
        <TestBadge />
        <audio
          ref={audioRef}
          src={`${import.meta.env.BASE_URL}audio/tour_composite.mp3`}
          preload="auto"
          autoPlay
          muted={muted}
        />
      </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}
