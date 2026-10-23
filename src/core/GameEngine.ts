import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld.ts';
import { GameLoop, type LoopTelemetry } from './GameLoop.ts';
import { InputManager } from './InputManager.ts';
import { PlayerRoot } from '../player/PlayerRoot.ts';
import { CharacterController, type CharacterState } from '../player/CharacterController.ts';
import { GreyboxArena } from '../world/GreyboxArena.ts';

export interface EngineCallbacks {
  onTelemetry?: (telemetry: LoopTelemetry) => void;
  onCharacterState?: (state: CharacterState) => void;
  onLockChange?: (locked: boolean) => void;
}

export class GameEngine {
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public physicsWorld!: PhysicsWorld;
  public playerRoot!: PlayerRoot;
  public characterController!: CharacterController;
  public inputManager!: InputManager;
  public arena!: GreyboxArena;
  public gameLoop!: GameLoop;

  private _canvas!: HTMLCanvasElement;
  private _callbacks: EngineCallbacks;
  private _isDestroyed: boolean = false;

  constructor(callbacks: EngineCallbacks = {}) {
    this._callbacks = callbacks;
  }

  public async init(canvas: HTMLCanvasElement): Promise<void> {
    this._canvas = canvas;

    // 1. Setup Three.js Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // 2. Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#101214');
    this.scene.fog = new THREE.FogExp2('#101214', 0.015);

    // 3. Tactical Lighting
    this._setupLighting();

    // 4. Initialize Rapier Physics World
    this.physicsWorld = new PhysicsWorld();
    await this.physicsWorld.init();

    // 5. Build Greybox Test Arena
    this.arena = new GreyboxArena(this.scene, this.physicsWorld);

    // 6. Setup Player Rig & Decoupled Camera Hierarchy
    const aspect = window.innerWidth / window.innerHeight;
    this.playerRoot = new PlayerRoot(aspect);
    this.scene.add(this.playerRoot.root);

    // 7. Setup Input Manager
    this.inputManager = new InputManager(this._canvas);
    if (this._callbacks.onLockChange) {
      this.inputManager.onLockChange(this._callbacks.onLockChange);
    }

    // 8. Setup Kinematic Character Controller
    this.characterController = new CharacterController(
      this.physicsWorld,
      this.playerRoot,
      this.inputManager
    );

    // 9. Setup Fixed Timestep Accumulator Game Loop (120 Hz)
    this.gameLoop = new GameLoop(
      (fixedDelta) => this._fixedUpdate(fixedDelta),
      (_alpha, _frameDelta) => this._render(),
      (telemetry) => {
        if (this._callbacks.onTelemetry) {
          this._callbacks.onTelemetry(telemetry);
        }
      }
    );

    window.addEventListener('resize', this._onResize);
    this.gameLoop.start();
  }

  private _setupLighting(): void {
    // Ambient Light for subtle base illumination
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.4);
    this.scene.add(ambientLight);

    // Hemisphere Light (sky vs ground tint)
    const hemiLight = new THREE.HemisphereLight('#88a0b8', '#222830', 0.5);
    this.scene.add(hemiLight);

    // Directional Sunlight with sharp tactical shadows
    const sunLight = new THREE.DirectionalLight('#fff2db', 1.5);
    sunLight.position.set(25, 40, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;

    const d = 35;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;

    this.scene.add(sunLight);
  }

  private _fixedUpdate(fixedDelta: number): void {
    if (this._isDestroyed) return;

    // Apply accumulated mouse look
    const mouseDelta = this.inputManager.consumeMouseDelta();
    if (mouseDelta.deltaX !== 0 || mouseDelta.deltaY !== 0) {
      this.playerRoot.handleLookInput(mouseDelta.deltaX, mouseDelta.deltaY);
    }

    // Step character controller physics
    this.characterController.fixedUpdate(fixedDelta);

    // Advance Rapier world simulation
    this.physicsWorld.step();

    // Broadcast state for UI telemetry
    if (this._callbacks.onCharacterState) {
      this._callbacks.onCharacterState(this.characterController.getState());
    }
  }

  private _render(): void {
    if (this._isDestroyed) return;
    this.renderer.render(this.scene, this.playerRoot.camera);
  }

  private _onResize = (): void => {
    if (this._isDestroyed || !this.playerRoot) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.playerRoot.camera.aspect = width / height;
    this.playerRoot.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  };

  public requestLock(): void {
    this.inputManager.requestPointerLock();
  }

  public dispose(): void {
    this._isDestroyed = true;
    window.removeEventListener('resize', this._onResize);
    if (this.gameLoop) this.gameLoop.stop();
    if (this.inputManager) this.inputManager.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}
