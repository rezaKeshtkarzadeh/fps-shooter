import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ALL_WEAPONS } from '../../weapons/weaponConfigs.ts';
import type { WeaponDefinition, HitZone } from '../../weapons/types.ts';
import { calculateDamage } from '../../weapons/types.ts';
import { PhysicsWorld } from '../../core/PhysicsWorld.ts';
import { CollisionGroups, createInteractionGroups } from '../../config/gameConfig.ts';
import { AcousticManager } from '../perception/AcousticManager.ts';
import type { DifficultyConfig } from './BotDifficulty.ts';

export class BotWeapon {
  public definition: WeaponDefinition;
  public ammoInMag: number;
  public isReloading: boolean = false;

  private _physicsWorld: PhysicsWorld;
  private _hitscanFilter: number;
  private _fireCooldown: number = 0;
  private _reloadTimer: number = 0;
  private _burstShotsRemaining: number = 0;
  private _burstPauseTimer: number = 0;

  // Visual muzzle flash
  public muzzleFlashActive: boolean = false;
  private _muzzleFlashTimer: number = 0;

  constructor(physicsWorld: PhysicsWorld, weaponIndex: number = 0) {
    this._physicsWorld = physicsWorld;
    this.definition = ALL_WEAPONS[weaponIndex] ?? ALL_WEAPONS[0];
    this.ammoInMag = this.definition.ammo.magCapacity;
    this._hitscanFilter = createInteractionGroups(
      CollisionGroups.GROUP_HITSCAN,
      CollisionGroups.GROUP_PLAYER | CollisionGroups.GROUP_ENVIRONMENT | CollisionGroups.GROUP_BOT
    );
  }

  public update(dt: number): void {
    if (this._fireCooldown > 0) this._fireCooldown -= dt;
    if (this._burstPauseTimer > 0) this._burstPauseTimer -= dt;

    if (this.muzzleFlashActive) {
      this._muzzleFlashTimer -= dt;
      if (this._muzzleFlashTimer <= 0) {
        this.muzzleFlashActive = false;
      }
    }

    if (this.isReloading) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) {
        this.ammoInMag = this.definition.ammo.magCapacity;
        this.isReloading = false;
      }
    }
  }

  public tryStartBurst(difficulty: DifficultyConfig): void {
    if (this.isReloading || this._burstPauseTimer > 0) return;

    if (this.ammoInMag <= 0) {
      this.reload();
      return;
    }

    if (this._burstShotsRemaining <= 0) {
      const minB = difficulty.burstCountMin;
      const maxB = difficulty.burstCountMax;
      this._burstShotsRemaining = Math.floor(minB + Math.random() * (maxB - minB + 1));
    }
  }

  public fireShot(
    origin: THREE.Vector3,
    targetEyePos: THREE.Vector3,
    difficulty: DifficultyConfig,
    botTeam: 'ENEMY_BOT' | 'FRIENDLY_BOT',
    onHitPlayer?: (damage: number, zone: HitZone) => void
  ): boolean {
    if (this.isReloading || this._fireCooldown > 0 || this._burstPauseTimer > 0) return false;

    if (this.ammoInMag <= 0) {
      this.reload();
      return false;
    }

    // 1. Consume ammo
    this.ammoInMag--;
    this._fireCooldown = 60 / this.definition.fireRateRPM;
    this._burstShotsRemaining--;

    // 2. Compute firing direction with difficulty aim spread
    const dir = new THREE.Vector3().subVectors(targetEyePos, origin).normalize();

    // Aim spread error
    const spread = difficulty.aimSpreadBase;
    const rx = (Math.random() - 0.5) * spread;
    const ry = (Math.random() - 0.5) * spread;
    const rz = (Math.random() - 0.5) * spread;
    dir.add(new THREE.Vector3(rx, ry, rz)).normalize();

    // 3. Trigger muzzle flash and gunshot acoustic event
    this.muzzleFlashActive = true;
    this._muzzleFlashTimer = 0.05;

    AcousticManager.getInstance().emitSound(
      'GUNSHOT',
      origin,
      55.0, // 55m gunshot acoustic radius
      0.9,
      botTeam
    );

    // 4. Raycast hitscan query
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(origin.x, origin.y, origin.z),
      new RAPIER.Vector3(dir.x, dir.y, dir.z)
    );

    const hit = this._physicsWorld.world.castRayAndGetNormal(
      ray,
      150,
      true,
      undefined,
      this._hitscanFilter
    );

    if (hit) {
      const dist = hit.timeOfImpact;
      const collider = hit.collider;

      // Determine hitzone (head vs torso) based on height or difficulty chance
      const isHead = Math.random() < difficulty.aimHeadshotChance;
      const zone: HitZone = isHead ? 'HEAD' : 'TORSO';
      const damage = calculateDamage(dist, this.definition.damage, zone);

      // Check if player collider was hit
      if (onHitPlayer && (collider.collisionGroups() & CollisionGroups.GROUP_PLAYER)) {
        onHitPlayer(damage, zone);
      }
    }

    // Check if burst finished
    if (this._burstShotsRemaining <= 0) {
      const minP = difficulty.burstPauseMin;
      const maxP = difficulty.burstPauseMax;
      this._burstPauseTimer = minP + Math.random() * (maxP - minP);
    }

    return true;
  }

  public reload(): void {
    if (this.isReloading || this.ammoInMag === this.definition.ammo.magCapacity) return;
    this.isReloading = true;
    this._reloadTimer = this.definition.reloadTime;
    this._burstShotsRemaining = 0;
  }
}
