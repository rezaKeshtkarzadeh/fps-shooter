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

  // Tactical sprint stamina and cooldown trackers
  private _tacSprintDuration: number = 0;
  private _tacSprintCooldownTimer: number = 0;

  // Slide tracking
  private _slideTimer: number = 0;

  // Mantle tracking
  private _mantleProgress: number = 0; // 0.0 to 1.0

  public get state(): LocomotionState {
    return this._state;
  }

  public get stateTimer(): number {
    return this._stateTimer;
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

  public get mantleProgress(): number {
    return this._mantleProgress;
  }

  public setMantleProgress(val: number): void {
    this._mantleProgress = Math.min(1.0, Math.max(0.0, val));
  }

  public canTacticalSprint(isMovingForward: boolean): boolean {
    return (
      isMovingForward &&
      this._tacSprintCooldownTimer <= 0 &&
      this._tacSprintDuration < GAME_CONFIG.movement.tacSprintMaxDuration
    );
  }

  /**
   * Advances FSM timers for a fixed delta tick
   */
  public updateTimers(fixedDelta: number): void {
    this._stateTimer += fixedDelta;

    // Tactical sprint tracking
    if (this._state === 'TACTICAL_SPRINT') {
      this._tacSprintDuration += fixedDelta;
      if (this._tacSprintDuration >= GAME_CONFIG.movement.tacSprintMaxDuration) {
        // Exhausted: trigger cooldown
        this._tacSprintCooldownTimer = GAME_CONFIG.movement.tacSprintCooldown;
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
        // Recover stamina when stationary/walking
        this._tacSprintDuration = Math.max(0, this._tacSprintDuration - fixedDelta * 0.75);
      }
    }

    if (this._state === 'SLIDE') {
      this._slideTimer += fixedDelta;
    }
  }

  /**
   * Transition to new state with timer reset
   */
  public transitionTo(newState: LocomotionState): void {
    if (this._state === newState) return;

    // Leaving TACTICAL_SPRINT
    if (this._state === 'TACTICAL_SPRINT' && newState !== 'SLIDE') {
      if (this._tacSprintDuration >= GAME_CONFIG.movement.tacSprintMaxDuration * 0.8) {
        this._tacSprintCooldownTimer = GAME_CONFIG.movement.tacSprintCooldown;
      }
    }

    // Entering SLIDE
    if (newState === 'SLIDE') {
      this._slideTimer = 0;
    }

    // Entering MANTLE
    if (newState === 'MANTLE') {
      this._mantleProgress = 0;
    }

    this._state = newState;
    this._stateTimer = 0;
  }

  public get slideTimer(): number {
    return this._slideTimer;
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
