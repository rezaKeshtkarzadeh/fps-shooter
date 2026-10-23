import React from 'react';
import './UIOverlay.css';
import type { LoopTelemetry } from '../core/GameLoop.ts';
import type { CharacterState } from '../player/CharacterController.ts';
import type { LocomotionState } from '../player/LocomotionFSM.ts';

interface UIOverlayProps {
  isLocked: boolean;
  onRequestLock: () => void;
  telemetry: LoopTelemetry | null;
  characterState: CharacterState | null;
}

function getStateBadgeClass(state: LocomotionState | undefined): string {
  switch (state) {
    case 'STAND':
      return 'stand';
    case 'SPRINT':
      return 'sprint';
    case 'TACTICAL_SPRINT':
      return 'tacsprint';
    case 'SLIDE':
      return 'slide';
    case 'CROUCH':
      return 'crouch';
    case 'PRONE':
      return 'prone';
    case 'MANTLE':
      return 'mantle';
    case 'LADDER':
      return 'ladder';
    case 'IN_AIR':
      return 'air';
    default:
      return 'stand';
  }
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  isLocked,
  onRequestLock,
  telemetry,
  characterState,
}) => {
  const fsmState = characterState?.fsmState;
  const staminaPercent = Math.max(0, Math.min(100, (characterState?.tacSprintStamina ?? 1) * 100));

  return (
    <div className="ui-container">
      {/* 1. Pointer Lock Blocker Screen */}
      {!isLocked && (
        <div className="blocker-screen" onClick={onRequestLock}>
          <div className="blocker-card">
            <div className="blocker-title">TACTICAL FPS // PHASE 2</div>
            <div className="blocker-subtitle">ADVANCED LOCOMOTION & TRAVERSAL FSM</div>

            <div className="deploy-button">CLICK TO DEPLOY</div>

            <div className="controls-grid">
              <div className="control-item">
                <span className="key-badge">W A S D</span>
                <span>Movement</span>
              </div>
              <div className="control-item">
                <span className="key-badge">SHIFT</span>
                <span>Sprint / Double-tap Tac-Sprint</span>
              </div>
              <div className="control-item">
                <span className="key-badge">C</span>
                <span>Crouch / Slide (while sprinting)</span>
              </div>
              <div className="control-item">
                <span className="key-badge">Z / CTRL</span>
                <span>Prone Stance</span>
              </div>
              <div className="control-item">
                <span className="key-badge">SPACE</span>
                <span>Jump / Mantle Ledge / Ladder Push-off</span>
              </div>
              <div className="control-item">
                <span className="key-badge">ESC</span>
                <span>Pause / Unlock Mouse</span>
              </div>
            </div>

            <div className="verification-list">
              <div><strong>Phase 2 Traversal Highlights:</strong></div>
              <div>• <strong>Ceiling Raycast Check:</strong> 1.35m Tunnel prevents un-crouch clipping</div>
              <div>• <strong>Dual-Ray Mantle:</strong> 1.2m & 1.7m barriers with Bézier trajectory</div>
              <div>• <strong>Slide Physics:</strong> Slope acceleration down 25° ramp & Dutch roll</div>
              <div>• <strong>Ladder Kinematics:</strong> 4.0m tower climb with top dismount & Space jump</div>
              <div>• <strong>Procedural Camera:</strong> Critically damped spring & Lissajous head bob</div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Tactical Crosshair */}
      {isLocked && (
        <div className="crosshair">
          <div className="crosshair-center" />
          <div className="crosshair-bar top" />
          <div className="crosshair-bar bottom" />
          <div className="crosshair-bar left" />
          <div className="crosshair-bar right" />
        </div>
      )}

      {/* 3. Live Diagnostics Panel */}
      <div className="telemetry-panel">
        <div className="telemetry-header">
          <span>SYS.DIAGNOSTICS</span>
          <span className="val-cyan">120 HZ FSM</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">LOCOMOTION FSM:</span>
          <span className={`state-badge ${getStateBadgeClass(fsmState)}`}>
            {fsmState ?? '--'}
          </span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">TAC-SPRINT STAMINA:</span>
          <span className="telemetry-val val-cyan">{staminaPercent.toFixed(0)}%</span>
        </div>
        <div className="stamina-bar-container">
          <div
            className={`stamina-bar-fill ${staminaPercent <= 0 ? 'cooldown' : ''}`}
            style={{ width: `${staminaPercent}%` }}
          />
        </div>

        <div className="telemetry-row" style={{ marginTop: '8px' }}>
          <span className="telemetry-label">HORIZ SPEED:</span>
          <span className="telemetry-val val-cyan">
            {characterState ? `${characterState.horizontalSpeed.toFixed(2)} m/s` : '--'}
          </span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">RENDER FPS:</span>
          <span className="telemetry-val val-green">{telemetry ? telemetry.fps : '--'}</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">PHYSICS TPS:</span>
          <span className="telemetry-val val-green">{telemetry ? telemetry.tps : '--'}</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">GROUNDED:</span>
          <span
            className={`telemetry-val ${
              characterState?.isGrounded ? 'val-green' : 'val-amber'
            }`}
          >
            {characterState ? (characterState.isGrounded ? 'YES' : 'AIRBORNE') : '--'}
          </span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">POSITION (X/Y/Z):</span>
          <span className="telemetry-val">
            {characterState
              ? `${characterState.position.x.toFixed(1)}, ${characterState.position.y.toFixed(1)}, ${characterState.position.z.toFixed(1)}`
              : '--'}
          </span>
        </div>

        {characterState?.isCeilingBlocked && (
          <div className="ceiling-warning">
            [!] CEILING CLEARANCE BLOCKED
          </div>
        )}
      </div>
    </div>
  );
};
