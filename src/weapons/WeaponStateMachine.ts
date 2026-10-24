import type { WeaponDefinition, AmmoState } from './types.ts';
import type { LocomotionState } from '../player/LocomotionFSM.ts';

export type WeaponState =
  | 'IDLE'
  | 'FIRING'
  | 'RELOADING'
  | 'SPRINT_LOWER'
  | 'TAC_SPRINT_RAISE'
  | 'HOLSTERED'
  | 'EQUIPPING'
  | 'SPRINT_TO_FIRE';

export class WeaponStateMachine {
  private _state: WeaponState = 'IDLE';
  private _stateTimer: number = 0;
  private _ammo: AmmoState;
  private _definition: WeaponDefinition;
  private _fireCooldown: number = 0;
  private _sprintToFireDelay: number = 0;

  constructor(definition: WeaponDefinition) {
    this._definition = definition;
    this._ammo = {
      currentMag: definition.ammo.magCapacity,
      magCapacity: definition.ammo.magCapacity,
      reserve: definition.ammo.maxReserve,
      maxReserve: definition.ammo.maxReserve,
    };
  }

  public get state(): WeaponState { return this._state; }
  public get ammo(): Readonly<AmmoState> { return this._ammo; }
  public get definition(): WeaponDefinition { return this._definition; }
  public get stateTimer(): number { return this._stateTimer; }

  public get canFire(): boolean {
    return (
      this._state === 'IDLE' &&
      this._fireCooldown <= 0 &&
      this._ammo.currentMag > 0
    );
  }

  /**
   * Synchronize weapon state with locomotion FSM (called every fixed tick).
   * Returns true if weapon state changed.
   */
  public syncWithLocomotion(locoState: LocomotionState, isCombatActive: boolean = false): boolean {
    const prev = this._state;

    switch (locoState) {
      case 'LADDER':
        if (this._state !== 'HOLSTERED') {
          this._state = 'HOLSTERED';
          this._stateTimer = 0;
        }
        break;

      case 'TACTICAL_SPRINT':
        if (isCombatActive) {
          if (this._state !== 'IDLE' && this._state !== 'RELOADING' && this._state !== 'FIRING') {
            this._state = 'IDLE';
            this._stateTimer = 0;
          }
        } else if (this._state !== 'TAC_SPRINT_RAISE' && this._state !== 'RELOADING') {
          this._state = 'TAC_SPRINT_RAISE';
          this._stateTimer = 0;
        }
        break;

      case 'SPRINT':
        if (isCombatActive) {
          if (this._state !== 'IDLE' && this._state !== 'RELOADING' && this._state !== 'FIRING') {
            this._state = 'IDLE';
            this._stateTimer = 0;
          }
        } else if (this._state !== 'SPRINT_LOWER' && this._state !== 'SPRINT_TO_FIRE' && this._state !== 'RELOADING') {
          this._state = 'SPRINT_LOWER';
          this._stateTimer = 0;
        }
        break;

      default:
        // Recover from sprint/holster states (SLIDE, IN_AIR, MANTLE, STAND, CROUCH, PRONE)
        if (this._state === 'HOLSTERED') {
          this._state = 'EQUIPPING';
          this._stateTimer = 0;
        } else if (this._state === 'TAC_SPRINT_RAISE') {
          this._state = isCombatActive ? 'IDLE' : 'SPRINT_TO_FIRE';
          this._stateTimer = 0;
          this._sprintToFireDelay = this._definition.tacSprintToFireDelay;
        } else if (this._state === 'SPRINT_LOWER') {
          this._state = isCombatActive ? 'IDLE' : 'SPRINT_TO_FIRE';
          this._stateTimer = 0;
          this._sprintToFireDelay = this._definition.sprintToFireDelay;
        }
        break;
    }

    return prev !== this._state;
  }

  /**
   * Update timers (called every fixed tick at 120Hz).
   */
  public update(fixedDelta: number): void {
    this._stateTimer += fixedDelta;
    this._fireCooldown = Math.max(0, this._fireCooldown - fixedDelta);

    switch (this._state) {
      case 'RELOADING':
        if (this._stateTimer >= this._definition.reloadTime) {
          this._completeReload();
          this._state = 'IDLE';
          this._stateTimer = 0;
        }
        break;

      case 'EQUIPPING':
        if (this._stateTimer >= 0.3) { // 300ms equip time
          this._state = 'IDLE';
          this._stateTimer = 0;
        }
        break;

      case 'SPRINT_TO_FIRE':
        if (this._stateTimer >= this._sprintToFireDelay) {
          this._state = 'IDLE';
          this._stateTimer = 0;
        }
        break;

      case 'FIRING':
        // Auto-return to IDLE after shot
        this._state = 'IDLE';
        break;
    }
  }

  /**
   * Attempt to fire a round. Returns true if shot was fired.
   */
  public tryFire(): boolean {
    if (!this.canFire) return false;

    this._ammo.currentMag--;
    this._fireCooldown = 60 / this._definition.fireRateRPM;
    this._state = 'FIRING';
    this._stateTimer = 0;

    return true;
  }

  /**
   * Attempt to start reloading. Returns true if reload started.
   */
  public tryReload(): boolean {
    if (this._state === 'RELOADING') return false;
    if (this._ammo.currentMag >= this._ammo.magCapacity) return false;
    if (this._ammo.reserve <= 0) return false;
    if (this._state === 'HOLSTERED' || this._state === 'EQUIPPING') return false;

    this._state = 'RELOADING';
    this._stateTimer = 0;
    return true;
  }

  private _completeReload(): void {
    const needed = this._ammo.magCapacity - this._ammo.currentMag;
    const available = Math.min(needed, this._ammo.reserve);
    this._ammo.currentMag += available;
    this._ammo.reserve -= available;
  }

  /**
   * Switch to a new weapon definition (equip cycle).
   */
  public equipWeapon(newDef: WeaponDefinition): void {
    this._definition = newDef;
    this._ammo = {
      currentMag: newDef.ammo.magCapacity,
      magCapacity: newDef.ammo.magCapacity,
      reserve: newDef.ammo.maxReserve,
      maxReserve: newDef.ammo.maxReserve,
    };
    this._state = 'EQUIPPING';
    this._stateTimer = 0;
    this._fireCooldown = 0;
  }
}
