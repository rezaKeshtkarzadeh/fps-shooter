import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld.ts';
import { GameLoop, type LoopTelemetry } from './GameLoop.ts';
import { InputManager } from './InputManager.ts';
import { PlayerRoot } from '../player/PlayerRoot.ts';
import { CharacterController, type CharacterState } from '../player/CharacterController.ts';
import { GreyboxArena } from '../world/GreyboxArena.ts';
import { WeaponController, type WeaponFeedback } from '../weapons/WeaponController.ts';
import { GAME_CONFIG } from '../config/gameConfig.ts';

export interface EngineCallbacks {
  onTelemetry?: (telemetry: LoopTelemetry) => void;
  onCharacterState?: (state: CharacterState) => void;
  onWeaponFeedback?: (feedback: WeaponFeedback) => void;
  onLockChange?: (locked: boolean) => void;
}

export class GameEngine {
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public physicsWorld!: PhysicsWorld;
  public playerRoot!: PlayerRoot;
  public characterController!: CharacterController;
  public weaponController!: WeaponController;
  public inputManager!: InputManager;
  public arena!: GreyboxArena;
  public gameLoop!: GameLoop;

  private _canvas!: HTMLCanvasElement;
  private _callbacks: EngineCallbacks;
  private _isDestroyed: boolean = false;
  private _lastMouseDeltaX: number = 0;
  private _lastMouseDeltaY: number = 0;

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
    this.renderer.toneMappingExposure = 1.15;

    // 2. Setup Scene (Bright Daylight Outdoor Training Range)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8dc0ea');
    this.scene.fog = new THREE.FogExp2('#b8d8f4', 0.004);

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

    // 9. Setup Weapons & Combat System (Phase 3)
    this.weaponController = new WeaponController(
      this.renderer,
      this.playerRoot.camera,
      this.physicsWorld
    );

    // Hook camera recoil directly into PlayerRoot
    this.weaponController.setRecoilCallback((pitch, yaw) => {
      this.playerRoot.applyRecoilOffset(pitch, yaw);
    });

    // Register all target dummies from the arena
    for (const target of this.arena.targets) {
      this.weaponController.registerTarget(target);
    }

    // 10. Setup Fixed Timestep Accumulator Game Loop (120 Hz)
    this.gameLoop = new GameLoop(
      (fixedDelta) => this._fixedUpdate(fixedDelta),
      (_alpha, frameDelta) => this._render(frameDelta),
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
    // Ambient Light for clean base illumination
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.85);
    this.scene.add(ambientLight);

    // Hemisphere Light (sky blue vs warm ground bounce)
    const hemiLight = new THREE.HemisphereLight('#cbe5fe', '#8fa2b5', 1.0);
    this.scene.add(hemiLight);

    // Directional Sunlight (crisp, warm daylight sun with sharp tactical shadows)
    const sunLight = new THREE.DirectionalLight('#fffaf0', 2.6);
    sunLight.position.set(30, 50, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 120;

    const d = 40;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0003;

    this.scene.add(sunLight);

    // Secondary fill light from opposite angle to prevent dark pockets
    const fillLight = new THREE.DirectionalLight('#b0d6f5', 0.65);
    fillLight.position.set(-25, 30, -20);
    this.scene.add(fillLight);
  }

  private _fixedUpdate(fixedDelta: number): void {
    if (this._isDestroyed) return;

    // Apply accumulated mouse look
    const mouseDelta = this.inputManager.consumeMouseDelta();
    this._lastMouseDeltaX = mouseDelta.deltaX;
    this._lastMouseDeltaY = mouseDelta.deltaY;

    if (mouseDelta.deltaX !== 0 || mouseDelta.deltaY !== 0) {
      this.playerRoot.handleLookInput(mouseDelta.deltaX, mouseDelta.deltaY);
    }

    // Step character controller physics
    this.characterController.fixedUpdate(fixedDelta);

    // Advance Rapier world simulation
    this.physicsWorld.step();

    // Weapon controls & state update
    if (this.weaponController) {
      if (this.inputManager.consumeReloadAction()) {
        this.inputManager.cancelAds();
        this.weaponController.tryReload();
      }

      const switchIntent = this.inputManager.consumeWeaponSwitch();
      if (switchIntent) {
        this.inputManager.cancelAds();
        if (switchIntent.directSlot !== undefined) {
          this.weaponController.selectWeapon(switchIntent.directSlot);
        } else if (switchIntent.delta !== undefined) {
          this.weaponController.cycleWeapon(switchIntent.delta);
        }
      }

      const locoState = this.characterController.fsm.state;
      if (locoState === 'LADDER') {
        this.inputManager.cancelAds();
      }

      this.weaponController.setTriggerHeld(this.inputManager.isTriggerHeld);
      this.weaponController.setAdsRequested(this.inputManager.isAdsHeld);

      const camPos = new THREE.Vector3();
      const camFwd = new THREE.Vector3();
      this.playerRoot.camera.getWorldPosition(camPos);
      this.playerRoot.camera.getWorldDirection(camFwd);

      this.weaponController.fixedUpdate(
        fixedDelta,
        locoState,
        camPos,
        camFwd,
        mouseDelta.deltaY
      );

      // Broadcast weapon feedback for UI HUD
      if (this._callbacks.onWeaponFeedback) {
        this._callbacks.onWeaponFeedback(this.weaponController.getFeedback());
      }
    }

    // Broadcast state for UI telemetry
    if (this._callbacks.onCharacterState) {
      this._callbacks.onCharacterState(this.characterController.getState());
    }
  }

  private _render(frameDelta: number): void {
    if (this._isDestroyed) return;

    // Smooth render-frame viewmodel sway, ADS, and FOV interpolation
    if (this.weaponController) {
      const locoState = this.characterController.fsm.state;
      this.weaponController.renderUpdate(
        frameDelta,
        locoState,
        this._lastMouseDeltaX,
        this._lastMouseDeltaY,
        this.playerRoot.camera,
        GAME_CONFIG.camera.fov
      );

      // Dual-camera render: main world first, clearDepth, then viewmodel on top
      this.weaponController.viewmodelRenderer.render(this.scene);

      // Settle mouse deltas for sway
      this._lastMouseDeltaX *= 0.5;
      this._lastMouseDeltaY *= 0.5;
    } else {
      this.renderer.render(this.scene, this.playerRoot.camera);
    }
  }

  private _onResize = (): void => {
    if (this._isDestroyed || !this.playerRoot) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.playerRoot.camera.aspect = width / height;
    this.playerRoot.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    if (this.weaponController) {
      this.weaponController.onResize();
    }
  };

  public requestLock(): void {
    this.inputManager.requestPointerLock();
  }

  public dispose(): void {
    this._isDestroyed = true;
    window.removeEventListener('resize', this._onResize);
    if (this.gameLoop) this.gameLoop.stop();
    if (this.inputManager) this.inputManager.dispose();
    if (this.weaponController) this.weaponController.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}
