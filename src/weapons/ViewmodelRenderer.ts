import * as THREE from 'three';

/**
 * Dual-Camera Viewmodel Pipeline (Phase 3).
 * Renders weapon geometry, hands/gloves, and reflex optics in a separate scene with clearDepth.
 * Uses a wide 74° FOV (matching MW PC wide weapon FOV) to prevent weapons from being crammed in the face.
 */
export class ViewmodelRenderer {
  public viewmodelScene: THREE.Scene;
  public viewmodelCamera: THREE.PerspectiveCamera;
  public weaponGroup: THREE.Group;

  private _renderer: THREE.WebGLRenderer;
  private _worldCamera: THREE.PerspectiveCamera;
  private _currentMesh: THREE.Group | null = null;

  // Dynamic Muzzle Flash
  private _muzzleFlashMesh: THREE.Group;
  private _muzzleFlashLight: THREE.PointLight;
  private _muzzleFlashTimer: number = 0;

  constructor(renderer: THREE.WebGLRenderer, worldCamera: THREE.PerspectiveCamera) {
    this._renderer = renderer;
    this._worldCamera = worldCamera;

    // Separate viewmodel scene
    this.viewmodelScene = new THREE.Scene();

    // Viewmodel camera: 74° FOV for spacious tactical weapon presentation (not jammed in face)
    this.viewmodelCamera = new THREE.PerspectiveCamera(
      74,
      window.innerWidth / window.innerHeight,
      0.01,
      10
    );
    this.viewmodelScene.add(this.viewmodelCamera);

    // Weapon group parented to viewmodel camera
    this.weaponGroup = new THREE.Group();
    this.weaponGroup.name = 'WeaponGroup';
    this.viewmodelCamera.add(this.weaponGroup);

    // Muzzle flash setup
    this._muzzleFlashMesh = this._createMuzzleFlash();
    this._muzzleFlashMesh.visible = false;
    this.weaponGroup.add(this._muzzleFlashMesh);

    this._muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 5);
    this.weaponGroup.add(this._muzzleFlashLight);

    // Viewmodel lighting (balanced tactical PBR illumination)
    const vmAmbient = new THREE.AmbientLight(0xffffff, 0.7);
    this.viewmodelScene.add(vmAmbient);

    const vmKeyLight = new THREE.DirectionalLight(0xfff8ee, 1.2);
    vmKeyLight.position.set(2, 3, 2);
    this.viewmodelScene.add(vmKeyLight);

    const vmFillLight = new THREE.DirectionalLight(0x88aacc, 0.5);
    vmFillLight.position.set(-2, -1, -1);
    this.viewmodelScene.add(vmFillLight);
  }

  /**
   * Creates a detailed tactical weapon model with Picatinny rail,
   * Reflex optic sight (hood, lens, glowing green reticle dot),
   * and first-person tactical arms with gloved hands (matching MW style).
   */
  public createGreyboxWeapon(scale: number, color: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TacticalWeapon';

    // PBR Materials
    const receiverMat = new THREE.MeshStandardMaterial({
      color: color || 0x24272c,
      roughness: 0.45,
      metalness: 0.85,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x181a1d,
      roughness: 0.35,
      metalness: 0.9,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x1f2125,
      roughness: 0.6,
      metalness: 0.6,
    });
    const magMat = new THREE.MeshStandardMaterial({
      color: 0x2b2e34,
      roughness: 0.7,
      metalness: 0.5,
    });
    const opticHousingMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c1e,
      roughness: 0.4,
      metalness: 0.8,
    });
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
      metalness: 0.1,
    });
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x22ff55, // Illuminated glowing green dot (just like Image 1)
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x1e2024,
      roughness: 0.85,
      metalness: 0.1,
    });
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x2c332d, // Tactical olive-drab/grey military cloth
      roughness: 0.95,
      metalness: 0.05,
    });

    // 1. Lower & Upper Receiver
    const receiverGeo = new THREE.BoxGeometry(0.046 * scale, 0.075 * scale, 0.28 * scale);
    const receiver = new THREE.Mesh(receiverGeo, receiverMat);
    receiver.position.set(0, 0, 0);
    group.add(receiver);

    // Ejection port cover
    const portGeo = new THREE.BoxGeometry(0.01 * scale, 0.02 * scale, 0.06 * scale);
    const port = new THREE.Mesh(portGeo, barrelMat);
    port.position.set(0.024 * scale, 0.015 * scale, 0.02 * scale);
    group.add(port);

    // 2. Picatinny Top Rail
    const railGeo = new THREE.BoxGeometry(0.028 * scale, 0.015 * scale, 0.38 * scale);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(0, 0.042 * scale, -0.04 * scale);
    group.add(rail);

    // 3. Handguard (Quad-Rail Shroud)
    const handguardGeo = new THREE.BoxGeometry(0.048 * scale, 0.06 * scale, 0.24 * scale);
    const handguard = new THREE.Mesh(handguardGeo, railMat);
    handguard.position.set(0, 0.005 * scale, -0.22 * scale);
    group.add(handguard);

    // 4. Barrel & Tactical Muzzle Brake
    const barrelGeo = new THREE.CylinderGeometry(0.011 * scale, 0.012 * scale, 0.45 * scale, 12);
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015 * scale, -0.32 * scale);
    group.add(barrel);

    const muzzleGeo = new THREE.CylinderGeometry(0.016 * scale, 0.015 * scale, 0.05 * scale, 10);
    const muzzle = new THREE.Mesh(muzzleGeo, barrelMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.015 * scale, -0.56 * scale);
    group.add(muzzle);

    // 5. Reflex Sight / Red-Dot Optic (elevated for precision ADS)
    // Mount base
    const opticMountGeo = new THREE.BoxGeometry(0.035 * scale, 0.03 * scale, 0.07 * scale);
    const opticMount = new THREE.Mesh(opticMountGeo, opticHousingMat);
    opticMount.position.set(0, 0.065 * scale, -0.04 * scale);
    group.add(opticMount);

    // Circular Optic Hood / Ring (Cylinder with hole or Torus)
    const hoodGeo = new THREE.TorusGeometry(0.034 * scale, 0.006 * scale, 8, 24);
    const hood = new THREE.Mesh(hoodGeo, opticHousingMat);
    hood.position.set(0, 0.115 * scale, -0.04 * scale);
    group.add(hood);

    // Translucent sight lens
    const lensGeo = new THREE.CircleGeometry(0.032 * scale, 24);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, 0.115 * scale, -0.04 * scale);
    group.add(lens);

    // Illuminated Reticle Green Dot (centered in lens)
    const reticleGeo = new THREE.SphereGeometry(0.0025 * scale, 8, 8);
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.set(0, 0.115 * scale, -0.041 * scale);
    group.add(reticle);

    // 6. Tactical Curved Magazine
    const magGeo = new THREE.BoxGeometry(0.028 * scale, 0.15 * scale, 0.065 * scale);
    const mag = new THREE.Mesh(magGeo, magMat);
    mag.position.set(0, -0.09 * scale, -0.06 * scale);
    mag.rotation.x = 0.15;
    group.add(mag);

    // 7. Ergonomic Pistol Grip
    const gripGeo = new THREE.BoxGeometry(0.034 * scale, 0.11 * scale, 0.045 * scale);
    const grip = new THREE.Mesh(gripGeo, railMat);
    grip.position.set(0, -0.07 * scale, 0.09 * scale);
    grip.rotation.x = 0.28;
    group.add(grip);

    // 8. Tactical Crane Stock
    const bufferTubeGeo = new THREE.CylinderGeometry(0.015 * scale, 0.015 * scale, 0.18 * scale, 10);
    const bufferTube = new THREE.Mesh(bufferTubeGeo, barrelMat);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.015 * scale, 0.21 * scale);
    group.add(bufferTube);

    const stockGeo = new THREE.BoxGeometry(0.04 * scale, 0.11 * scale, 0.16 * scale);
    const stock = new THREE.Mesh(stockGeo, railMat);
    stock.position.set(0, -0.01 * scale, 0.26 * scale);
    group.add(stock);

    // 9. Procedural Tactical First-Person Arms & Gloves (MW Style)
    // Right Hand & Arm (gripping the pistol grip)
    const rightArmGroup = new THREE.Group();
    // Forearm sleeve
    const rForearmGeo = new THREE.CylinderGeometry(0.045 * scale, 0.055 * scale, 0.32 * scale, 10);
    const rForearm = new THREE.Mesh(rForearmGeo, sleeveMat);
    rForearm.position.set(0.06 * scale, -0.18 * scale, 0.22 * scale);
    rForearm.rotation.set(-0.6, 0.2, -0.4);
    rightArmGroup.add(rForearm);

    // Right glove hand
    const rHandGeo = new THREE.BoxGeometry(0.045 * scale, 0.07 * scale, 0.06 * scale);
    const rHand = new THREE.Mesh(rHandGeo, gloveMat);
    rHand.position.set(0.01 * scale, -0.07 * scale, 0.09 * scale);
    rHand.rotation.set(0.28, 0, 0);
    rightArmGroup.add(rHand);
    group.add(rightArmGroup);

    // Left Hand & Arm (supporting handguard forward)
    const leftArmGroup = new THREE.Group();
    // Forearm sleeve
    const lForearmGeo = new THREE.CylinderGeometry(0.045 * scale, 0.055 * scale, 0.38 * scale, 10);
    const lForearm = new THREE.Mesh(lForearmGeo, sleeveMat);
    lForearm.position.set(-0.10 * scale, -0.19 * scale, 0.05 * scale);
    lForearm.rotation.set(-0.35, -0.4, 0.6);
    leftArmGroup.add(lForearm);

    // Left glove hand wrapped under handguard
    const lHandGeo = new THREE.BoxGeometry(0.05 * scale, 0.05 * scale, 0.07 * scale);
    const lHand = new THREE.Mesh(lHandGeo, gloveMat);
    lHand.position.set(-0.015 * scale, -0.015 * scale, -0.22 * scale);
    lHand.rotation.set(0.1, 0.1, -0.3);
    leftArmGroup.add(lHand);
    group.add(leftArmGroup);

    return group;
  }

  private _createMuzzleFlash(): THREE.Group {
    const flashGroup = new THREE.Group();
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff4cc,
      transparent: true,
      opacity: 0.9,
    });

    const crossGeo1 = new THREE.PlaneGeometry(0.12, 0.03);
    const m1 = new THREE.Mesh(crossGeo1, flashMat);
    flashGroup.add(m1);

    const crossGeo2 = new THREE.PlaneGeometry(0.03, 0.12);
    const m2 = new THREE.Mesh(crossGeo2, flashMat);
    flashGroup.add(m2);

    flashGroup.position.set(0, 0.015, -0.58);
    return flashGroup;
  }

  public triggerMuzzleFlash(): void {
    this._muzzleFlashTimer = 0.045; // 45ms flash
    this._muzzleFlashMesh.visible = true;
    this._muzzleFlashMesh.rotation.z = Math.random() * Math.PI;
    this._muzzleFlashLight.intensity = 2.5;
  }

  public setWeaponMesh(mesh: THREE.Group): void {
    if (this._currentMesh) {
      this.weaponGroup.remove(this._currentMesh);
    }
    this._currentMesh = mesh;
    this.weaponGroup.add(mesh);
  }

  public syncCamera(): void {
    this._worldCamera.getWorldQuaternion(this.viewmodelCamera.quaternion);
    this._worldCamera.getWorldPosition(this.viewmodelCamera.position);
  }

  public update(dt: number): void {
    if (this._muzzleFlashTimer > 0) {
      this._muzzleFlashTimer -= dt;
      if (this._muzzleFlashTimer <= 0) {
        this._muzzleFlashMesh.visible = false;
        this._muzzleFlashLight.intensity = 0;
      }
    }
  }

  public render(worldScene: THREE.Scene): void {
    this._renderer.autoClear = false;
    this._renderer.clear();
    this._renderer.render(worldScene, this._worldCamera);
    this._renderer.clearDepth();
    this._renderer.render(this.viewmodelScene, this.viewmodelCamera);
  }

  public onResize(): void {
    const aspect = window.innerWidth / window.innerHeight;
    this.viewmodelCamera.aspect = aspect;
    this.viewmodelCamera.updateProjectionMatrix();
  }

  public dispose(): void {
    if (this._currentMesh) {
      this._currentMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }
  }
}
