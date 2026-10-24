import { GAME_CONFIG } from '../config/gameConfig.ts';

export interface ContinuousInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export class InputManager {
  private _domElement: HTMLElement;
  private _isLocked: boolean = false;

  // Continuous directional hold inputs
  private _dirState: ContinuousInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  // Toggle & Action flags (consumed on read)
  private _crouchAction: boolean = false;
  private _proneAction: boolean = false;
  private _jumpAction: boolean = false;
  private _sprintTap: boolean = false;
  private _tacSprintTap: boolean = false;
  private _reloadAction: boolean = false;

  // Weapon controls
  private _isLeftMouseDown: boolean = false;
  private _isAdsToggled: boolean = false;
  private _weaponSwitchDelta: number = 0;
  private _directWeaponSlot: number = -1;

  // Jump buffer & tap timing
  private _lastJumpPressTime: number = 0;
  private _lastShiftPressTime: number = 0;
  private _isShiftHeld: boolean = false;

  // Mouse deltas
  private _mouseDeltaX: number = 0;
  private _mouseDeltaY: number = 0;

  private _onLockChangeCallbacks: Array<(locked: boolean) => void> = [];

  constructor(domElement: HTMLElement) {
    this._domElement = domElement;
    this._bindEvents();
  }

  private _bindEvents(): void {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mozpointerlockchange', this._onPointerLockChange);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('mozpointerlockchange', this._onPointerLockChange);
    this._onLockChangeCallbacks = [];
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (!this._isLocked) return;
    if (e.repeat) return; // Prevent OS key repetition from triggering multiple toggles

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this._dirState.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this._dirState.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this._dirState.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this._dirState.right = true;
        break;

      case 'KeyC':
        // Crouch / Slide Toggle Action
        this._crouchAction = true;
        break;

      case 'KeyZ':
      case 'ControlLeft':
        // Universal Prone Toggle Action
        this._proneAction = true;
        break;

      case 'Space':
        // Jump / Slide Cancel / Ladder Push-off (with 150ms buffer)
        this._jumpAction = true;
        this._lastJumpPressTime = performance.now();
        break;

      case 'KeyR':
        this._reloadAction = true;
        this._isAdsToggled = false;
        break;

      case 'Digit1':
        this._directWeaponSlot = 0;
        this._isAdsToggled = false;
        break;
      case 'Digit2':
        this._directWeaponSlot = 1;
        this._isAdsToggled = false;
        break;
      case 'Digit3':
        this._directWeaponSlot = 2;
        this._isAdsToggled = false;
        break;
      case 'Digit4':
        this._directWeaponSlot = 3;
        this._isAdsToggled = false;
        break;

      case 'ShiftLeft':
      case 'ShiftRight': {
        this._isShiftHeld = true;
        this._isAdsToggled = false; // Sprint tap cancels ADS
        const now = performance.now();
        const delta = now - this._lastShiftPressTime;
        if (delta <= GAME_CONFIG.input.doubleTapWindowMs) {
          // Double tap detected (< 300ms)
          this._tacSprintTap = true;
          this._sprintTap = false;
        } else {
          // Single tap detected
          this._sprintTap = true;
        }
        this._lastShiftPressTime = now;
        break;
      }
    }
  };

  private _onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this._dirState.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this._dirState.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this._dirState.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this._dirState.right = false;
        break;

      case 'ShiftLeft':
      case 'ShiftRight':
        this._isShiftHeld = false;
        break;
    }
  };

  private _onMouseDown = (e: MouseEvent): void => {
    if (!this._isLocked) return;
    if (e.button === 0) {
      this._isLeftMouseDown = true;
    } else if (e.button === 2) {
      // Toggle ADS on/off
      this._isAdsToggled = !this._isAdsToggled;
    }
  };

  private _onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this._isLeftMouseDown = false;
    }
  };

  private _onWheel = (e: WheelEvent): void => {
    if (!this._isLocked) return;
    e.preventDefault();
    this._isAdsToggled = false; // Weapon wheel switch disengages ADS
    if (e.deltaY > 0) {
      this._weaponSwitchDelta += 1;
    } else if (e.deltaY < 0) {
      this._weaponSwitchDelta -= 1;
    }
  };

  private _onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private _onMouseMove = (e: MouseEvent): void => {
    if (!this._isLocked) return;
    this._mouseDeltaX += e.movementX || 0;
    this._mouseDeltaY += e.movementY || 0;
  };

  private _onBlur = (): void => {
    this.resetInput();
  };

  public resetInput(): void {
    this._dirState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    };
    this._crouchAction = false;
    this._proneAction = false;
    this._jumpAction = false;
    this._lastJumpPressTime = 0;
    this._isShiftHeld = false;
    this._sprintTap = false;
    this._tacSprintTap = false;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    this._isLeftMouseDown = false;
    this._isAdsToggled = false;
    this._reloadAction = false;
    this._weaponSwitchDelta = 0;
    this._directWeaponSlot = -1;
  }

  private _onPointerLockChange = (): void => {
    const isNowLocked = document.pointerLockElement === this._domElement;
    this._isLocked = isNowLocked;
    if (!isNowLocked) {
      this.resetInput();
    }
    for (const callback of this._onLockChangeCallbacks) {
      callback(isNowLocked);
    }
  };

  public requestPointerLock(): void {
    this._domElement.requestPointerLock();
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public onLockChange(callback: (locked: boolean) => void): () => void {
    this._onLockChangeCallbacks.push(callback);
    return () => {
      this._onLockChangeCallbacks = this._onLockChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  public consumeMouseDelta(): { deltaX: number; deltaY: number } {
    const delta = {
      deltaX: this._mouseDeltaX,
      deltaY: this._mouseDeltaY,
    };
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    return delta;
  }

  // --- Action Consumers ---
  public consumeCrouchAction(): boolean {
    const val = this._crouchAction;
    this._crouchAction = false;
    return val;
  }

  public consumeProneAction(): boolean {
    const val = this._proneAction;
    this._proneAction = false;
    return val;
  }

  public consumeJumpAction(): boolean {
    const now = performance.now();
    const isBuffered = (now - this._lastJumpPressTime) <= 150; // 150ms jump buffer
    if (this._jumpAction || isBuffered) {
      this._jumpAction = false;
      this._lastJumpPressTime = 0;
      return true;
    }
    return false;
  }

  public consumeSprintTap(): boolean {
    const val = this._sprintTap;
    this._sprintTap = false;
    return val;
  }

  public consumeTacSprintTap(): boolean {
    const val = this._tacSprintTap;
    this._tacSprintTap = false;
    return val;
  }

  public get directional(): Readonly<ContinuousInputState> {
    return this._dirState;
  }

  public hasDirectionalInput(): boolean {
    return (
      this._dirState.forward ||
      this._dirState.backward ||
      this._dirState.left ||
      this._dirState.right
    );
  }

  public get isShiftHeld(): boolean {
    return this._isShiftHeld;
  }

  public get isTriggerHeld(): boolean {
    return this._isLeftMouseDown;
  }

  public get isAdsHeld(): boolean {
    return this._isAdsToggled;
  }

  public cancelAds(): void {
    this._isAdsToggled = false;
  }

  public setAdsToggled(val: boolean): void {
    this._isAdsToggled = val;
  }

  public consumeReloadAction(): boolean {
    const val = this._reloadAction;
    this._reloadAction = false;
    return val;
  }

  /**
   * Consumes weapon switch intent:
   * Returns positive delta, negative delta, or if direct slot selected, returns slot (0-3).
   * Returns null if no switch intent.
   */
  public consumeWeaponSwitch(): { delta?: number; directSlot?: number } | null {
    if (this._directWeaponSlot >= 0) {
      const slot = this._directWeaponSlot;
      this._directWeaponSlot = -1;
      this._weaponSwitchDelta = 0;
      return { directSlot: slot };
    }
    if (this._weaponSwitchDelta !== 0) {
      const delta = this._weaponSwitchDelta > 0 ? 1 : -1;
      this._weaponSwitchDelta = 0;
      return { delta };
    }
    return null;
  }

  public get isLocked(): boolean {
    return this._isLocked;
  }
}
