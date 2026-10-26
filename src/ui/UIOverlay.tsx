import React from 'react';
import './UIOverlay.css';
import type { LoopTelemetry } from '../core/GameLoop.ts';
import type { CharacterState } from '../player/CharacterController.ts';
import type { LocomotionState } from '../player/LocomotionFSM.ts';
import type { WeaponFeedback } from '../weapons/WeaponController.ts';
import type { BotDifficultyLevel, BotTelemetry } from '../ai/types.ts';
import type { DebugVisualOptions } from '../ai/debug/AIDebugRenderer.ts';
import type { PlayerDamageFeedback } from '../player/PlayerHealth.ts';

interface UIOverlayProps {
  isLocked: boolean;
  onRequestLock: () => void;
  telemetry: LoopTelemetry | null;
  characterState: CharacterState | null;
  weaponFeedback: WeaponFeedback | null;
  botTelemetry: BotTelemetry[];
  playerHealth: PlayerDamageFeedback | null;
  difficulty: BotDifficultyLevel;
  botCount: number;
  debugOptions: DebugVisualOptions;
  onDifficultyChange: (diff: BotDifficultyLevel) => void;
  onBotCountChange: (count: number) => void;
  onToggleDebugOption: (key: keyof DebugVisualOptions) => void;
}

const TARGET_BLIPS = [
  { name: 'Target 10m', x: 0, z: -10 },
  { name: 'Target 23m', x: 7, z: -22 },
  { name: 'Target 30m', x: -14, z: -26 },
];

function getStateBadgeClass(state: LocomotionState | undefined): string {
  switch (state) {
    case 'STAND': return 'stand';
    case 'SPRINT': return 'sprint';
    case 'TACTICAL_SPRINT': return 'tacsprint';
    case 'SLIDE': return 'slide';
    case 'CROUCH': return 'crouch';
    case 'PRONE': return 'prone';
    case 'MANTLE': return 'mantle';
    case 'LADDER': return 'ladder';
    case 'IN_AIR': return 'air';
    default: return 'stand';
  }
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'ASSAULT': return 'role-assault';
    case 'FLANK': return 'role-flank';
    case 'SUPPORT': return 'role-support';
    case 'RETREAT': return 'role-retreat';
    default: return '';
  }
}

function getBotStateBadgeClass(state: string): string {
  switch (state) {
    case 'COMBAT_ENGAGE':
    case 'COMBAT_PEEK': return 'bot-combat';
    case 'FLANKING': return 'bot-flank';
    case 'TAKE_COVER':
    case 'RETREAT': return 'bot-retreat';
    case 'INVESTIGATE': return 'bot-investigate';
    default: return 'bot-patrol';
  }
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  isLocked,
  onRequestLock,
  telemetry,
  characterState,
  weaponFeedback,
  botTelemetry,
  playerHealth,
  difficulty,
  botCount,
  debugOptions,
  onDifficultyChange,
  onBotCountChange,
  onToggleDebugOption,
}) => {
  const fsmState = characterState?.fsmState;
  const staminaPercent = Math.max(0, Math.min(100, (characterState?.tacSprintStamina ?? 1) * 100));

  const hasHitmarker = (weaponFeedback?.hitmarkerTimer ?? 0) > 0;
  const isKill = (weaponFeedback?.killmarkerTimer ?? 0) > 0;
  const isADS = weaponFeedback?.isADS ?? false;

  const currentHp = playerHealth?.health ?? 100;
  const maxHp = playerHealth?.maxHealth ?? 100;
  const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const isPlayerDead = playerHealth?.isDead ?? false;
  const hasDamageFlash = (playerHealth?.damageFlashTimer ?? 0) > 0;

  return (
    <div className="ui-container">
      {/* 0. Red Damage Vignette & Death Overlay */}
      {(hasDamageFlash || isPlayerDead) && (
        <div className={`damage-vignette ${isPlayerDead ? 'dead' : 'hit'}`} />
      )}

      {isPlayerDead && (
        <div className="death-banner">
          <div className="death-title">KIA // RESPAWNING IN 3S</div>
          <div className="death-subtitle">TACTICAL SQUAD ENGAGEMENT</div>
        </div>
      )}

      {/* 1. Pointer Lock Blocker Screen */}
      {!isLocked && (
        <div className="blocker-screen" onClick={onRequestLock}>
          <div className="blocker-card" onClick={(e) => e.stopPropagation()}>
            <div className="blocker-title">TACTICAL FPS // PHASE 5</div>
            <div className="blocker-subtitle">ADVANCED TACTICAL BOT AI & COMBAT SQUAD</div>

            <div className="deploy-button" onClick={onRequestLock}>CLICK TO DEPLOY</div>

            {/* In-Game Match Setup Toolbar */}
            <div className="phase5-config-card">
              <div className="config-section-title">AI MATCH CONFIGURATION</div>
              <div className="config-row">
                <span className="config-label">BOT DIFFICULTY:</span>
                <div className="diff-btn-group">
                  {(['EASY', 'MEDIUM', 'HARD'] as BotDifficultyLevel[]).map((d) => (
                    <button
                      key={d}
                      className={`diff-btn ${difficulty === d ? 'active' : ''}`}
                      onClick={() => onDifficultyChange(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-row">
                <span className="config-label">BOT SQUAD COUNT:</span>
                <div className="count-btn-group">
                  {[1, 2, 3, 4, 6].map((c) => (
                    <button
                      key={c}
                      className={`count-btn ${botCount === c ? 'active' : ''}`}
                      onClick={() => onBotCountChange(c)}
                    >
                      {c} BOTS
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-row">
                <span className="config-label">DEBUG VISUALIZATIONS:</span>
                <div className="toggle-btn-group">
                  <button
                    className={`toggle-btn ${debugOptions.showNavMesh ? 'active' : ''}`}
                    onClick={() => onToggleDebugOption('showNavMesh')}
                  >
                    NAVMESH
                  </button>
                  <button
                    className={`toggle-btn ${debugOptions.showCoverPoints ? 'active' : ''}`}
                    onClick={() => onToggleDebugOption('showCoverPoints')}
                  >
                    COVER PTS
                  </button>
                  <button
                    className={`toggle-btn ${debugOptions.showBotPaths ? 'active' : ''}`}
                    onClick={() => onToggleDebugOption('showBotPaths')}
                  >
                    BOT PATHS
                  </button>
                  <button
                    className={`toggle-btn ${debugOptions.showSoundEvents ? 'active' : ''}`}
                    onClick={() => onToggleDebugOption('showSoundEvents')}
                  >
                    SOUND WAVES
                  </button>
                </div>
              </div>
            </div>

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
              <div><strong>Phase 5 AI Capabilities:</strong></div>
              <div>• <strong>NavMesh & Cover:</strong> Multi-lane A* pathfinding with tactical cover scoring</div>
              <div>• <strong>Perception:</strong> Raycast FOV line-of-sight & acoustic hearing (gunshots & footsteps)</div>
              <div>• <strong>Team Tactics:</strong> Dynamic roles (Assault, Flank, Support, Retreat) & anti-clustering</div>
              <div>• <strong>Difficulty:</strong> Easy, Medium, Hard (Fair reaction times & aim spread)</div>
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

          {/* Hit Damage Float */}
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

      {/* 3. Player Health Status (Bottom Left) */}
      {isLocked && (
        <div className="player-health-card">
          <div className="health-row">
            <span className="health-label">OPERATOR HP</span>
            <span className={`health-value ${hpPercent < 35 ? 'critical' : ''}`}>
              {currentHp} / {maxHp}
            </span>
          </div>
          <div className="health-bar-container">
            <div
              className={`health-bar-fill ${hpPercent < 35 ? 'critical' : hpPercent < 65 ? 'medium' : ''}`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* 4. Weapon HUD (Bottom Right) */}
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

      {/* 5. Live Bot Squad AI Diagnostics Panel (Left) */}
      <div className="bot-squad-panel">
        <div className="telemetry-header">
          <span>AI SQUAD TACTICS</span>
          <span className="val-cyan">{difficulty} // {botTelemetry.length} BOTS</span>
        </div>

        {botTelemetry.map((bot) => (
          <div key={bot.id} className="bot-card">
            <div className="bot-card-top">
              <span className="bot-name">{bot.name}</span>
              <span className={`bot-badge ${getRoleBadgeClass(bot.role)}`}>{bot.role}</span>
              <span className={`bot-badge ${getBotStateBadgeClass(bot.state)}`}>{bot.state}</span>
              {bot.hasTargetLOS && <span className="bot-los-badge">LOS</span>}
            </div>
            <div className="bot-card-details">
              <span>Lane: {bot.currentLane.replace('_LANE', '')}</span>
              <span>HP: {bot.health}</span>
              {bot.lastHeardSound && <span className="sound-alert">[{bot.lastHeardSound}]</span>}
            </div>
            <div className="bot-health-bar">
              <div
                className="bot-health-fill"
                style={{
                  width: `${(bot.health / bot.maxHealth) * 100}%`,
                  backgroundColor: bot.health < 30 ? '#ef4444' : '#38bdf8',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 6. Live Engine Diagnostics Panel (Bottom Center) */}
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
          <span className="telemetry-label">RENDER FPS:</span>
          <span className="telemetry-val val-green">{telemetry ? telemetry.fps : '--'}</span>
          <span className="telemetry-label" style={{ marginLeft: '10px' }}>TPS:</span>
          <span className="telemetry-val val-green">{telemetry ? telemetry.tps : '--'}</span>
        </div>
      </div>

      {/* 7. Tactical Minimap Radar (Top Right) */}
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

            {/* Target Dummies */}
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

            {/* Tactical Bots (Red Enemy Blips with labels) */}
            {botTelemetry.map((bot) => {
              if (bot.health <= 0) return null;
              const left = Math.max(4, Math.min(96, ((bot.position.x + 30) / 60) * 100));
              const top = Math.max(4, Math.min(96, ((bot.position.z + 30) / 60) * 100));
              return (
                <div
                  key={bot.id}
                  className="minimap-blip-bot"
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={`${bot.name} (${bot.role})`}
                >
                  <span className="bot-blip-label">{bot.name[0]}</span>
                </div>
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
