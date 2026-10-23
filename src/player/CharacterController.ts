import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, CollisionGroups, createInteractionGroups } from '../config/gameConfig.ts';
import { PhysicsWorld, type LadderData } from '../core/PhysicsWorld.ts';
import { InputManager } from '../core/InputManager.ts';
import { PlayerRoot } from './PlayerRoot.ts';
import { LocomotionFSM, type LocomotionState } from './LocomotionFSM.ts';

export interface CharacterState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  horizontalSpeed: number;
  isGrounded: boolean;
  fsmState: LocomotionState;
  isSprinting: boolean;
  isTacSprinting: boolean;
  tacSprintStamina: number;
  isCeilingBlocked: boolean;
}

export class CharacterController {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public controller: RAPIER.KinematicCharacterController;
  public fsm: LocomotionFSM;

  private _physicsWorld: PhysicsWorld;
  private _playerRoot: PlayerRoot;
  private _inputManager: InputManager;

  // Stance tracking
  private _currentStance: 'stand' | 'crouch' | 'prone' = 'stand';
  private _isCeilingBlocked: boolean = false;

  // Velocity state
  private _velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private _isGrounded: boolean = false;

  // Slide state variables
  private _slideDirection: THREE.Vector3 = new THREE.Vector3();
  private _slideSpeed: number = 0;

  // Mantle state variables
  private _mantleStart: THREE.Vector3 = new THREE.Vector3();
  private _mantleApex: THREE.Vector3 = new THREE.Vector3();
  private _mantleDest: THREE.Vector3 = new THREE.Vector3();

  // Active ladder reference
  private _activeLadder: LadderData | null = null;

  // Temp vectors
  private _tempForward: THREE.Vector3 = new THREE.Vector3();
  private _tempRight: THREE.Vector3 = new THREE.Vector3();
  private _desiredMove: THREE.Vector3 = new THREE.Vector3();

  constructor(
    physicsWorld: PhysicsWorld,
    playerRoot: PlayerRoot,
    inputManager: InputManager
  ) {
    this._physicsWorld = physicsWorld;
    this._playerRoot = playerRoot;
    this._inputManager = inputManager;
    this.fsm = new LocomotionFSM();

    const spawn = GAME_CONFIG.controller.spawnPosition;

    // 1. Create kinematic position-based rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawn.x, spawn.y, spawn.z);
    this.body = this._physicsWorld.world.createRigidBody(bodyDesc);

    // 2. Create Initial Capsule Collider (Standing)
    const standCfg = GAME_CONFIG.stances.stand;
    const colliderDesc = RAPIER.ColliderDesc.capsule(
      standCfg.capsuleHalfHeight,
      standCfg.capsuleRadius
    )
      .setCollisionGroups(
        createInteractionGroups(
          CollisionGroups.GROUP_PLAYER,
          CollisionGroups.GROUP_ENVIRONMENT | CollisionGroups.GROUP_BOT
        )
      )
      .setFriction(0.0)
      .setRestitution(0.0);

    this.collider = this._physicsWorld.world.createCollider(colliderDesc, this.body);

    // 3. Create KinematicCharacterController
    this.controller = this._physicsWorld.createCharacterController();

    this._playerRoot.setPosition(spawn.x, spawn.y, spawn.z);
    this._playerRoot.setTargetEyeHeight(standCfg.eyeHeight);
  }

  /**
   * Resizes capsule collider maintaining bottom feet contact with ground
   */
  private _resizeCollider(stance: 'stand' | 'crouch' | 'prone'): void {
    if (this._currentStance === stance) return;

    const oldCfg = GAME_CONFIG.stances[this._currentStance];
    const newCfg = GAME_CONFIG.stances[stance];

    // Current feet Y position
    const currentPos = this.body.translation();
    const feetY = currentPos.y - (oldCfg.capsuleHalfHeight + oldCfg.capsuleRadius);

    // New body center Y to keep feet at exact same spot
    const newCenterY = feetY + (newCfg.capsuleHalfHeight + newCfg.capsuleRadius);

    // Remove old collider and attach new one
    this._physicsWorld.world.removeCollider(this.collider, false);

    const colliderDesc = RAPIER.ColliderDesc.capsule(
      newCfg.capsuleHalfHeight,
      newCfg.capsuleRadius
    )
      .setCollisionGroups(
        createInteractionGroups(
          CollisionGroups.GROUP_PLAYER,
          CollisionGroups.GROUP_ENVIRONMENT | CollisionGroups.GROUP_BOT
        )
      )
      .setFriction(0.0)
      .setRestitution(0.0);

    this.collider = this._physicsWorld.world.createCollider(colliderDesc, this.body);

    // Update rigid body translation to new center
    this.body.setNextKinematicTranslation({
      x: currentPos.x,
      y: newCenterY,
      z: currentPos.z,
    });

    this._currentStance = stance;
    this._playerRoot.setTargetEyeHeight(newCfg.eyeHeight);
  }

  /**
   * Fixed physics update step (120 Hz)
   */
  public fixedUpdate(fixedDelta: number): void {
    this.fsm.updateTimers(fixedDelta);
    this._isGrounded = this.controller.computedGrounded();

    // 1. Check Ladder Proximity
    this._checkLadderInteractions();

    // 2. Handle State-specific Logic
    switch (this.fsm.state) {
      case 'MANTLE':
        this._updateMantle(fixedDelta);
        break;
      case 'LADDER':
        this._updateLadder(fixedDelta);
        break;
      case 'SLIDE':
        this._updateSlide(fixedDelta);
        break;
      default:
        this._updateStandardLocomotion(fixedDelta);
        break;
    }

    // 3. Update Camera Kinematics (Spring, Bob, Roll)
    const horizSpeed = Math.sqrt(
      this._velocity.x * this._velocity.x + this._velocity.z * this._velocity.z
    );
    this._playerRoot.updateKinematics(fixedDelta, horizSpeed, this._isGrounded);
  }

  /**
   * Standard Grounded and In-Air Locomotion
   */
  private _updateStandardLocomotion(fixedDelta: number): void {
    const input = this._inputManager.state;
    const crouchPressed = this._inputManager.consumeCrouchPressed();
    const pronePressed = this._inputManager.consumePronePressed();
    const jumpPressed = this._inputManager.consumeJumpPressed();
    const tacSprintPressed = this._inputManager.consumeTacSprintPressed();

    const currentPos = this.body.translation();
    const feetPos = {
      x: currentPos.x,
      y: currentPos.y - (GAME_CONFIG.stances[this._currentStance].capsuleHalfHeight + GAME_CONFIG.stances[this._currentStance].capsuleRadius),
      z: currentPos.z,
    };

    // Forward and Right vectors from player yaw
    this._playerRoot.getHorizontalForward(this._tempForward);
    this._playerRoot.getHorizontalRight(this._tempRight);

    // Input Movement Vector
    this._desiredMove.set(0, 0, 0);
    if (input.forward) this._desiredMove.add(this._tempForward);
    if (input.backward) this._desiredMove.sub(this._tempForward);
    if (input.right) this._desiredMove.add(this._tempRight);
    if (input.left) this._desiredMove.sub(this._tempRight);

    const isMoving = this._desiredMove.lengthSq() > 0.0001;
    if (isMoving) this._desiredMove.normalize();

    const isMovingForward =
      isMoving && this._desiredMove.dot(this._tempForward) >= GAME_CONFIG.movement.tacSprintAngleThreshold;

    // --- In-Air State Check ---
    if (!this._isGrounded && this.fsm.state !== 'IN_AIR') {
      this.fsm.transitionTo('IN_AIR');
    } else if (this._isGrounded && this.fsm.state === 'IN_AIR') {
      this.fsm.transitionTo(this._currentStance === 'stand' ? 'STAND' : 'CROUCH');
    }

    // --- Mantle Detection while in Air or Jumping ---
    const isIntentionalMantle = input.forward || this._desiredMove.dot(this._tempForward) > 0.3;
    if ((!this._isGrounded && isIntentionalMantle) || jumpPressed) {
      if (this._checkMantleDetection(feetPos)) {
        return; // Transitioned to MANTLE
      }
    }

    // --- Stance Transitions (Ceiling Clearance Verification) ---
    this._isCeilingBlocked = false;

    // Prone Toggle (Z / Ctrl)
    if (pronePressed) {
      if (this._currentStance === 'prone') {
        // Attempt to stand up
        if (this._physicsWorld.checkCeilingClearance(feetPos, GAME_CONFIG.stances.stand.capsuleHalfHeight * 2 + GAME_CONFIG.stances.stand.capsuleRadius * 2, this.collider)) {
          this._resizeCollider('stand');
          this.fsm.transitionTo('STAND');
        } else if (this._physicsWorld.checkCeilingClearance(feetPos, GAME_CONFIG.stances.crouch.capsuleHalfHeight * 2 + GAME_CONFIG.stances.crouch.capsuleRadius * 2, this.collider)) {
          this._resizeCollider('crouch');
          this.fsm.transitionTo('CROUCH');
        } else {
          this._isCeilingBlocked = true;
        }
      } else {
        // Go prone
        this._resizeCollider('prone');
        this.fsm.transitionTo('PRONE');
      }
    }

    // Crouch Toggle (C) / Slide Trigger
    if (crouchPressed) {
      if (
        (this.fsm.state === 'SPRINT' || this.fsm.state === 'TACTICAL_SPRINT') &&
        this._isGrounded
      ) {
        // TRIGGER SLIDE
        this._initiateSlide();
        return;
      } else if (this._currentStance === 'crouch') {
        // Attempt uncrouch to stand
        if (this._physicsWorld.checkCeilingClearance(feetPos, GAME_CONFIG.stances.stand.capsuleHalfHeight * 2 + GAME_CONFIG.stances.stand.capsuleRadius * 2, this.collider)) {
          this._resizeCollider('stand');
          this.fsm.transitionTo('STAND');
        } else {
          this._isCeilingBlocked = true;
        }
      } else if (this._currentStance === 'prone') {
        // Prone to crouch
        if (this._physicsWorld.checkCeilingClearance(feetPos, GAME_CONFIG.stances.crouch.capsuleHalfHeight * 2 + GAME_CONFIG.stances.crouch.capsuleRadius * 2, this.collider)) {
          this._resizeCollider('crouch');
          this.fsm.transitionTo('CROUCH');
        } else {
          this._isCeilingBlocked = true;
        }
      } else {
        // Stand to crouch
        this._resizeCollider('crouch');
        this.fsm.transitionTo('CROUCH');
      }
    }

    // --- Sprint & Tactical Sprint Transitions ---
    if (this._isGrounded && this._currentStance === 'stand') {
      if (input.sprint && isMovingForward) {
        if (
          (tacSprintPressed || this.fsm.state === 'TACTICAL_SPRINT') &&
          this.fsm.canTacticalSprint(isMovingForward)
        ) {
          this.fsm.transitionTo('TACTICAL_SPRINT');
        } else {
          this.fsm.transitionTo('SPRINT');
        }
      } else {
        this.fsm.transitionTo('STAND');
      }
    }

    // --- Target Speed Determination ---
    let targetSpeed: number = GAME_CONFIG.movement.walkSpeed;
    if (this.fsm.state === 'PRONE') {
      targetSpeed = GAME_CONFIG.stances.prone.speed;
    } else if (this.fsm.state === 'CROUCH') {
      targetSpeed = GAME_CONFIG.stances.crouch.speed;
    } else if (this.fsm.state === 'TACTICAL_SPRINT') {
      targetSpeed = GAME_CONFIG.movement.tacSprintSpeed;
    } else if (this.fsm.state === 'SPRINT') {
      targetSpeed = GAME_CONFIG.movement.sprintSpeed;
    }

    const targetVelX = this._desiredMove.x * targetSpeed;
    const targetVelZ = this._desiredMove.z * targetSpeed;

    // --- Acceleration & Deceleration with Air Control ---
    const accelRate = isMoving
      ? GAME_CONFIG.movement.acceleration
      : GAME_CONFIG.movement.deceleration;

    const effectiveAccel = this._isGrounded
      ? accelRate
      : accelRate * GAME_CONFIG.movement.airControl;

    const currentHoriz = new THREE.Vector2(this._velocity.x, this._velocity.z);
    const targetHoriz = new THREE.Vector2(targetVelX, targetVelZ);
    const diff = targetHoriz.clone().sub(currentHoriz);

    const maxDeltaSpeed = effectiveAccel * fixedDelta;
    if (diff.length() <= maxDeltaSpeed) {
      currentHoriz.copy(targetHoriz);
    } else {
      currentHoriz.add(diff.normalize().multiplyScalar(maxDeltaSpeed));
    }

    this._velocity.x = currentHoriz.x;
    this._velocity.z = currentHoriz.y;

    // --- Vertical Velocity (Jump & Gravity) ---
    if (this._isGrounded) {
      if (jumpPressed && this._currentStance !== 'prone') {
        if (this._currentStance === 'crouch') {
          // Un-crouch on jump if clearance allows
          if (this._physicsWorld.checkCeilingClearance(feetPos, 1.8, this.collider)) {
            this._resizeCollider('stand');
          }
        }
        this._velocity.y = GAME_CONFIG.movement.jumpVelocity;
        this.fsm.transitionTo('IN_AIR');
      } else {
        this._velocity.y = -0.5; // Ground snap assist
      }
    } else {
      this._velocity.y += GAME_CONFIG.physics.gravity * fixedDelta;
    }

    // --- Execute Rapier Movement ---
    this._applyColliderMovement(fixedDelta);
  }

  /**
   * Slide Physics with Slope Acceleration and Directional Damping
   */
  private _initiateSlide(): void {
    this._resizeCollider('crouch');
    this.fsm.transitionTo('SLIDE');
    this._playerRoot.setTargetEyeHeight(GAME_CONFIG.stances.slide.eyeHeight);
    this._playerRoot.setTargetRoll(GAME_CONFIG.slide.dutchRollAngle);

    // Initial velocity boost: v_entry = v_current * 1.25
    this._playerRoot.getHorizontalForward(this._tempForward);
    const currentSpeed = Math.sqrt(
      this._velocity.x * this._velocity.x + this._velocity.z * this._velocity.z
    );
    this._slideSpeed = Math.max(currentSpeed * GAME_CONFIG.slide.entryBoost, 8.5);

    this._slideDirection.set(this._velocity.x, 0, this._velocity.z);
    if (this._slideDirection.lengthSq() < 0.01) {
      this._slideDirection.copy(this._tempForward);
    } else {
      this._slideDirection.normalize();
    }
  }

  private _updateSlide(fixedDelta: number): void {
    const currentPos = this.body.translation();
    const feetPos = {
      x: currentPos.x,
      y: currentPos.y - (GAME_CONFIG.stances.crouch.capsuleHalfHeight + GAME_CONFIG.stances.crouch.capsuleRadius),
      z: currentPos.z,
    };

    if (!this._isGrounded) {
      // Slid off a ledge: drop to IN_AIR
      this._playerRoot.setTargetRoll(0);
      this.fsm.transitionTo('IN_AIR');
      return;
    }

    // 1. Steering Damping towards camera forward (omega_max = 1.5 rad/s)
    this._playerRoot.getHorizontalForward(this._tempForward);
    const maxAngleDelta = GAME_CONFIG.slide.steeringDamping * fixedDelta;
    const currentAngle = Math.atan2(this._slideDirection.x, this._slideDirection.z);
    const targetAngle = Math.atan2(this._tempForward.x, this._tempForward.z);
    let diffAngle = targetAngle - currentAngle;
    while (diffAngle < -Math.PI) diffAngle += 2 * Math.PI;
    while (diffAngle > Math.PI) diffAngle -= 2 * Math.PI;

    const clampedDiff = Math.max(-maxAngleDelta, Math.min(maxAngleDelta, diffAngle));
    const newAngle = currentAngle + clampedDiff;
    this._slideDirection.set(Math.sin(newAngle), 0, Math.cos(newAngle)).normalize();

    // 2. Incline & Slope Dynamics
    // a_slope = g * (n_ground x v) x n_ground
    const groundNormalObj = this._physicsWorld.getGroundNormal(feetPos, this.collider);
    const groundNormal = new THREE.Vector3(groundNormalObj.x, groundNormalObj.y, groundNormalObj.z).normalize();

    const cross = new THREE.Vector3().crossVectors(groundNormal, this._slideDirection);
    const slopeAccel = new THREE.Vector3().crossVectors(cross, groundNormal).multiplyScalar(GAME_CONFIG.physics.gravity);

    // Project slope acceleration along slide direction
    const slopeForce = slopeAccel.dot(this._slideDirection);

    // Friction deceleration: -mu * g
    const frictionDecel = GAME_CONFIG.slide.friction * Math.abs(GAME_CONFIG.physics.gravity);

    // Update slide speed
    this._slideSpeed += (slopeForce - frictionDecel) * fixedDelta;

    // 3. Exit Condition Check
    if (
      this._slideSpeed < GAME_CONFIG.slide.minSpeed ||
      this.fsm.slideTimer >= GAME_CONFIG.slide.maxDuration
    ) {
      // Exit slide into crouch
      this._playerRoot.setTargetRoll(0);
      this.fsm.transitionTo('CROUCH');
      this._playerRoot.setTargetEyeHeight(GAME_CONFIG.stances.crouch.eyeHeight);
      return;
    }

    this._velocity.x = this._slideDirection.x * this._slideSpeed;
    this._velocity.z = this._slideDirection.z * this._slideSpeed;
    this._velocity.y = -0.5;

    this._applyColliderMovement(fixedDelta);
  }

  /**
   * Dual-Ray Mantle Detection & Trajectory
   */
  private _checkMantleDetection(feetPos: { x: number; y: number; z: number }): boolean {
    const input = this._inputManager.state;
    this._playerRoot.getHorizontalForward(this._tempForward);

    // Intentional forward check: mantle requires moving forward or pressing jump
    const isMovingForward = input.forward || this._desiredMove.dot(this._tempForward) > 0.3 || input.jump;
    if (!isMovingForward) return false;

    // 1. Ray 1 (Chest Level Forward Ray)
    const chestOrigin = {
      x: feetPos.x,
      y: feetPos.y + GAME_CONFIG.mantle.chestHeightOffset,
      z: feetPos.z,
    };

    const wallHit = this._physicsWorld.castRay(
      chestOrigin,
      this._tempForward,
      GAME_CONFIG.mantle.forwardRayDistance,
      undefined,
      this.collider
    );

    if (!wallHit) return false;

    // Wall must be vertical (normal mostly horizontal)
    if (Math.abs(wallHit.normal.y) > 0.35) return false;

    // 2. Ray 2 (Downward Sweep for Ledge Top)
    const wallNormal = wallHit.normal;
    const topOrigin = {
      x: wallHit.point.x - wallNormal.x * 0.35,
      y: feetPos.y + 2.3, // Elevated top origin
      z: wallHit.point.z - wallNormal.z * 0.35,
    };

    const ledgeHit = this._physicsWorld.castRay(
      topOrigin,
      { x: 0, y: -1, z: 0 },
      2.5,
      undefined,
      this.collider
    );
    if (!ledgeHit) return false;

    // Ledge surface must be horizontal (normal pointing up)
    if (ledgeHit.normal.y < 0.7) return false;

    // 3. Verify Valid Mantle Height
    const mantleHeight = ledgeHit.point.y - feetPos.y;
    if (
      mantleHeight < GAME_CONFIG.mantle.minLedgeHeight ||
      mantleHeight > GAME_CONFIG.mantle.maxLedgeHeight
    ) {
      return false;
    }

    // 4. Verify Headroom Clearance at Destination
    const destX = ledgeHit.point.x - wallNormal.x * 0.3;
    const destY = ledgeHit.point.y + GAME_CONFIG.stances.stand.capsuleHalfHeight + GAME_CONFIG.stances.stand.capsuleRadius;
    const destZ = ledgeHit.point.z - wallNormal.z * 0.3;

    const currentCenter = this.body.translation();
    this._mantleStart.set(currentCenter.x, currentCenter.y, currentCenter.z);
    this._mantleApex.set(
      currentCenter.x,
      ledgeHit.point.y + GAME_CONFIG.mantle.apexHeightOffset + 0.8,
      currentCenter.z
    );
    this._mantleDest.set(destX, destY, destZ);

    this.fsm.transitionTo('MANTLE');
    this._velocity.set(0, 0, 0);
    return true;
  }

  private _updateMantle(fixedDelta: number): void {
    const progress = this.fsm.mantleProgress + fixedDelta / GAME_CONFIG.mantle.duration;
    this.fsm.setMantleProgress(progress);

    const t = Math.min(1.0, progress);

    // Quadratic Bézier interpolation: B(t) = (1-t)^2 P0 + 2(1-t)t Papex + t^2 Pdest
    const oneMinusT = 1.0 - t;
    const bx =
      oneMinusT * oneMinusT * this._mantleStart.x +
      2.0 * oneMinusT * t * this._mantleApex.x +
      t * t * this._mantleDest.x;
    const by =
      oneMinusT * oneMinusT * this._mantleStart.y +
      2.0 * oneMinusT * t * this._mantleApex.y +
      t * t * this._mantleDest.y;
    const bz =
      oneMinusT * oneMinusT * this._mantleStart.z +
      2.0 * oneMinusT * t * this._mantleApex.z +
      t * t * this._mantleDest.z;

    this.body.setNextKinematicTranslation({ x: bx, y: by, z: bz });
    this._playerRoot.setPosition(bx, by, bz);

    if (t >= 1.0) {
      // Completed mantle
      this.fsm.transitionTo('STAND');
      this._velocity.set(0, 0, 0);
    }
  }

  /**
   * Ladder Traversal Kinematics
   */
  private _checkLadderInteractions(): void {
    if (this.fsm.state === 'LADDER' || this.fsm.state === 'MANTLE') return;

    const currentPos = this.body.translation();
    const ladders = this._physicsWorld.ladders;

    for (const ladder of ladders) {
      // Check horizontal distance to ladder
      const dx = currentPos.x - ladder.bottom.x;
      const dz = currentPos.z - ladder.bottom.z;
      const horizDist = Math.sqrt(dx * dx + dz * dz);

      if (horizDist <= GAME_CONFIG.ladder.interactionDistance) {
        // Check vertical bounds
        if (currentPos.y >= ladder.bottom.y - 0.5 && currentPos.y <= ladder.top.y + 1.0) {
          // Check if player is facing ladder
          this._playerRoot.getHorizontalForward(this._tempForward);
          const dot = this._tempForward.x * -ladder.normal.x + this._tempForward.z * -ladder.normal.z;
          if (dot > 0.4) {
            this._activeLadder = ladder;
            this.fsm.transitionTo('LADDER');
            this._velocity.set(0, 0, 0);
            return;
          }
        }
      }
    }
  }

  private _updateLadder(fixedDelta: number): void {
    if (!this._activeLadder) {
      this.fsm.transitionTo('IN_AIR');
      return;
    }

    const input = this._inputManager.state;
    const jumpPressed = this._inputManager.consumeJumpPressed();
    const currentPos = this.body.translation();

    // Space: Jump-off ladder backward
    if (jumpPressed) {
      this.fsm.transitionTo('IN_AIR');
      this._velocity.x = this._activeLadder.normal.x * GAME_CONFIG.ladder.jumpOffImpulse;
      this._velocity.z = this._activeLadder.normal.z * GAME_CONFIG.ladder.jumpOffImpulse;
      this._velocity.y = 4.0;
      this._activeLadder = null;
      return;
    }

    // Top Dismount
    if (currentPos.y >= this._activeLadder.top.y + 0.3) {
      // Dismount forward onto platform
      this.body.setNextKinematicTranslation({
        x: currentPos.x - this._activeLadder.normal.x * 0.6,
        y: this._activeLadder.top.y + 0.9,
        z: currentPos.z - this._activeLadder.normal.z * 0.6,
      });
      this.fsm.transitionTo('STAND');
      this._activeLadder = null;
      return;
    }

    // Climb Vertical Velocity driven by W/S
    let climbVel = 0;
    if (input.forward) climbVel = GAME_CONFIG.ladder.climbSpeed;
    if (input.backward) climbVel = -GAME_CONFIG.ladder.climbSpeed;

    const nextY = currentPos.y + climbVel * fixedDelta;
    this.body.setNextKinematicTranslation({
      x: currentPos.x,
      y: nextY,
      z: currentPos.z,
    });
    this._playerRoot.setPosition(currentPos.x, nextY, currentPos.z);
  }

  /**
   * Applies horizontal and vertical velocities through Rapier's KinematicCharacterController
   */
  private _applyColliderMovement(fixedDelta: number): void {
    const desiredTranslation = new RAPIER.Vector3(
      this._velocity.x * fixedDelta,
      this._velocity.y * fixedDelta,
      this._velocity.z * fixedDelta
    );

    this.controller.computeColliderMovement(
      this.collider,
      desiredTranslation,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      createInteractionGroups(CollisionGroups.GROUP_PLAYER, CollisionGroups.GROUP_ENVIRONMENT)
    );

    const corrected = this.controller.computedMovement();

    // Cancel upward velocity if hitting ceiling
    if (this._velocity.y > 0 && corrected.y < desiredTranslation.y * 0.5) {
      this._velocity.y = 0;
    }

    const currentPos = this.body.translation();
    const nextPos = {
      x: currentPos.x + corrected.x,
      y: currentPos.y + corrected.y,
      z: currentPos.z + corrected.z,
    };

    this.body.setNextKinematicTranslation(nextPos);
    this._playerRoot.setPosition(nextPos.x, nextPos.y, nextPos.z);
  }

  public getState(): CharacterState {
    const pos = this.body.translation();
    const horizSpeed = Math.sqrt(this._velocity.x * this._velocity.x + this._velocity.z * this._velocity.z);
    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      velocity: { x: this._velocity.x, y: this._velocity.y, z: this._velocity.z },
      horizontalSpeed: horizSpeed,
      isGrounded: this._isGrounded,
      fsmState: this.fsm.state,
      isSprinting: this.fsm.state === 'SPRINT',
      isTacSprinting: this.fsm.state === 'TACTICAL_SPRINT',
      tacSprintStamina: this.fsm.tacSprintStaminaFraction,
      isCeilingBlocked: this._isCeilingBlocked,
    };
  }
}
