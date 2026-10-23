import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import { StanceManager, type StanceType } from './StanceManager.ts';

export class MantleScanner {
  private _isActive: boolean = false;
  private _progress: number = 0; // 0.0 to 1.0
  private _mantleStart: THREE.Vector3 = new THREE.Vector3();
  private _mantleApex: THREE.Vector3 = new THREE.Vector3();
  private _mantleDest: THREE.Vector3 = new THREE.Vector3();
  private _destStance: StanceType = 'stand';

  public get isActive(): boolean {
    return this._isActive;
  }

  public get progress(): number {
    return this._progress;
  }

  public get destStance(): StanceType {
    return this._destStance;
  }

  /**
   * Scans for a climbable obstacle ahead using chest ray + downward ledge sweep
   */
  public attemptMantle(
    feetPos: { x: number; y: number; z: number },
    forwardVector: THREE.Vector3,
    currentCenter: { x: number; y: number; z: number },
    physicsWorld: PhysicsWorld,
    collider: RAPIER.Collider
  ): boolean {
    // 1. Ray 1 (Chest Level Forward Ray)
    const chestOrigin = {
      x: feetPos.x,
      y: feetPos.y + GAME_CONFIG.mantle.chestHeightOffset,
      z: feetPos.z,
    };

    const wallHit = physicsWorld.castRay(
      chestOrigin,
      forwardVector,
      GAME_CONFIG.mantle.forwardRayDistance,
      undefined,
      collider
    );

    if (!wallHit) return false;

    // Wall surface must be vertical (mostly horizontal normal)
    if (Math.abs(wallHit.normal.y) > 0.35) return false;

    // 2. Ray 2 (Downward Sweep for Ledge Top)
    const wallNormal = wallHit.normal;
    const topOrigin = {
      x: wallHit.point.x - wallNormal.x * 0.35,
      y: feetPos.y + 2.2,
      z: wallHit.point.z - wallNormal.z * 0.35,
    };

    const ledgeHit = physicsWorld.castRay(
      topOrigin,
      { x: 0, y: -1, z: 0 },
      2.5,
      undefined,
      collider
    );
    if (!ledgeHit) return false;

    // Ledge surface must face upwards
    if (ledgeHit.normal.y < 0.70) return false;

    // 3. Verify Obstacle Height
    const mantleHeight = ledgeHit.point.y - feetPos.y;
    if (
      mantleHeight < GAME_CONFIG.mantle.minLedgeHeight ||
      mantleHeight > GAME_CONFIG.mantle.maxLedgeHeight
    ) {
      return false;
    }

    // 4. Determine Destination Stance & Overhead Clearance
    const destFeet = {
      x: ledgeHit.point.x - wallNormal.x * 0.3,
      y: ledgeHit.point.y,
      z: ledgeHit.point.z - wallNormal.z * 0.3,
    };

    const canStand = physicsWorld.checkCeilingClearance(
      destFeet,
      GAME_CONFIG.stances.stand.requiredClearance,
      collider
    );

    if (canStand) {
      this._destStance = 'stand';
    } else {
      const canCrouch = physicsWorld.checkCeilingClearance(
        destFeet,
        GAME_CONFIG.stances.crouch.requiredClearance,
        collider
      );
      if (canCrouch) {
        this._destStance = 'crouch';
      } else {
        return false; // No clearance at landing spot
      }
    }

    const cfg = GAME_CONFIG.stances[this._destStance];
    const destCenterY = destFeet.y + cfg.capsuleHalfHeight + cfg.capsuleRadius;

    // 5. Setup Quadratic Bézier Trajectory
    this._mantleStart.set(currentCenter.x, currentCenter.y, currentCenter.z);
    this._mantleApex.set(
      currentCenter.x,
      ledgeHit.point.y + GAME_CONFIG.mantle.apexHeightOffset + 0.8,
      currentCenter.z
    );
    this._mantleDest.set(destFeet.x, destCenterY, destFeet.z);

    this._progress = 0;
    this._isActive = true;
    return true;
  }

  /**
   * Evaluates current position along the quadratic Bézier curve
   */
  public update(fixedDelta: number): { isComplete: boolean; position: THREE.Vector3 } {
    this._progress += fixedDelta / GAME_CONFIG.mantle.duration;
    const t = Math.min(1.0, this._progress);

    // B(t) = (1-t)^2 P0 + 2(1-t)t Papex + t^2 Pdest
    const oneMinusT = 1.0 - t;
    const x =
      oneMinusT * oneMinusT * this._mantleStart.x +
      2.0 * oneMinusT * t * this._mantleApex.x +
      t * t * this._mantleDest.x;
    const y =
      oneMinusT * oneMinusT * this._mantleStart.y +
      2.0 * oneMinusT * t * this._mantleApex.y +
      t * t * this._mantleDest.y;
    const z =
      oneMinusT * oneMinusT * this._mantleStart.z +
      2.0 * oneMinusT * t * this._mantleApex.z +
      t * t * this._mantleDest.z;

    const isComplete = t >= 1.0;
    if (isComplete) {
      this._isActive = false;
    }

    return {
      isComplete,
      position: new THREE.Vector3(x, y, z),
    };
  }

  public complete(stanceManager: StanceManager): StanceType {
    this._isActive = false;
    stanceManager.resizeCollider(this._destStance);
    return this._destStance;
  }
}
