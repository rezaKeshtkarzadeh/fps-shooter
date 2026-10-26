import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './core/GameEngine.ts';
import type { LoopTelemetry } from './core/GameLoop.ts';
import type { CharacterState } from './player/CharacterController.ts';
import type { WeaponFeedback } from './weapons/WeaponController.ts';
import type { BotDifficultyLevel, BotTelemetry } from './ai/types.ts';
import type { DebugVisualOptions } from './ai/debug/AIDebugRenderer.ts';
import type { PlayerDamageFeedback } from './player/PlayerHealth.ts';
import { UIOverlay } from './ui/UIOverlay.tsx';
import './App.css';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<LoopTelemetry | null>(null);
  const [characterState, setCharacterState] = useState<CharacterState | null>(null);
  const [weaponFeedback, setWeaponFeedback] = useState<WeaponFeedback | null>(null);
  const [botTelemetry, setBotTelemetry] = useState<BotTelemetry[]>([]);
  const [playerHealth, setPlayerHealth] = useState<PlayerDamageFeedback | null>(null);

  // Settings & Toggles
  const [difficulty, setDifficulty] = useState<BotDifficultyLevel>('MEDIUM');
  const [botCount, setBotCount] = useState<number>(3);
  const [debugOptions, setDebugOptions] = useState<DebugVisualOptions>({
    showNavMesh: false,
    showCoverPoints: false,
    showBotPaths: true,
    showVisionCones: false,
    showSoundEvents: true,
  });

  useEffect(() => {
    if (!canvasRef.current) return;

    let lastStateUpdateTime = 0;

    const engine = new GameEngine({
      onLockChange: (locked) => {
        setIsLocked(locked);
      },
      onTelemetry: (data) => {
        setTelemetry(data);
      },
      onCharacterState: (state) => {
        const now = performance.now();
        if (now - lastStateUpdateTime >= 100) {
          lastStateUpdateTime = now;
          setCharacterState(state);
        }
      },
      onWeaponFeedback: (feedback) => {
        setWeaponFeedback(feedback);
      },
      onBotTelemetry: (bots) => {
        setBotTelemetry(bots);
      },
      onPlayerHealthFeedback: (health) => {
        setPlayerHealth(health);
      },
    })

    engineRef.current = engine;

    engine.init(canvasRef.current).catch((err) => {
      console.error('Failed to initialize GameEngine:', err);
    })

    return () => {
      engine.dispose();
      engineRef.current = null;
    }
  }, [])

  const handleRequestLock = () => {
    if (engineRef.current) {
      engineRef.current.requestLock();
    }
  }

  const handleDifficultyChange = (newDiff: BotDifficultyLevel) => {
    setDifficulty(newDiff);
    if (engineRef.current) {
      engineRef.current.setBotDifficulty(newDiff);
    }
  }

  const handleBotCountChange = (count: number) => {
    setBotCount(count);
    if (engineRef.current) {
      engineRef.current.setBotSquadCount(count);
    }
  }

  const handleToggleDebugOption = (key: keyof DebugVisualOptions) => {
    setDebugOptions((prev) => {
      const nextVal = !prev[key];
      if (engineRef.current) {
        engineRef.current.setDebugVisualOption(key, nextVal);
      }
      return { ...prev, [key]: nextVal };
    })
  }

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <UIOverlay
        isLocked={isLocked}
        onRequestLock={handleRequestLock}
        telemetry={telemetry}
        characterState={characterState}
        weaponFeedback={weaponFeedback}
        botTelemetry={botTelemetry}
        playerHealth={playerHealth}
        difficulty={difficulty}
        botCount={botCount}
        debugOptions={debugOptions}
        onDifficultyChange={handleDifficultyChange}
        onBotCountChange={handleBotCountChange}
        onToggleDebugOption={handleToggleDebugOption}
      />
    </div>
  )
}
