import React from 'react';
import './UIOverlay.css';
import type { LoopTelemetry } from '../core/GameLoop.ts';
import type { CharacterState } from '../player/CharacterController.ts';
import type { LocomotionState } from '../player/LocomotionFSM.ts';
import type { WeaponFeedback } from '../weapons/WeaponController.ts';

interface UIOverlayProps {
  isLocked: boolean;
  onRequestLock: () => void;
  telemetry: LoopTelemetry | null;
  characterState: CharacterState | null;
  weaponFeedback: WeaponFeedback | null;
}

const TARGET_BLIPS = [
  { name: 'Target 10m', x: 0, z: -10 },
  { name: 'Target 23m', x: 7, z: -22 },
  { name: 'Target 30m', x: -14, z: -26 },
];

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
  weaponFeedback,
}) => {
  const fsmState = characterState?.fsmState;
  const staminaPercent = Math.max(0, Math.min(100, (characterState?.tacSprintStamina ?? 1) * 100));

  const hasHitmarker = (weaponFeedback?.hitmarkerTimer ?? 0) > 0;
  const isKill = (weaponFeedback?.killmarkerTimer ?? 0) > 0;
  const isADS = weaponFeedback?.isADS ?? false;

  return (
    <div className="ui-container">
      {/* 1. Pointer Lock Blocker Screen */}
      {!isLocked && (
        <div className="blocker-screen" onClick={onRequestLock}>
          <div className="blocker-card">
            <div className="blocker-title">TACTICAL FPS // PHASE 3</div>
            <div className="blocker-subtitle">WEAPONS, BALLISTICS & COMBAT SYSTEM</div>

            <div className="deploy-button">CLICK TO DEPLOY</div>

            <div className="controls-grid">
              <div className="control-item">
                <span className="key-badge">W A S D</span>
                <span>Movement</span>
              </div>
              <div className="control-item">
                <span className="key-badge">L-CLICK</span>
                <span>Fire Weapon</span>
              </div>
              <div className="control-item">
                <span className="key-badge">SHIFT</span>
                <span>Switch Sprint / Tac-Sprint</span>
              </div>
              <div className="control-item">
                <span className="key-badge">R-CLICK</span>
                <span>Toggle Aim Down Sights (ADS)</span>
              </div>
              <div className="control-item">
                <span className="key-badge">C</span>
                <span>Crouch / Slide</span>
              </div>
              <div className="control-item">
                <span className="key-badge">R</span>
                <span>Reload Magazine</span>
              </div>
              <div className="control-item">
                <span className="key-badge">SPACE</span>
                <span>Jump / Slide Cancel / Mantle</span>
              </div>
              <div className="control-item">
                <span className="key-badge">1 2 3 4 / WHEEL</span>
                <span>Switch Weapon</span>
              </div>
            </div>

            <div className="verification-list">
              <div><strong>Phase 3 Combat Highlights:</strong></div>
              <div>• <strong>Dual-Camera Viewmodel:</strong> Anti-clipping depth isolation (60° FOV)</div>
              <div>• <strong>4 Weapon Classes:</strong> M4A1 (AR), MP5 (SMG), AX-50 (Sniper), 1911 (Pistol)</div>
              <div>• <strong>Kinematics & Recoil:</strong> Damped spring kick + elastic camera recovery</div>
              <div>• <strong>Hitbox Dummies:</strong> Head (2.0x), Torso (1.2x), Stomach (1.0x), Limbs (0.8x)</div>
              <div>• <strong>Damage Falloff:</strong> Distance-dependent damage scaling formula</div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Tactical Crosshair & Dynamic Hitmarker */}
      {isLocked && (
        <div className={`crosshair-container ${isADS ? 'ads-active' : ''}`}>
          {!isADS && (
            <div className="crosshair">
              <div className="crosshair-center" />
              <div className="crosshair-bar top" />
              <div className="crosshair-bar bottom" />
              <div className="crosshair-bar left" />
              <div className="crosshair-bar right" />
            </div>
          )}

          {/* Hitmarker / Killmarker */}
          {hasHitmarker && (
            <div className={`hitmarker ${isKill ? 'killmarker' : ''}`}>
              <div className="hitmarker-line tl" />
              <div className="hitmarker-line tr" />
              <div className="hitmarker-line bl" />
              <div className="hitmarker-line br" />
            </div>
          )}

          {/* Hit Damage Float (MW Style matching Image 1) */}
          {hasHitmarker && weaponFeedback && (
            <div className={`hit-toast ${isKill ? 'kill' : ''}`}>
              +{Math.round(weaponFeedback.lastHitDamage)}
              <span className="hit-toast-label">
                {weaponFeedback.lastHitZone === 'HEAD' ? 'HEADSHOT' : weaponFeedback.lastHitZone}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. Weapon HUD (Bottom Right) */}
      {weaponFeedback && (
        <div className="weapon-hud">
          <div className="weapon-header">
            <span className="weapon-name">{weaponFeedback.weaponName}</span>
            <span className="weapon-mode">{weaponFeedback.fireMode}</span>
          </div>

          <div className="ammo-row">
            <span className="ammo-current">{weaponFeedback.ammoMag}</span>
            <span className="ammo-slash">/</span>
            <span className="ammo-reserve">{weaponFeedback.ammoReserve}</span>
          </div>

          {weaponFeedback.weaponState === 'RELOADING' && (
            <div className="reload-bar-container">
              <div
                className="reload-bar-fill"
                style={{ width: `${weaponFeedback.reloadProgress * 100}%` }}
              />
              <span className="reload-text">RELOADING</span>
            </div>
          )}

          {weaponFeedback.weaponState === 'SPRINT_LOWER' && (
            <div className={`weapon-status-tag ${characterState?.fsmState === 'SLIDE' ? 'slide' : 'sprint'}`}>
              {characterState?.fsmState === 'SLIDE' ? 'SLIDING' : 'SPRINTING'}
            </div>
          )}

          {weaponFeedback.weaponState === 'TAC_SPRINT_RAISE' && (
            <div className="weapon-status-tag tacsprint">TAC-SPRINT</div>
          )}

          {weaponFeedback.weaponState === 'SPRINT_TO_FIRE' && (
            <div className="weapon-status-tag s2f">RAISING WEAPON</div>
          )}

          {weaponFeedback.weaponState === 'HOLSTERED' && (
            <div className="weapon-status-tag holster">HOLSTERED</div>
          )}
        </div>
      )}

      {/* 4. Live Diagnostics Panel */}
      <div className="telemetry-panel">
        <div className="telemetry-header">
          <span>SYS.DIAGNOSTICS</span>
          <span className="val-cyan">120 HZ FSM</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">LOCOMOTION:</span>
          <span className={`state-badge ${getStateBadgeClass(fsmState)}`}>
            {fsmState ?? '--'}
          </span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-label">WEAPON FSM:</span>
          <span className="telemetry-val val-cyan">
            {weaponFeedback?.weaponState ?? '--'}
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

      {/* 5. Tactical Minimap Radar (Top Right) */}
      {characterState && (
        <div className="minimap-container">
          <div className="minimap-header">
            <span>TAC.RADAR // 60M</span>
            <span className="minimap-coords">
              X:{characterState.position.x.toFixed(0)} Z:{characterState.position.z.toFixed(0)}
            </span>
          </div>
          <div className="minimap-radar">
            <div className="minimap-grid-h" />
            <div className="minimap-grid-v" />
            <div className="minimap-range-ring" />

            {/* Compass points */}
            <span className="compass-n">N</span>
            <span className="compass-s">S</span>
            <span className="compass-w">W</span>
            <span className="compass-e">E</span>

            {/* Target Dummies (Red Blips) */}
            {TARGET_BLIPS.map((t, idx) => {
              const left = Math.max(4, Math.min(96, ((t.x + 30) / 60) * 100));
              const top = Math.max(4, Math.min(96, ((t.z + 30) / 60) * 100));
              return (
                <div
                  key={idx}
                  className="minimap-blip-target"
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={t.name}
                />
              );
            })}

            {/* Player Blip (Cyan Arrow aligned with Yaw) */}
            <div
              className="minimap-blip-player"
              style={{
                left: `${Math.max(4, Math.min(96, ((characterState.position.x + 30) / 60) * 100))}%`,
                top: `${Math.max(4, Math.min(96, ((characterState.position.z + 30) / 60) * 100))}%`,
                transform: `translate(-50%, -50%) rotate(${Math.round((-characterState.yaw * 180) / Math.PI)}deg)`,
              }}
            >
              <div className="player-arrow" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
