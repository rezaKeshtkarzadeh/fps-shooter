import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../../core/PhysicsWorld.ts';
import { CollisionGroups, createInteractionGroups } from '../../config/gameConfig.ts';
import type { HitZone } from '../../weapons/types.ts';
import type {
  BotDifficultyLevel,
  BotTacticalRole,
  CombatLane,
  CoverPoint,
  BotTelemetry,
} from '../types.ts';
import { DIFFICULTY_PRESETS, type DifficultyConfig } from './BotDifficulty.ts';
import { PerceptionSystem, type PerceptionTarget } from '../perception/PerceptionSystem.ts';
import { BotStateMachine } from './BotStateMachine.ts';
import { BotWeapon } from './BotWeapon.ts';
import { BotVisuals } from './BotVisuals.ts';
import type { NavMesh } from '../navigation/NavMesh.ts';
import type { CoverSystem } from '../navigation/CoverSystem.ts';

export interface BotHitboxInfo {
  collider: RAPIER.Collider;
  zone: HitZone;
}

export class BotAgent {
  public id: string;
  public name: string;
  public team: 'ENEMY' | 'FRIENDLY';
  public position: THREE.Vector3;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public health: number = 100;
  public maxHealth: number = 100;
  public isAlive: boolean = true;
  public role: BotTacticalRole = 'ASSAULT';
  public currentLane: CombatLane = 'CENTER_LANE';
  public difficulty: BotDifficultyLevel;
  public difficultyConfig: DifficultyConfig;

  public perception: PerceptionSystem;
  public stateMachine: BotStateMachine;
  public weapon: BotWeapon;
  public visuals: BotVisuals;
  public currentCover: CoverPoint | null = null;

  // Navigation
  public currentPath: THREE.Vector3[] = [];
  public currentPathIndex: number = 0;
  private _navMesh: NavMesh;
  private _coverSystem: CoverSystem;
  private _physicsWorld: PhysicsWorld;
  private _repathTimer: number = 0;

  // Aim & Orientation
  public facingDir: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  public currentYaw: number = 0;
  private _separationImpulse: THREE.Vector3 = new THREE.Vector3();

  // Hitboxes & Physics
  private _body!: RAPIER.RigidBody;
  private _hitboxColliders: BotHitboxInfo[] = [];

  // Respawn
  private _spawnPosition: THREE.Vector3;
  private _respawnTimer: number = 0;

  // Combat callback
  public onKilled?: (killerTeam: string) => void;

  constructor(
    id: string,
    name: string,
    team: 'ENEMY' | 'FRIENDLY',
    spawnPos: THREE.Vector3,
    difficulty: BotDifficultyLevel,
    scene: THREE.Scene,
    physicsWorld: PhysicsWorld,
    navMesh: NavMesh,
    coverSystem: CoverSystem
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.difficulty = difficulty;
    this.difficultyConfig = DIFFICULTY_PRESETS[difficulty];
    this.position = spawnPos.clone();
    this._spawnPosition = spawnPos.clone();

    this._physicsWorld = physicsWorld;
    this._navMesh = navMesh;
    this._coverSystem = coverSystem;

    // Visuals & Weapon
    this.visuals = new BotVisuals(team);
    this.visuals.group.position.copy(this.position);
    scene.add(this.visuals.group);

    this.weapon = new BotWeapon(physicsWorld, team === 'ENEMY' ? 0 : 1); // M4A1 or MP5
    this.perception = new PerceptionSystem(physicsWorld);
    this.stateMachine = new BotStateMachine(this);

    // Setup Physics RigidBody & Multi-Zone Hitboxes
    this._setupPhysicsAndHitboxes();
  }

  private _setupPhysicsAndHitboxes(): void {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      this.position.x,
      this.position.y + 0.9,
      this.position.z
    );
    this._body = this._physicsWorld.world.createRigidBody(bodyDesc);

    const hitscanGroups = createInteractionGroups(
      CollisionGroups.GROUP_HITSCAN | CollisionGroups.GROUP_BOT,
      CollisionGroups.GROUP_HITSCAN | CollisionGroups.GROUP_PLAYER
    );

    // 1. HEAD (r=0.18m at y=0.72)
    const headDesc = RAPIER.ColliderDesc.ball(0.18)
      .setTranslation(0, 0.72, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const headCol = this._physicsWorld.world.createCollider(headDesc, this._body);
    this._hitboxColliders.push({ collider: headCol, zone: 'HEAD' });

    // 2. TORSO (capsule r=0.22, halfHeight=0.28 at y=0.25)
    const torsoDesc = RAPIER.ColliderDesc.capsule(0.28, 0.22)
      .setTranslation(0, 0.25, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const torsoCol = this._physicsWorld.world.createCollider(torsoDesc, this._body);
    this._hitboxColliders.push({ collider: torsoCol, zone: 'TORSO' });

    // 3. STOMACH (cuboid at y=-0.15)
    const stomachDesc = RAPIER.ColliderDesc.cuboid(0.19, 0.12, 0.12)
      .setTranslation(0, -0.15, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const stomachCol = this._physicsWorld.world.createCollider(stomachDesc, this._body);
    this._hitboxColliders.push({ collider: stomachCol, zone: 'STOMACH' });

    // 4. LIMBS (legs & arms)
    const leftLegDesc = RAPIER.ColliderDesc.capsule(0.32, 0.12)
      .setTranslation(-0.13, -0.7, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const rightLegDesc = RAPIER.ColliderDesc.capsule(0.32, 0.12)
      .setTranslation(0.13, -0.7, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const leftLegCol = this._physicsWorld.world.createCollider(leftLegDesc, this._body);
    const rightLegCol = this._physicsWorld.world.createCollider(rightLegDesc, this._body);
    this._hitboxColliders.push({ collider: leftLegCol, zone: 'LIMBS' });
    this._hitboxColliders.push({ collider: rightLegCol, zone: 'LIMBS' });
  }

  public setDifficulty(level: BotDifficultyLevel): void {
    this.difficulty = level;
    this.difficultyConfig = DIFFICULTY_PRESETS[level];
  }

  public setRole(role: BotTacticalRole): void {
    if (this.role === role) return;
    this.role = role;
    // Release previous cover if transitioning to assault/flank
    if (role === 'ASSAULT' || role === 'FLANK') {
      this.releaseCover();
    }
  }

  public isHealthCritical(): boolean {
    const threshold = (this.difficultyConfig.retreatHealthThreshold / 100) * this.maxHealth;
    return this.health <= threshold;
  }

  public resolveHitZone(colliderHandle: number): HitZone | null {
    for (const info of this._hitboxColliders) {
      if (info.collider.handle === colliderHandle) {
        return info.zone;
      }
    }
    return null;
  }

  public lastHitZone: HitZone | null = null;

  public applyDamage(damage: number, zone: HitZone): { killed: boolean } {
    if (!this.isAlive) return { killed: false };

    this.health = Math.max(0, this.health - damage);
    this.lastHitZone = zone;
    this.visuals.triggerHitFlash();

    // Alert reaction on damage
    if (this.stateMachine.currentState === 'PATROL' || this.stateMachine.currentState === 'IDLE') {
      this.stateMachine.setState('TAKE_COVER');
    }

    if (this.health <= 0) {
      this.isAlive = false;
      this.visuals.onDeath();
      this.releaseCover();
      this._respawnTimer = 4.0;
      if (this.onKilled) this.onKilled('PLAYER');
      return { killed: true };
    }

    return { killed: false };
  }

  public applySeparationImpulse(impulse: THREE.Vector3): void {
    this._separationImpulse.add(impulse);
  }

  public releaseCover(): void {
    if (this.currentCover) {
      this._coverSystem.releaseCover(this.currentCover.id, this.id);
      this.currentCover = null;
    }
  }

  public hasReachedDestination(): boolean {
    return this.currentPathIndex >= this.currentPath.length;
  }

  public update(
    dt: number,
    potentialTargets: PerceptionTarget[],
    onHitPlayer?: (damage: number, zone: HitZone) => void
  ): void {
    // 1. Handle Respawn
    if (!this.isAlive) {
      this._respawnTimer -= dt;
      if (this._respawnTimer <= 0) {
        this._respawn();
      }
      return;
    }

    // 2. Update Weapons
    this.weapon.update(dt);
    this.visuals.setMuzzleFlash(this.weapon.muzzleFlashActive);

    // 3. Update Perception (Vision & Hearing)
    const eyePos = new THREE.Vector3(this.position.x, this.position.y + 1.6, this.position.z);
    this.perception.update(
      dt,
      eyePos,
      this.facingDir,
      this.team === 'ENEMY' ? 'ENEMY_BOT' : 'FRIENDLY_BOT',
      this.difficultyConfig,
      potentialTargets
    );

    // 4. Update State Machine
    this.stateMachine.update(dt);

    // 5. Tactical Decision & Navigation Planner
    this._updateTacticalNavigation(dt);

    // 6. Movement execution along path
    this._updateMovement(dt);

    // 7. Combat Aiming & Firing
    this._updateCombatAction(dt, eyePos, onHitPlayer);

    // 8. Sync Visuals and Rapier Physics Body
    this._syncPhysicsAndVisuals(dt);
  }

  private _respawn(): void {
    this.health = this.maxHealth;
    this.isAlive = true;
    this.position.copy(this._spawnPosition);
    this.currentPath = [];
    this.currentPathIndex = 0;
    this.visuals.onRespawn();
    this.stateMachine.setState('PATROL');
  }

  private _updateTacticalNavigation(dt: number): void {
    this._repathTimer += dt;
    const state = this.stateMachine.currentState;
    const memory = this.perception.memory;
    const target = memory.primaryTarget;

    // Determine current lane from X coordinate
    if (this.position.x < -9) this.currentLane = 'LEFT_LANE';
    else if (this.position.x > 9) this.currentLane = 'RIGHT_LANE';
    else this.currentLane = 'CENTER_LANE';

    // Repath every 1.0s or immediately if path finished
    if (this._repathTimer > 1.0 || this.hasReachedDestination()) {
      this._repathTimer = 0;

      switch (state) {
        case 'PATROL': {
          // Select next tactical patrol node in current or adjacent lane
          const patrolTarget = this._pickPatrolWaypoint();
          if (patrolTarget) {
            this.currentPath = this._navMesh.findPath(this.position, patrolTarget);
            this.currentPathIndex = 0;
          }
          break;
        }

        case 'INVESTIGATE': {
          if (memory.investigationPoint) {
            this.currentPath = this._navMesh.findPath(this.position, memory.investigationPoint);
            this.currentPathIndex = 0;
          }
          break;
        }

        case 'TAKE_COVER':
        case 'RETREAT': {
          // Evaluate safe cover away from target or last known threat
          const threatPos = target?.position ?? memory.investigationPoint ?? new THREE.Vector3(0, 0, 0);
          const cover = this._coverSystem.evaluateCover(
            this.position,
            threatPos,
            this.currentLane,
            this.currentCover?.id
          );

          if (cover) {
            this.releaseCover();
            this.currentCover = cover;
            this._coverSystem.occupyCover(cover.id, this.id);
            this.currentPath = this._navMesh.findPath(this.position, cover.position);
            this.currentPathIndex = 0;
          }
          break;
        }

        case 'FLANKING': {
          // Choose outer side lane opposite to direct center sightline
          const flankLane: CombatLane = this.position.x > 0 ? 'RIGHT_LANE' : 'LEFT_LANE';
          const flankNode = this._navMesh.findClosestNode(
            new THREE.Vector3(this.position.x > 0 ? 18 : -18, 0, target?.position.z ?? 0),
            flankLane
          );

          if (flankNode) {
            this.currentPath = this._navMesh.findPath(this.position, flankNode.position);
            this.currentPathIndex = 0;
          }
          break;
        }

        case 'COMBAT_ENGAGE': {
          // Assault role closes in; Support role maintains 12-18m distance
          if (target && this.role === 'ASSAULT') {
            const approachNode = this._navMesh.findClosestNode(target.position);
            if (approachNode && this.position.distanceTo(target.position) > 10) {
              this.currentPath = this._navMesh.findPath(this.position, approachNode.position);
              this.currentPathIndex = 0;
            }
          }
          break;
        }
      }
    }
  }

  private _pickPatrolWaypoint(): THREE.Vector3 | null {
    // Pick random node in arena with balanced lane distribution
    const filteredNodes = this._navMesh.nodes.filter((n) => !n.isCover);
    if (filteredNodes.length === 0) return null;
    const randomNode = filteredNodes[Math.floor(Math.random() * filteredNodes.length)];
    return randomNode.position;
  }

  private _updateMovement(dt: number): void {
    if (this.hasReachedDestination()) {
      this.velocity.set(0, 0, 0);
      return;
    }

    const currentWaypoint = this.currentPath[this.currentPathIndex];
    const toWaypoint = new THREE.Vector3().subVectors(currentWaypoint, this.position);
    toWaypoint.y = 0; // horizontal navigation
    const dist = toWaypoint.length();

    if (dist < 0.6) {
      this.currentPathIndex++;
      return;
    }

    toWaypoint.normalize();

    // Speed based on state & role
    let moveSpeed = 3.6; // standard jog
    if (this.stateMachine.currentState === 'RETREAT' || this.role === 'ASSAULT') {
      moveSpeed = 6.8; // tactical sprint
    } else if (this.stateMachine.currentState === 'TAKE_COVER') {
      moveSpeed = 5.5; // sprint to cover
    }

    this.velocity.copy(toWaypoint).multiplyScalar(moveSpeed);

    // Apply lateral separation impulse from allies to prevent clustering
    if (this._separationImpulse.lengthSq() > 0.001) {
      this.velocity.add(this._separationImpulse);
      this._separationImpulse.multiplyScalar(0.7); // decay impulse
    }

    // Step position
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y = currentWaypoint.y; // match surface elevation (ramp/stairs/platform)

    // Smooth turn towards movement or combat target
    const targetFaceDir =
      this.perception.memory.primaryTarget?.hasLineOfSight &&
      this.stateMachine.currentState === 'COMBAT_ENGAGE'
        ? new THREE.Vector3()
            .subVectors(this.perception.memory.primaryTarget.position, this.position)
            .setY(0)
            .normalize()
        : toWaypoint;

    if (targetFaceDir.lengthSq() > 0.01) {
      const targetYaw = Math.atan2(targetFaceDir.x, targetFaceDir.z);
      // Smooth interpolation of yaw
      const turnRate = this.difficultyConfig.aimTrackSmoothing * dt;
      let diff = targetYaw - this.currentYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.currentYaw += Math.max(-turnRate, Math.min(turnRate, diff));

      this.facingDir.set(Math.sin(this.currentYaw), 0, Math.cos(this.currentYaw)).normalize();
    }
  }

  private _updateCombatAction(
    _dt: number,
    eyePos: THREE.Vector3,
    onHitPlayer?: (damage: number, zone: HitZone) => void
  ): void {
    const target = this.perception.memory.primaryTarget;
    if (!target || !target.hasLineOfSight) return;

    const state = this.stateMachine.currentState;
    const canShoot = state === 'COMBAT_ENGAGE' || (state === 'COMBAT_PEEK' && this.stateMachine.isPeekingOut);

    if (canShoot) {
      // Aim at target (predicting velocity if hard difficulty)
      const targetPos = target.position.clone();
      targetPos.y += 1.4; // upper torso / chest level

      if (this.difficultyConfig.aimLeadTarget) {
        const dist = eyePos.distanceTo(targetPos);
        const bulletFlightTime = dist / 800; // ~800 m/s muzzle velocity
        targetPos.add(target.velocity.clone().multiplyScalar(bulletFlightTime));
      }

      this.visuals.aimAt(targetPos);
      this.weapon.tryStartBurst(this.difficultyConfig);
      this.weapon.fireShot(
        eyePos,
        targetPos,
        this.difficultyConfig,
        this.team === 'ENEMY' ? 'ENEMY_BOT' : 'FRIENDLY_BOT',
        onHitPlayer
      );
    }
  }

  private _syncPhysicsAndVisuals(dt: number): void {
    // Sync Visuals
    this.visuals.group.position.copy(this.position);
    this.visuals.group.rotation.y = this.currentYaw;
    this.visuals.update(dt, this.stateMachine.currentState, this.role);

    // Sync Rapier Kinematic RigidBody
    this._body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y + 0.9,
      z: this.position.z,
    });
  }

  public getTelemetry(): BotTelemetry {
    return {
      id: this.id,
      name: this.name,
      team: this.team,
      role: this.role,
      state: this.stateMachine.currentState,
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      currentLane: this.currentLane,
      hasTargetLOS: this.perception.memory.primaryTarget?.hasLineOfSight ?? false,
      lastHeardSound: this.perception.memory.lastHeardSoundDescription,
      position: {
        x: Number(this.position.x.toFixed(1)),
        y: Number(this.position.y.toFixed(1)),
        z: Number(this.position.z.toFixed(1)),
      },
    };
  }

  public getAllColliderHandles(): number[] {
    return this._hitboxColliders.map((h) => h.collider.handle);
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.visuals.group);
    this.releaseCover();
    for (const h of this._hitboxColliders) {
      this._physicsWorld.world.removeCollider(h.collider, false);
    }
    this._physicsWorld.world.removeRigidBody(this._body);
  }
}
