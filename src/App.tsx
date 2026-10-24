import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './core/GameEngine.ts';
import type { LoopTelemetry } from './core/GameLoop.ts';
import type { CharacterState } from './player/CharacterController.ts';
import type { WeaponFeedback } from './weapons/WeaponController.ts';
import { UIOverlay } from './ui/UIOverlay.tsx';
import './App.css';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<LoopTelemetry | null>(null);
  const [characterState, setCharacterState] = useState<CharacterState | null>(null);
  const [weaponFeedback, setWeaponFeedback] = useState<WeaponFeedback | null>(null);

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
        // Throttle React state updates to 10 Hz to keep rendering lightweight
        const now = performance.now();
        if (now - lastStateUpdateTime >= 100) {
          lastStateUpdateTime = now;
          setCharacterState(state);
        }
      },
      onWeaponFeedback: (feedback) => {
        setWeaponFeedback(feedback);
      },
    });

    engineRef.current = engine;

    engine.init(canvasRef.current).catch((err) => {
      console.error('Failed to initialize GameEngine:', err);
    });

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleRequestLock = () => {
    if (engineRef.current) {
      engineRef.current.requestLock();
    }
  };

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <UIOverlay
        isLocked={isLocked}
        onRequestLock={handleRequestLock}
        telemetry={telemetry}
        characterState={characterState}
        weaponFeedback={weaponFeedback}
      />
    </div>
  );
}
