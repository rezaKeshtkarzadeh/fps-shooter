import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import { PlayerRoot } from './PlayerRoot.ts';
import { StanceManager } from './StanceManager.ts';

export type SlideUpdateResult = 'CONTINUE' | 'EXPIRED' | 'FALL';

export class SlideController {
  private _slideDirection: THREE.Vector3 = new THREE.Vector3();
  private _slideSpeed: number = 0;
  private _slideTimer: number = 0;
  private _isActive: boolean = false;

  public get isActive(): boolean {
    return this._isActive;
  }

  public get slideTimer(): number {
    return this._slideTimer;
  }

  public get slideSpeed(): number {
    return this._slideSpeed;
  }

  public get slideDirection(): THREE.Vector3 {
    return this._slideDirection;
  }

  /**
   * Initiates momentum-driven slide from sprint or tactical sprint
   */
  public initiateSlide(
    currentVelocity: { x: number; y: number; z: number },
    forwardVector: THREE.Vector3,
    isTacSprint: boolean,
    stanceManager: StanceManager,
    playerRoot: PlayerRoot
  ): void {
    stanceManager.resizeCollider('crouch');
    playerRoot.setTargetEyeHeight(GAME_CONFIG.stances.slide.eyeHeight);
    playerRoot.setTargetRoll(GAME_CONFIG.slide.dutchRollAngle);

    const horizSpeed = Math.sqrt(
      currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z
    );

    const baseMinSpeed = isTacSprint
      ? GAME_CONFIG.slide.tacSprintEntrySpeed
      : GAME_CONFIG.slide.baseEntrySpeed;

    this._slideSpeed = Math.max(horizSpeed * GAME_CONFIG.slide.entryBoost, baseMinSpeed);

    this._slideDirection.set(currentVelocity.x, 0, currentVelocity.z);
    if (this._slideDirection.lengthSq() < 0.01) {
      this._slideDirection.copy(forwardVector);
    } else {
      this._slideDirection.normalize();
    }

    this._slideTimer = 0;
    this._isActive = true;
  }

  /**
   * Updates slide steering, friction, and slope acceleration
   */
  public update(
    fixedDelta: number,
    feetPos: { x: number; y: number; z: number },
    forwardVector: THREE.Vector3,
    isGrounded: boolean,
    physicsWorld: PhysicsWorld,
    collider: RAPIER.Collider
  ): { result: SlideUpdateResult; velocity: THREE.Vector3 } {
    const outVel = new THREE.Vector3(0, -0.5, 0);

    if (!isGrounded) {
      this.cancel();
      return { result: 'FALL', velocity: outVel };
    }

    this._slideTimer += fixedDelta;

    // 1. Angular Steering Damping towards camera forward
    const maxAngleDelta = GAME_CONFIG.slide.steeringDamping * fixedDelta;
    const currentAngle = Math.atan2(this._slideDirection.x, this._slideDirection.z);
    const targetAngle = Math.atan2(forwardVector.x, forwardVector.z);

    let diffAngle = targetAngle - currentAngle;
    while (diffAngle < -Math.PI) diffAngle += 2 * Math.PI;
    while (diffAngle > Math.PI) diffAngle -= 2 * Math.PI;

    const clampedDiff = Math.max(-maxAngleDelta, Math.min(maxAngleDelta, diffAngle));
    const newAngle = currentAngle + clampedDiff;
    this._slideDirection.set(Math.sin(newAngle), 0, Math.cos(newAngle)).normalize();

    // 2. Realistic Incline & Slope Dynamics
    // Projects vertical gravity along ground plane tangent
    const groundNormalObj = physicsWorld.getGroundNormal(feetPos, collider);
    const groundNormal = new THREE.Vector3(groundNormalObj.x, groundNormalObj.y, groundNormalObj.z).normalize();

    const gravityVec = new THREE.Vector3(0, GAME_CONFIG.physics.gravity, 0);
    const normalComponent = groundNormal.clone().multiplyScalar(gravityVec.dot(groundNormal));
    const slopeAccel = gravityVec.clone().sub(normalComponent);

    // Gravitational acceleration along slide direction (accelerates down slopes, slows up slopes, 0 on flat)
    const slopeForce = slopeAccel.dot(this._slideDirection);

    // Friction deceleration: -mu * |g|
    const frictionDecel = GAME_CONFIG.slide.friction * Math.abs(GAME_CONFIG.physics.gravity);

    // Integrate speed
    this._slideSpeed += (slopeForce - frictionDecel) * fixedDelta;

    // 3. Exit condition check
    if (
      this._slideSpeed < GAME_CONFIG.slide.minSpeed ||
      this._slideTimer >= GAME_CONFIG.slide.maxDuration
    ) {
      this.cancel();
      return { result: 'EXPIRED', velocity: outVel };
    }

    outVel.x = this._slideDirection.x * this._slideSpeed;
    outVel.z = this._slideDirection.z * this._slideSpeed;
    return { result: 'CONTINUE', velocity: outVel };
  }

  public cancel(): void {
    this._isActive = false;
    this._slideSpeed = 0;
  }
}
