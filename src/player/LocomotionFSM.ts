import { GAME_CONFIG } from '../config/gameConfig.ts';

export type LocomotionState =
  | 'STAND'
  | 'CROUCH'
  | 'PRONE'
  | 'SPRINT'
  | 'TACTICAL_SPRINT'
  | 'SLIDE'
  | 'IN_AIR'
  | 'MANTLE'
  | 'LADDER';

export class LocomotionFSM {
  private _state: LocomotionState = 'STAND';
  private _stateTimer: number = 0;

  // Tactical sprint stamina and cooldown
  private _tacSprintDuration: number = 0;
  private _tacSprintCooldownTimer: number = 0;

  // Drop-shot inertial decay timer
  private _inertialDropTimer: number = 0;

  public get state(): LocomotionState {
    return this._state;
  }

  public get stateTimer(): number {
    return this._stateTimer;
  }

  public get isDropShotDecayActive(): boolean {
    return this._inertialDropTimer > 0;
  }

  public get tacSprintStaminaFraction(): number {
    if (this._tacSprintCooldownTimer > 0) {
      return 1 - (this._tacSprintCooldownTimer / GAME_CONFIG.movement.tacSprintCooldown);
    }
    return 1 - (this._tacSprintDuration / GAME_CONFIG.movement.tacSprintMaxDuration);
  }

  public get isTacSprintOnCooldown(): boolean {
    return this._tacSprintCooldownTimer > 0;
  }

  public canTacticalSprint(hasForwardMomentum: boolean): boolean {
    return (
      hasForwardMomentum &&
      this._tacSprintCooldownTimer <= 0 &&
      this._tacSprintDuration < GAME_CONFIG.movement.tacSprintMaxDuration
    );
  }

  public canSprint(hasForwardMomentum: boolean): boolean {
    return hasForwardMomentum && this._state !== 'PRONE';
  }

  /**
   * Advances FSM timers for a fixed delta tick
   */
  public updateTimers(fixedDelta: number): void {
    this._stateTimer += fixedDelta;

    // Drop-shot inertial timer decay
    if (this._inertialDropTimer > 0) {
      this._inertialDropTimer = Math.max(0, this._inertialDropTimer - fixedDelta);
    }

    // Tactical sprint tracking
    if (this._state === 'TACTICAL_SPRINT') {
      this._tacSprintDuration += fixedDelta;
      if (this._tacSprintDuration >= GAME_CONFIG.movement.tacSprintMaxDuration) {
        // Cooldown triggers upon exhaustion -> drop down to normal sprint
        this._tacSprintCooldownTimer = GAME_CONFIG.movement.tacSprintCooldown;
        this._state = 'SPRINT';
      }
    } else {
      // Cooldown recovery when not in tac sprint
      if (this._tacSprintCooldownTimer > 0) {
        this._tacSprintCooldownTimer -= fixedDelta;
        if (this._tacSprintCooldownTimer <= 0) {
          this._tacSprintCooldownTimer = 0;
          this._tacSprintDuration = 0;
        }
      } else if (this._tacSprintDuration > 0 && this._state !== 'SPRINT') {
        // Recover stamina when stationary/walking/crouching
        this._tacSprintDuration = Math.max(0, this._tacSprintDuration - fixedDelta * 0.75);
      }
    }
  }

  /**
   * Resets slide / tac-sprint cooldown on authentic Slide Cancel
   */
  public onSlideCancel(): void {
    this._state = 'STAND';
    this._stateTimer = 0;
    // Slide cancel allows immediate re-sprint / tac-sprint
    this._tacSprintCooldownTimer = 0;
  }

  /**
   * Transition to new state with timer reset and drop-shot tracking
   */
  public transitionTo(newState: LocomotionState): void {
    if (this._state === newState) return;

    // Drop-shot dive: entering PRONE from SPRINT, TACTICAL_SPRINT, or SLIDE
    if (
      newState === 'PRONE' &&
      (this._state === 'SPRINT' || this._state === 'TACTICAL_SPRINT' || this._state === 'SLIDE')
    ) {
      this._inertialDropTimer = GAME_CONFIG.stances.prone.inertialDropDuration;
    }

    // Leaving TACTICAL_SPRINT
    if (this._state === 'TACTICAL_SPRINT' && newState !== 'SLIDE') {
      if (this._tacSprintDuration >= GAME_CONFIG.movement.tacSprintMaxDuration * 0.7) {
        this._tacSprintCooldownTimer = GAME_CONFIG.movement.tacSprintCooldown;
      }
    }

    this._state = newState;
    this._stateTimer = 0;
  }

  public isGroundedStance(): boolean {
    return (
      this._state === 'STAND' ||
      this._state === 'CROUCH' ||
      this._state === 'PRONE' ||
      this._state === 'SPRINT' ||
      this._state === 'TACTICAL_SPRINT' ||
      this._state === 'SLIDE'
    );
  }
}
