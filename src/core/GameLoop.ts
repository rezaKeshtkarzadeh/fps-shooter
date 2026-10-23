import { GAME_CONFIG } from '../config/gameConfig.ts';

export interface LoopTelemetry {
  fps: number;
  tps: number; // Fixed physics ticks per second
}

export class GameLoop {
  private _fixedDelta: number;
  private _maxDelta: number;
  private _accumulator: number = 0;
  private _lastTime: number = 0;
  private _animationFrameId: number | null = null;
  private _isRunning: boolean = false;

  private _onFixedUpdate: (fixedDelta: number) => void;
  private _onRender: (alpha: number, frameDelta: number) => void;
  private _onTelemetry?: (telemetry: LoopTelemetry) => void;

  // Telemetry trackers
  private _fpsCounter: number = 0;
  private _tpsCounter: number = 0;
  private _lastTelemetryTime: number = 0;

  constructor(
    onFixedUpdate: (fixedDelta: number) => void,
    onRender: (alpha: number, frameDelta: number) => void,
    onTelemetry?: (telemetry: LoopTelemetry) => void
  ) {
    this._fixedDelta = GAME_CONFIG.physics.fixedDelta;
    this._maxDelta = GAME_CONFIG.physics.maxAccumulatorDelta;
    this._onFixedUpdate = onFixedUpdate;
    this._onRender = onRender;
    this._onTelemetry = onTelemetry;
  }

  public start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastTime = performance.now() / 1000;
    this._lastTelemetryTime = this._lastTime;
    this._accumulator = 0;
    this._fpsCounter = 0;
    this._tpsCounter = 0;

    const tick = (timestampMs: number) => {
      if (!this._isRunning) return;

      const currentTime = timestampMs / 1000;
      let frameDelta = currentTime - this._lastTime;
      this._lastTime = currentTime;

      // Spiral of death prevention: clamp frame delta
      if (frameDelta > this._maxDelta) {
        frameDelta = this._maxDelta;
      }

      this._accumulator += frameDelta;

      // Fixed timestep updates
      while (this._accumulator >= this._fixedDelta) {
        this._onFixedUpdate(this._fixedDelta);
        this._accumulator -= this._fixedDelta;
        this._tpsCounter++;
      }

      // Compute interpolation alpha for smooth visuals
      const alpha = this._accumulator / this._fixedDelta;

      // Render decoupled Three.js frame
      this._onRender(alpha, frameDelta);
      this._fpsCounter++;

      // Compute telemetry per second
      if (currentTime - this._lastTelemetryTime >= 1.0) {
        if (this._onTelemetry) {
          this._onTelemetry({
            fps: this._fpsCounter,
            tps: this._tpsCounter,
          });
        }
        this._fpsCounter = 0;
        this._tpsCounter = 0;
        this._lastTelemetryTime = currentTime;
      }

      this._animationFrameId = requestAnimationFrame(tick);
    };

    this._animationFrameId = requestAnimationFrame(tick);
  }

  public stop(): void {
    this._isRunning = false;
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }
}
