import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const DETAILS = ['Opening','Multiple projects','Accountant dashboard','Expenses & passbook','Open plotting','Booking & collections','Blueprint 3D','Marketing links','Partner mobile & reminders','Brand close'];

function formatTime(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function VideoWithControls() {
  const iframed = typeof window !== 'undefined' && window.self !== window.top;
  const controls = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensor = useRef<HTMLDivElement | null>(null);
  const handleJump = useCallback((index: number) => {
    controls.jumpTo(index);
    window.parent.postMessage({
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: DETAILS.length,
        sceneTitle: DETAILS[index],
        filePath: 'src/components/video/scenes/TourScenes.tsx',
        lineNumber: 1,
      },
    }, '*');
  }, [controls.jumpTo]);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      if (!value) {
        setHovering(false);
        setTapPinned(false);
      }
      return !value;
    });
  }, []);

  useEffect(() => {
    if (!controls.paused) return undefined;
    const running = document.getAnimations().filter((animation) => animation.playState === 'running');
    running.forEach((animation) => animation.pause());
    return () => running.forEach((animation) => animation.play());
  }, [controls.paused]);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onOutside = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && sensor.current && !sensor.current.contains(event.target as Node)) {
        setTapPinned(false);
      }
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [collapsed, tapPinned]);

  if (!iframed) return <VideoTemplate />;

  const keys = controls.sceneKeys;
  const start = keys.slice(0, controls.activeIndex).reduce((sum, key) => sum + SCENE_DURATIONS[key], 0);
  const elapsed = start + Math.min(controls.activeDuration, controls.elapsed);
  const visible = !collapsed || hovering || tapPinned;

  return (
    <div className="film-shell">
      <VideoTemplate
        key={controls.mountKey}
        durations={controls.durations}
        loop
        paused={controls.paused}
        muted={muted}
        onSceneChange={controls.onSceneChange}
      />
      <div
        ref={sensor}
        className="control-sensor"
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovering(true); }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovering(false); }}
        onPointerDown={(event) => { if (event.pointerType !== 'mouse' && collapsed) setTapPinned(true); }}
      >
        <div className="control-sensor-fill" />
        <div className={`film-controls ${visible ? 'is-visible' : 'is-hidden'}`} aria-hidden={!visible}>
          <button className="film-control-button" aria-label={controls.paused ? 'Play' : 'Pause'} onClick={controls.togglePause}>
            {controls.paused ? <Play /> : <Pause />}
          </button>
          <button className={`film-control-button ${controls.locked ? 'is-selected' : ''}`} aria-label="Toggle scene loop" aria-pressed={controls.locked} onClick={controls.toggleLock}>
            <Repeat />
          </button>
          <button className="film-control-button" aria-label={muted ? 'Unmute audio' : 'Mute audio'} onClick={() => setMuted((value) => !value)}>
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <div className="film-controls-divider" />
          <div className="film-progress">
            {keys.map((key, index) => {
              const progress = index < controls.activeIndex ? 100 : index > controls.activeIndex ? 0 : Math.min(100, (controls.elapsed / controls.activeDuration) * 100);
              return (
                <button key={key} aria-label={`Jump to ${DETAILS[index]}`} aria-current={index === controls.activeIndex} onClick={() => handleJump(index)}>
                  <span style={{ width: `${progress}%` }} />
                </button>
              );
            })}
          </div>
          <div className="film-control-count">{controls.activeIndex + 1}/{keys.length}</div>
          <div className="film-control-time" role="timer">{formatTime(elapsed)} / {formatTime(controls.totalDuration)}</div>
          <button className="film-control-button" aria-label={collapsed ? 'Show controls' : 'Hide controls'} aria-expanded={!collapsed} onClick={toggleCollapsed}>
            {collapsed ? <ChevronUp /> : <ChevronDown />}
          </button>
        </div>
      </div>
    </div>
  );
}
