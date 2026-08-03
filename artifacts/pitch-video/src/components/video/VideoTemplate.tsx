import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene0Chaos } from './video_scenes/Scene0Chaos';
import { Scene1Problem } from './video_scenes/Scene1Problem';
import { Scene2Solution } from './video_scenes/Scene2Solution';
import { Scene3AIPM } from './video_scenes/Scene3AIPM';
import { Scene4Finance } from './video_scenes/Scene4Finance';
import { Scene5Field } from './video_scenes/Scene5Field';
import { Scene6Outro } from './video_scenes/Scene6Outro';

export const SCENE_DURATIONS = {
  chaos: 4500,
  problem: 4000,
  solution: 5000,
  aipm: 4500,
  finance: 4500,
  field: 4500,
  outro: 5500,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  chaos: Scene0Chaos,
  problem: Scene1Problem,
  solution: Scene2Solution,
  aipm: Scene3AIPM,
  finance: Scene4Finance,
  field: Scene5Field,
  outro: Scene6Outro,
};

const AUDIO_SEEK_EPSILON_SEC = 0.18;

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <>
      <div className="w-full h-screen overflow-hidden relative bg-bg-dark font-body">
        {/* Persistent Background Layer */}
        <div className="absolute inset-0 z-0">
          <motion.div
            className="absolute w-[80vw] h-[80vw] rounded-full opacity-10 blur-[100px]"
            style={{ background: 'radial-gradient(circle, var(--color-accent), transparent 70%)' }}
            animate={{
              x: ['-20%', '40%', '10%', '-10%'],
              y: ['-20%', '-10%', '30%', '-20%'],
              scale: [1, 1.2, 0.9, 1],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute w-[60vw] h-[60vw] rounded-full opacity-10 blur-[80px] right-0 bottom-0"
            style={{ background: 'radial-gradient(circle, var(--color-accent-dark), transparent 70%)' }}
            animate={{
              x: ['20%', '-30%', '0%', '20%'],
              y: ['20%', '10%', '-30%', '20%'],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Grid Overlay */}
        <div
          className="absolute inset-0 z-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '4vw 4vw',
          }}
        />

        {/* Scene Content */}
        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </>
  );
}
