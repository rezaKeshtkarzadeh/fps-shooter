export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  prone: boolean;
}

export class InputManager {
  private _domElement: HTMLElement;
  private _isLocked: boolean = false;

  private _state: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    crouch: false,
    prone: false,
  };

  // Edge-triggered presses
  private _jumpPressed: boolean = false;
  private _crouchPressed: boolean = false;
  private _pronePressed: boolean = false;
  private _tacSprintPressed: boolean = false;

  // Double-tap sprint detection
  private _lastSprintTapTime: number = 0;
  private readonly DOUBLE_TAP_WINDOW_MS: number = 300;

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
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mozpointerlockchange', this._onPointerLockChange);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('mozpointerlockchange', this._onPointerLockChange);
    this._onLockChangeCallbacks = [];
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (!this._isLocked) return;

    if (e.repeat) return; // Prevent repeated press triggers for toggles

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this._state.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this._state.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this._state.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this._state.right = true;
        break;
      case 'Space':
        this._state.jump = true;
        this._jumpPressed = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight': {
        const now = performance.now();
        if (now - this._lastSprintTapTime <= this.DOUBLE_TAP_WINDOW_MS) {
          this._tacSprintPressed = true;
        }
        this._lastSprintTapTime = now;
        this._state.sprint = true;
        break;
      }
      case 'KeyC':
        this._state.crouch = true;
        this._crouchPressed = true;
        break;
      case 'KeyZ':
      case 'ControlLeft':
        this._state.prone = true;
        this._pronePressed = true;
        break;
    }
  };

  private _onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this._state.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this._state.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this._state.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this._state.right = false;
        break;
      case 'Space':
        this._state.jump = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this._state.sprint = false;
        break;
      case 'KeyC':
        this._state.crouch = false;
        break;
      case 'KeyZ':
      case 'ControlLeft':
        this._state.prone = false;
        break;
    }
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
    this._state = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      crouch: false,
      prone: false,
    };
    this._jumpPressed = false;
    this._crouchPressed = false;
    this._pronePressed = false;
    this._tacSprintPressed = false;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
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

  public consumeJumpPressed(): boolean {
    const val = this._jumpPressed;
    this._jumpPressed = false;
    return val;
  }

  public consumeCrouchPressed(): boolean {
    const val = this._crouchPressed;
    this._crouchPressed = false;
    return val;
  }

  public consumePronePressed(): boolean {
    const val = this._pronePressed;
    this._pronePressed = false;
    return val;
  }

  public consumeTacSprintPressed(): boolean {
    const val = this._tacSprintPressed;
    this._tacSprintPressed = false;
    return val;
  }

  public get state(): Readonly<InputState> {
    return this._state;
  }

  public get isLocked(): boolean {
    return this._isLocked;
  }
}
