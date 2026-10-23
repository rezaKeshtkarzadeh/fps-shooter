import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, CollisionGroups, createInteractionGroups } from '../config/gameConfig.ts';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import { InputManager } from '../core/InputManager.ts';
import { PlayerRoot } from './PlayerRoot.ts';
import { LocomotionFSM, type LocomotionState } from './LocomotionFSM.ts';
import { StanceManager } from './StanceManager.ts';
import { SlideController } from './SlideController.ts';
import { MantleScanner } from './MantleScanner.ts';
import { LadderController } from './LadderController.ts';

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
  public controller: RAPIER.KinematicCharacterController;
  public fsm: LocomotionFSM;
  public stanceManager: StanceManager;
  public slideController: SlideController;
  public mantleScanner: MantleScanner;
  public ladderController: LadderController;

  private _physicsWorld: PhysicsWorld;
  private _playerRoot: PlayerRoot;
  private _inputManager: InputManager;

  // Velocity state
  private _velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private _isGrounded: boolean = false;
  private _isCeilingBlocked: boolean = false;

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
    this.slideController = new SlideController();
    this.mantleScanner = new MantleScanner();
    this.ladderController = new LadderController();

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

    const initialCollider = this._physicsWorld.world.createCollider(colliderDesc, this.body);

    // 3. Stance Manager (Ground Anchor Continuity & Multi-Tier Sweeps)
    this.stanceManager = new StanceManager(
      this._physicsWorld,
      this._playerRoot,
      this.body,
      initialCollider
    );

    // 4. Create Kinematic Character Controller
    this.controller = this._physicsWorld.createCharacterController();

    this._playerRoot.setPosition(spawn.x, spawn.y, spawn.z);
  }

  public get collider(): RAPIER.Collider {
    return this.stanceManager.collider;
  }

  /**
   * Fixed physics tick (120 Hz)
   */
  public fixedUpdate(fixedDelta: number): void {
    this.fsm.updateTimers(fixedDelta);
    // Only consider grounded if not actively traveling upwards from a jump
    this._isGrounded = this.controller.computedGrounded() && this._velocity.y <= 0.05;

    const feetPos = this.stanceManager.getFeetPosition();
    this._playerRoot.getHorizontalForward(this._tempForward);
    this._playerRoot.getHorizontalRight(this._tempRight);

    // 1. Ladder Proximity Check
    if (this.fsm.state !== 'LADDER' && this.fsm.state !== 'MANTLE') {
      const currentPos = this.body.translation();
      if (this.ladderController.checkProximity(currentPos, this._tempForward, this._physicsWorld)) {
        this.fsm.transitionTo('LADDER');
        this._velocity.set(0, 0, 0);
      }
    }

    // 2. Active State Handling
    switch (this.fsm.state) {
      case 'MANTLE':
        this._updateMantle(fixedDelta);
        break;
      case 'LADDER':
        this._updateLadder(fixedDelta);
        break;
      case 'SLIDE':
        this._updateSlide(fixedDelta, feetPos);
        break;
      default:
        this._updateStandardLocomotion(fixedDelta, feetPos);
        break;
    }

    // 3. Camera Procedural Kinematics
    const horizSpeed = Math.sqrt(
      this._velocity.x * this._velocity.x + this._velocity.z * this._velocity.z
    );
    this._playerRoot.updateKinematics(fixedDelta, horizSpeed, this._isGrounded);
  }

  /**
   * Standard Grounded / In-Air Locomotion adhering strictly to Section 6 state matrix
   */
  private _updateStandardLocomotion(
    fixedDelta: number,
    feetPos: { x: number; y: number; z: number }
  ): void {
    const dirInput = this._inputManager.directional;
    const hasDirectional = this._inputManager.hasDirectionalInput();
    const isShiftHeld = this._inputManager.isShiftHeld;
    const crouchAction = this._inputManager.consumeCrouchAction();
    const proneAction = this._inputManager.consumeProneAction();
    const jumpAction = this._inputManager.consumeJumpAction();
    this._inputManager.consumeSprintTap();
    const tacSprintTap = this._inputManager.consumeTacSprintTap();

    this._isCeilingBlocked = false;

    // --- Compute Movement Vector from Continuous WASD ---
    this._desiredMove.set(0, 0, 0);
    if (dirInput.forward) this._desiredMove.add(this._tempForward);
    if (dirInput.backward) this._desiredMove.sub(this._tempForward);
    if (dirInput.right) this._desiredMove.add(this._tempRight);
    if (dirInput.left) this._desiredMove.sub(this._tempRight);

    const isMoving = this._desiredMove.lengthSq() > 0.0001;
    if (isMoving) this._desiredMove.normalize();

    const forwardAlignment = isMoving ? this._desiredMove.dot(this._tempForward) : 0;
    const hasForwardMomentum = forwardAlignment >= GAME_CONFIG.movement.sprintForwardThreshold;

    // --- Grounded / In-Air State Transitions ---
    if (!this._isGrounded && this.fsm.state !== 'IN_AIR') {
      this.fsm.transitionTo('IN_AIR');
    } else if (this._isGrounded && this.fsm.state === 'IN_AIR' && this._velocity.y <= 0) {
      const landStance = this.stanceManager.stance === 'stand' ? 'STAND' : 'CROUCH';
      this.fsm.transitionTo(landStance);
    }

    // --- Auto-Cancel Sprint when Shift is Released, Directional Keys Released, or Moving Backward ---
    if (
      (this.fsm.state === 'SPRINT' || this.fsm.state === 'TACTICAL_SPRINT') &&
      (!isShiftHeld || !hasDirectional || forwardAlignment < 0.2)
    ) {
      this.fsm.transitionTo('STAND');
    }

    // --- Dual-Ray Mantle Scanner (When in air moving forward or pressing jump) ---
    if ((!this._isGrounded && hasForwardMomentum) || jumpAction) {
      const currentCenter = this.body.translation();
      if (
        this.mantleScanner.attemptMantle(
          feetPos,
          this._tempForward,
          currentCenter,
          this._physicsWorld,
          this.stanceManager.collider
        )
      ) {
        this.fsm.transitionTo('MANTLE');
        this._velocity.set(0, 0, 0);
        return;
      }
    }

    // --- Universal Prone (Z Key) ---
    if (proneAction) {
      if (this.stanceManager.stance === 'prone') {
        // Multi-tier clearance sweep
        const targetStance = this.stanceManager.evaluateProneUnToggle(feetPos);
        if (targetStance === 'stand') {
          this.stanceManager.resizeCollider('stand');
          this.fsm.transitionTo('STAND');
        } else if (targetStance === 'crouch') {
          this.stanceManager.resizeCollider('crouch');
          this.fsm.transitionTo('CROUCH');
        } else {
          this._isCeilingBlocked = true; // Blocked, remain prone
        }
      } else {
        // Universal transition to prone from ANY grounded state
        this.stanceManager.resizeCollider('prone');
        this.fsm.transitionTo('PRONE');
      }
    }

    // --- Crouch / Slide Toggle (C Key) ---
    if (crouchAction) {
      if (
        (this.fsm.state === 'SPRINT' || this.fsm.state === 'TACTICAL_SPRINT') &&
        this._isGrounded &&
        hasForwardMomentum
      ) {
        // Initiate Slide
        const isTac = this.fsm.state === 'TACTICAL_SPRINT';
        this.slideController.initiateSlide(
          this._velocity,
          this._tempForward,
          isTac,
          this.stanceManager,
          this._playerRoot
        );
        this.fsm.transitionTo('SLIDE');
        return;
      } else if (this.stanceManager.stance === 'crouch') {
        // Crouch to Stand
        const clearStance = this.stanceManager.evaluateCrouchUnToggle(feetPos);
        if (clearStance === 'stand') {
          this.stanceManager.resizeCollider('stand');
          this.fsm.transitionTo('STAND');
        } else {
          this._isCeilingBlocked = true;
        }
      } else if (this.stanceManager.stance === 'prone') {
        // Prone to Crouch
        const clearStance = this.stanceManager.evaluateProneUnToggle(feetPos);
        if (clearStance === 'crouch' || clearStance === 'stand') {
          this.stanceManager.resizeCollider('crouch');
          this.fsm.transitionTo('CROUCH');
        } else {
          this._isCeilingBlocked = true;
        }
      } else {
        // Stand to Crouch
        this.stanceManager.resizeCollider('crouch');
        this.fsm.transitionTo('CROUCH');
      }
    }

    // --- Sprint & Tactical Sprint (Hold LeftShift, Double-Tap for Tac-Sprint) ---
    if (isShiftHeld && this._isGrounded && hasForwardMomentum) {
      if (tacSprintTap && this.stanceManager.stance === 'stand' && this.fsm.canTacticalSprint(hasForwardMomentum)) {
        this.fsm.transitionTo('TACTICAL_SPRINT');
      } else if (this.fsm.state !== 'TACTICAL_SPRINT') {
        if (this.stanceManager.stance === 'crouch') {
          // Un-crouch to sprint if clear
          const clearStance = this.stanceManager.evaluateCrouchUnToggle(feetPos);
          if (clearStance === 'stand') {
            this.stanceManager.resizeCollider('stand');
            if (this.fsm.canSprint(hasForwardMomentum)) {
              this.fsm.transitionTo('SPRINT');
            }
          } else {
            this._isCeilingBlocked = true;
          }
        } else if (this.stanceManager.stance === 'stand' && this.fsm.canSprint(hasForwardMomentum)) {
          this.fsm.transitionTo('SPRINT');
        }
      }
    }

    // --- Jump / Un-Stance Action (Space Key) ---
    // Req 3: press space -> crouch to stand if shift is not holding (or sprint if shift is held)
    // Req 4: press space -> prone to stand if shift is not holding (or sprint if shift is held)
    // When standing: execute normal Jump!
    if (jumpAction && this._isGrounded) {
      if (this.stanceManager.stance === 'crouch') {
        const clearStance = this.stanceManager.evaluateCrouchUnToggle(feetPos);
        if (clearStance === 'stand') {
          this.stanceManager.resizeCollider('stand');
          if (isShiftHeld && hasForwardMomentum) {
            this.fsm.transitionTo('SPRINT');
          } else {
            this.fsm.transitionTo('STAND');
          }
        } else {
          this._isCeilingBlocked = true;
        }
      } else if (this.stanceManager.stance === 'prone') {
        const targetStance = this.stanceManager.evaluateProneUnToggle(feetPos);
        if (targetStance === 'stand') {
          this.stanceManager.resizeCollider('stand');
          if (isShiftHeld && hasForwardMomentum) {
            this.fsm.transitionTo('SPRINT');
          } else {
            this.fsm.transitionTo('STAND');
          }
        } else if (targetStance === 'crouch') {
          this.stanceManager.resizeCollider('crouch');
          this.fsm.transitionTo('CROUCH');
        } else {
          this._isCeilingBlocked = true;
        }
      } else {
        // Already standing: execute Jump!
        this._velocity.y = GAME_CONFIG.movement.jumpVelocity;
        this._isGrounded = false;
        this.fsm.transitionTo('IN_AIR');
      }
    } else if (this._isGrounded) {
      this._velocity.y = -0.5; // Snap assist
    } else {
      this._velocity.y += GAME_CONFIG.physics.gravity * fixedDelta;
    }

    // --- Target Speed & Acceleration Calculation ---
    let targetSpeed: number = GAME_CONFIG.movement.walkSpeed;
    if (this.fsm.state === 'PRONE') {
      if (this.fsm.isDropShotDecayActive) {
        // Inertial drop decay
        targetSpeed = GAME_CONFIG.stances.prone.speed * 2.5;
      } else {
        targetSpeed = GAME_CONFIG.stances.prone.speed;
      }
    } else if (this.fsm.state === 'CROUCH') {
      targetSpeed = GAME_CONFIG.stances.crouch.speed;
    } else if (this.fsm.state === 'TACTICAL_SPRINT') {
      targetSpeed = GAME_CONFIG.movement.tacSprintSpeed;
    } else if (this.fsm.state === 'SPRINT') {
      targetSpeed = GAME_CONFIG.movement.sprintSpeed;
    }

    const targetVelX = this._desiredMove.x * targetSpeed;
    const targetVelZ = this._desiredMove.z * targetSpeed;

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

    this._applyColliderMovement(fixedDelta);
  }

  /**
   * Slide Physics with Slope Acceleration and Space Slide-Jump / Natural Stand Recovery
   */
  private _updateSlide(fixedDelta: number, feetPos: { x: number; y: number; z: number }): void {
    const jumpAction = this._inputManager.consumeJumpAction();
    const crouchAction = this._inputManager.consumeCrouchAction();
    const proneAction = this._inputManager.consumeProneAction();

    // 1. Space Key -> MW2019 Slide Cancel:
    // Transitions to SPRINT if Shift is held and moving forward, otherwise to STAND!
    if (jumpAction) {
      this.slideController.cancel();
      this._playerRoot.setTargetRoll(0);

      const clearStance = this.stanceManager.evaluateCrouchUnToggle(feetPos);
      if (clearStance === 'stand') {
        this.stanceManager.resizeCollider('stand');
        const isShiftHeld = this._inputManager.isShiftHeld;
        const dirInput = this._inputManager.directional;
        if (isShiftHeld && dirInput.forward) {
          this.fsm.transitionTo('SPRINT');
          this._velocity.x = this._tempForward.x * GAME_CONFIG.movement.sprintSpeed;
          this._velocity.z = this._tempForward.z * GAME_CONFIG.movement.sprintSpeed;
        } else {
          this.fsm.transitionTo('STAND');
          this._velocity.x = 0;
          this._velocity.z = 0;
        }
      } else {
        // Overhead clearance blocked -> stay crouched
        this.stanceManager.resizeCollider('crouch');
        this.fsm.transitionTo('CROUCH');
        this._isCeilingBlocked = true;
      }

      this._velocity.y = -0.5;
      this._applyColliderMovement(fixedDelta);
      return;
    }

    // 2. Crouch Action (C Key): player explicitly wants to cancel slide into crouch
    if (crouchAction) {
      this.slideController.cancel();
      this._playerRoot.setTargetRoll(0);
      this.stanceManager.resizeCollider('crouch');
      this.fsm.transitionTo('CROUCH');
      return;
    }

    // 3. Universal Prone (Z Key): inertial drop into prone
    if (proneAction) {
      this.slideController.cancel();
      this._playerRoot.setTargetRoll(0);
      this.stanceManager.resizeCollider('prone');
      this.fsm.transitionTo('PRONE');
      return;
    }

    // 4. Slide Physics Update
    const update = this.slideController.update(
      fixedDelta,
      feetPos,
      this._tempForward,
      this._isGrounded,
      this._physicsWorld,
      this.stanceManager.collider
    );

    if (update.result === 'FALL') {
      this._playerRoot.setTargetRoll(0);
      this.fsm.transitionTo('IN_AIR');
      return;
    } else if (update.result === 'EXPIRED') {
      // Natural slide expiration:
      // Return to STAND / SPRINT (previous state), NEVER stay stuck in crouch!
      this._playerRoot.setTargetRoll(0);

      const clearStance = this.stanceManager.evaluateCrouchUnToggle(feetPos);
      if (clearStance === 'stand') {
        this.stanceManager.resizeCollider('stand');
        const dirInput = this._inputManager.directional;
        const isShiftHeld = this._inputManager.isShiftHeld;
        if (isShiftHeld && dirInput.forward) {
          // Seamlessly transition back into sprint forward!
          this.fsm.transitionTo('SPRINT');
          this._velocity.x = this._tempForward.x * GAME_CONFIG.movement.sprintSpeed;
          this._velocity.z = this._tempForward.z * GAME_CONFIG.movement.sprintSpeed;
        } else {
          // Return to stand
          this.fsm.transitionTo('STAND');
          this._velocity.x = 0;
          this._velocity.z = 0;
        }
      } else {
        // Overhead ceiling blocked (e.g. inside tunnel) -> stay crouched
        this.stanceManager.resizeCollider('crouch');
        this.fsm.transitionTo('CROUCH');
        this._isCeilingBlocked = true;
      }

      this._velocity.y = -0.5;
      this._applyColliderMovement(fixedDelta);
      return;
    }

    this._velocity.x = update.velocity.x;
    this._velocity.z = update.velocity.z;
    this._velocity.y = -0.5;

    this._applyColliderMovement(fixedDelta);
  }

  /**
   * Mantle Traversal along Quadratic Bézier Trajectory
   */
  private _updateMantle(fixedDelta: number): void {
    const update = this.mantleScanner.update(fixedDelta);

    this.body.setNextKinematicTranslation({
      x: update.position.x,
      y: update.position.y,
      z: update.position.z,
    });
    this._playerRoot.setPosition(update.position.x, update.position.y, update.position.z);

    if (update.isComplete) {
      const finalStance = this.mantleScanner.complete(this.stanceManager);
      this.fsm.transitionTo(finalStance === 'stand' ? 'STAND' : 'CROUCH');
      this._velocity.set(0, 0, 0);
    }
  }

  /**
   * Ladder Traversal Kinematics
   */
  private _updateLadder(fixedDelta: number): void {
    const jumpAction = this._inputManager.consumeJumpAction();
    const currentPos = this.body.translation();

    const update = this.ladderController.update(
      fixedDelta,
      currentPos,
      this._inputManager.directional,
      jumpAction
    );

    if (update.result === 'JUMP_OFF' && update.pushOffVelocity) {
      this.fsm.transitionTo('IN_AIR');
      this._velocity.copy(update.pushOffVelocity);
      return;
    } else if (update.result === 'DISMOUNT') {
      this.body.setNextKinematicTranslation(update.newPosition);
      this._playerRoot.setPosition(update.newPosition.x, update.newPosition.y, update.newPosition.z);
      this.stanceManager.resizeCollider('stand');
      this.fsm.transitionTo('STAND');
      this._velocity.set(0, 0, 0);
      return;
    }

    this.body.setNextKinematicTranslation(update.newPosition);
    this._playerRoot.setPosition(update.newPosition.x, update.newPosition.y, update.newPosition.z);
  }

  /**
   * Executes Rapier kinematic collider movement
   */
  private _applyColliderMovement(fixedDelta: number): void {
    // Disable snap-to-ground while moving upwards (jumping)
    if (this._velocity.y > 0) {
      this.controller.enableSnapToGround(0.0);
    } else {
      this.controller.enableSnapToGround(GAME_CONFIG.controller.snapToGroundDistance);
    }

    const desiredTranslation = new RAPIER.Vector3(
      this._velocity.x * fixedDelta,
      this._velocity.y * fixedDelta,
      this._velocity.z * fixedDelta
    );

    this.controller.computeColliderMovement(
      this.stanceManager.collider,
      desiredTranslation,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      createInteractionGroups(CollisionGroups.GROUP_PLAYER, CollisionGroups.GROUP_ENVIRONMENT)
    );

    const corrected = this.controller.computedMovement();

    // Cancel upward velocity if blocked by ceiling
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
    const horizSpeed = Math.sqrt(
      this._velocity.x * this._velocity.x + this._velocity.z * this._velocity.z
    );
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
