import * as THREE from 'three';
import type { HitZone } from '../weapons/types.ts';

export interface PlayerDamageFeedback {
  health: number;
  maxHealth: number;
  damageFlashTimer: number;
  isDead: boolean;
  damageDirection: THREE.Vector3 | null; // directional damage indicator
}

export class PlayerHealth {
  public health: number = 100;
  public maxHealth: number = 100;
  public isDead: boolean = false;

  private _regenDelaySec: number = 5.0; // MW2019: 5s out-of-combat delay before health regeneration
  private _regenRatePerSec: number = 28.0; // ~3.5 seconds to reach 100 from low HP
  private _timeSinceLastDamage: number = 999.0;
  private _damageFlashTimer: number = 0;
  private _lastDamageDir: THREE.Vector3 | null = null;

  private _onDeathCallback?: () => void;

  constructor(onDeath?: () => void) {
    this._onDeathCallback = onDeath;
  }

  public lastDamageZone: HitZone = 'TORSO';

  public takeDamage(
    amount: number,
    zone: HitZone = 'TORSO',
    attackerPos?: THREE.Vector3,
    playerPos?: THREE.Vector3
  ): { killed: boolean } {
    if (this.isDead) return { killed: false };

    this.health = Math.max(0, this.health - amount);
    this.lastDamageZone = zone;
    this._timeSinceLastDamage = 0;
    this._damageFlashTimer = 0.25; // 250ms red vignette flash

    if (attackerPos && playerPos) {
      // Calculate directional vector from player to attacker for damage indicator
      this._lastDamageDir = new THREE.Vector3()
        .subVectors(attackerPos, playerPos)
        .setY(0)
        .normalize();
    }

    if (this.health <= 0) {
      this.isDead = true;
      if (this._onDeathCallback) {
        this._onDeathCallback();
      }
      return { killed: true };
    }

    return { killed: false };
  }

  public update(dt: number): void {
    if (this.isDead) return;

    this._timeSinceLastDamage += dt;

    if (this._damageFlashTimer > 0) {
      this._damageFlashTimer -= dt;
    }

    // Health Regeneration after leaving combat
    if (this._timeSinceLastDamage >= this._regenDelaySec && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this._regenRatePerSec * dt);
    }
  }

  public respawn(): void {
    this.health = this.maxHealth;
    this.isDead = false;
    this._timeSinceLastDamage = 999.0;
    this._damageFlashTimer = 0;
    this._lastDamageDir = null;
  }

  public getFeedback(): PlayerDamageFeedback {
    return {
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      damageFlashTimer: this._damageFlashTimer,
      isDead: this.isDead,
      damageDirection: this._lastDamageDir,
    };
  }
}
