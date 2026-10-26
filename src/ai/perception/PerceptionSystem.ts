import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../../core/PhysicsWorld.ts';
import { CollisionGroups, createInteractionGroups } from '../../config/gameConfig.ts';
import { AcousticManager } from './AcousticManager.ts';
import { BotMemory } from './BotMemory.ts';
import type { DifficultyConfig } from '../bot/BotDifficulty.ts';

export interface PerceptionTarget {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  eyePosition: THREE.Vector3;
  team: 'PLAYER' | 'ENEMY_BOT' | 'FRIENDLY_BOT';
  isAlive: boolean;
}

export class PerceptionSystem {
  public memory: BotMemory;
  private _physicsWorld: PhysicsWorld;
  private _acousticManager: AcousticManager;
  private _losFilter: number;

  // Visual reaction accumulator
  private _spottingTimer: number = 0;
  private _candidateTarget: PerceptionTarget | null = null;

  constructor(physicsWorld: PhysicsWorld) {
    this._physicsWorld = physicsWorld;
    this._acousticManager = AcousticManager.getInstance();
    this.memory = new BotMemory();
    this._losFilter = createInteractionGroups(
      CollisionGroups.GROUP_HITSCAN,
      CollisionGroups.GROUP_ENVIRONMENT
    );
  }

  public update(
    dt: number,
    botEyePos: THREE.Vector3,
    botFacingDir: THREE.Vector3,
    botTeam: 'ENEMY_BOT' | 'FRIENDLY_BOT',
    difficulty: DifficultyConfig,
    potentialTargets: PerceptionTarget[]
  ): void {
    // 1. Update memory decay & status
    this.memory.update();

    // 2. Perform Vision Scanning
    this._updateVision(dt, botEyePos, botFacingDir, botTeam, difficulty, potentialTargets);

    // 3. Perform Acoustic Hearing Check
    this._updateHearing(botEyePos, botTeam, difficulty);
  }

  private _updateVision(
    dt: number,
    botEyePos: THREE.Vector3,
    botFacingDir: THREE.Vector3,
    botTeam: 'ENEMY_BOT' | 'FRIENDLY_BOT',
    difficulty: DifficultyConfig,
    targets: PerceptionTarget[]
  ): void {
    const fovHalfRad = ((difficulty.fieldOfViewDeg / 2) * Math.PI) / 180;
    const minDot = Math.cos(fovHalfRad);

    let closestVisibleTarget: PerceptionTarget | null = null;
    let closestDist = Infinity;

    for (const target of targets) {
      if (!target.isAlive) continue;
      // Don't target friendly agents on the same team
      if (target.team === botTeam) continue;

      // Distance test
      const dist = botEyePos.distanceTo(target.position);
      if (dist > difficulty.visionMaxRange) continue;

      // Direction vector to target torso
      const dirToTarget = new THREE.Vector3()
        .subVectors(target.eyePosition, botEyePos)
        .normalize();

      // Horizontal FOV angle check
      const dot = botFacingDir.dot(dirToTarget);
      if (dot < minDot) continue;

      // Raycast line of sight check (testing head and torso points)
      const hasLOS = this._checkLineOfSight(botEyePos, target.eyePosition) ||
                     this._checkLineOfSight(botEyePos, target.position);

      if (hasLOS) {
        if (dist < closestDist) {
          closestDist = dist;
          closestVisibleTarget = target;
        }
      }
    }

    if (closestVisibleTarget) {
      // Check reaction time delay based on difficulty
      if (this._candidateTarget?.id === closestVisibleTarget.id) {
        this._spottingTimer += dt;
        if (this._spottingTimer >= difficulty.reactionTimeMin) {
          // Visual contact confirmed!
          this.memory.recordVisualContact(
            closestVisibleTarget.id,
            closestVisibleTarget.position,
            closestVisibleTarget.velocity,
            closestDist
          );
        }
      } else {
        this._candidateTarget = closestVisibleTarget;
        this._spottingTimer = 0;
      }
    } else {
      this._candidateTarget = null;
      this._spottingTimer = 0;

      // If we previously had visual contact with primary target, record lost visual
      if (this.memory.primaryTarget && this.memory.primaryTarget.hasLineOfSight) {
        this.memory.recordLostVisual(this.memory.primaryTarget.targetId);
      }
    }
  }

  private _checkLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.1) return true;

    dir.normalize();
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(from.x, from.y, from.z),
      new RAPIER.Vector3(dir.x, dir.y, dir.z)
    );

    const hit = this._physicsWorld.world.castRay(
      ray,
      dist - 0.2, // subtract small margin to not hit target's own geometry
      true,
      undefined,
      this._losFilter
    );

    return hit === null; // No obstruction means clean line of sight
  }

  private _updateHearing(
    botEyePos: THREE.Vector3,
    botTeam: 'ENEMY_BOT' | 'FRIENDLY_BOT',
    difficulty: DifficultyConfig
  ): void {
    const heardSounds = this._acousticManager.getSoundsNear(
      botEyePos,
      difficulty.hearingSensitivity,
      botTeam
    );

    if (heardSounds.length > 0) {
      const topSound = heardSounds[0]; // loudest or most critical sound

      // Add noise to estimation based on difficulty variance
      const noiseRadius = difficulty.hearingAccuracyVariance * (1 - topSound.loudness * 0.5);
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * noiseRadius;

      const estimatedPos = new THREE.Vector3(
        topSound.event.position.x + Math.cos(angle) * r,
        topSound.event.position.y,
        topSound.event.position.z + Math.sin(angle) * r
      );

      this.memory.recordAudioStimulus(
        estimatedPos,
        topSound.event.type,
        topSound.loudness
      );
    }
  }
}
