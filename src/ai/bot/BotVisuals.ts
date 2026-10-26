import * as THREE from 'three';
import type { BotAIState, BotTacticalRole } from '../types.ts';

export class BotVisuals {
  public group: THREE.Group;
  public team: 'ENEMY' | 'FRIENDLY';
  private _bodyMeshes: THREE.Mesh[] = [];
  private _weaponGroup: THREE.Group;
  private _muzzleFlashMesh: THREE.Mesh;
  private _hitFlashTimer: number = 0;
  private _isDead: boolean = false;
  private _deathAnimTime: number = 0;

  constructor(team: 'ENEMY' | 'FRIENDLY') {
    this.team = team;
    this.group = new THREE.Group();
    this.group.name = `BotVisual_${team}`;

    // Colors
    const isEnemy = team === 'ENEMY';
    const suitColor = isEnemy ? 0x24272c : 0x1f2633; // dark tactical fatigues
    const vestColor = isEnemy ? 0x3d3532 : 0x2a3545; // plate carrier
    const accentColor = isEnemy ? 0xdd2222 : 0x2288dd; // red vs blue tactical armband & visor

    const suitMat = new THREE.MeshStandardMaterial({
      color: suitColor,
      roughness: 0.8,
      metalness: 0.1,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: vestColor,
      roughness: 0.6,
      metalness: 0.3,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.5,
      metalness: 0.4,
      emissive: accentColor,
      emissiveIntensity: 0.25,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc8987b,
      roughness: 0.7,
      metalness: 0.1,
    });

    // 1. Torso & Plate Carrier (y = 0.85 to 1.45m)
    const torsoGeo = new THREE.BoxGeometry(0.44, 0.55, 0.26);
    const torso = new THREE.Mesh(torsoGeo, vestMat);
    torso.position.set(0, 1.15, 0);
    torso.castShadow = true;
    this.group.add(torso);
    this._bodyMeshes.push(torso);

    // Tactical pouches on front of vest
    const pouchGeo = new THREE.BoxGeometry(0.36, 0.14, 0.08);
    const pouch = new THREE.Mesh(pouchGeo, suitMat);
    pouch.position.set(0, 1.05, 0.15);
    pouch.castShadow = true;
    this.group.add(pouch);
    this._bodyMeshes.push(pouch);

    // 2. Head & Tactical Fast Helmet (y = 1.6m)
    const headGeo = new THREE.SphereGeometry(0.13, 12, 10);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 1.6, 0);
    head.castShadow = true;
    this.group.add(head);
    this._bodyMeshes.push(head);

    // Helmet dome
    const helmetGeo = new THREE.SphereGeometry(0.145, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const helmet = new THREE.Mesh(helmetGeo, vestMat);
    helmet.position.set(0, 1.62, 0);
    helmet.castShadow = true;
    this.group.add(helmet);
    this._bodyMeshes.push(helmet);

    // Tactical Visor / Goggles with glowing team accent
    const visorGeo = new THREE.BoxGeometry(0.18, 0.06, 0.08);
    const visor = new THREE.Mesh(visorGeo, accentMat);
    visor.position.set(0, 1.62, 0.12);
    this.group.add(visor);
    this._bodyMeshes.push(visor);

    // Radio Antenna on back of vest
    const antennaGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.45);
    const antenna = new THREE.Mesh(antennaGeo, vestMat);
    antenna.position.set(-0.16, 1.45, -0.12);
    antenna.rotation.z = 0.1;
    this.group.add(antenna);

    // 3. Tactical Armbands (Team identification)
    const armbandGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8);
    const leftArmband = new THREE.Mesh(armbandGeo, accentMat);
    leftArmband.position.set(-0.28, 1.3, 0);
    this.group.add(leftArmband);
    this._bodyMeshes.push(leftArmband);

    const rightArmband = new THREE.Mesh(armbandGeo.clone(), accentMat);
    rightArmband.position.set(0.28, 1.3, 0);
    this.group.add(rightArmband);
    this._bodyMeshes.push(rightArmband);

    // 4. Arms
    const armGeo = new THREE.CylinderGeometry(0.065, 0.06, 0.42, 8);
    const leftArm = new THREE.Mesh(armGeo, suitMat);
    leftArm.position.set(-0.26, 1.15, 0.12);
    leftArm.rotation.x = -Math.PI / 4;
    leftArm.castShadow = true;
    this.group.add(leftArm);
    this._bodyMeshes.push(leftArm);

    const rightArm = new THREE.Mesh(armGeo.clone(), suitMat);
    rightArm.position.set(0.26, 1.15, 0.12);
    rightArm.rotation.x = -Math.PI / 4;
    rightArm.castShadow = true;
    this.group.add(rightArm);
    this._bodyMeshes.push(rightArm);

    // 5. Legs
    const legGeo = new THREE.CylinderGeometry(0.085, 0.07, 0.72, 8);
    const leftLeg = new THREE.Mesh(legGeo, suitMat);
    leftLeg.position.set(-0.12, 0.42, 0);
    leftLeg.castShadow = true;
    this.group.add(leftLeg);
    this._bodyMeshes.push(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo.clone(), suitMat);
    rightLeg.position.set(0.12, 0.42, 0);
    rightLeg.castShadow = true;
    this.group.add(rightLeg);
    this._bodyMeshes.push(rightLeg);

    // 6. Greybox Assault Rifle in hands
    this._weaponGroup = new THREE.Group();
    const rifleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.8 });

    // Receiver
    const recGeo = new THREE.BoxGeometry(0.06, 0.12, 0.4);
    const rec = new THREE.Mesh(recGeo, rifleMat);
    this._weaponGroup.add(rec);

    // Barrel
    const bGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.35);
    const barrel = new THREE.Mesh(bGeo, rifleMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, 0.32);
    this._weaponGroup.add(barrel);

    // Magazine
    const magGeo = new THREE.BoxGeometry(0.04, 0.14, 0.08);
    const mag = new THREE.Mesh(magGeo, rifleMat);
    mag.position.set(0, -0.09, 0.05);
    mag.rotation.x = 0.2;
    this._weaponGroup.add(mag);

    // Position weapon in hands
    this._weaponGroup.position.set(0.12, 1.15, 0.35);
    this.group.add(this._weaponGroup);

    // Muzzle flash
    const mfGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const mfMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.9,
    });
    this._muzzleFlashMesh = new THREE.Mesh(mfGeo, mfMat);
    this._muzzleFlashMesh.position.set(0, 0.03, 0.52);
    this._muzzleFlashMesh.visible = false;
    this._weaponGroup.add(this._muzzleFlashMesh);
  }

  public triggerHitFlash(): void {
    this._hitFlashTimer = 0.15;
    for (const mesh of this._bodyMeshes) {
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.emissiveIntensity = 0.8;
      }
    }
  }

  public setMuzzleFlash(active: boolean): void {
    this._muzzleFlashMesh.visible = active;
  }

  public onDeath(): void {
    this._isDead = true;
    this._deathAnimTime = 0;
  }

  public onRespawn(): void {
    this._isDead = false;
    this.group.rotation.set(0, 0, 0);
    this.group.position.y = 0;
  }

  public update(dt: number, state: BotAIState, role: BotTacticalRole): void {
    // 1. Hit flash recovery
    if (this._hitFlashTimer > 0) {
      this._hitFlashTimer -= dt;
      if (this._hitFlashTimer <= 0) {
        for (const mesh of this._bodyMeshes) {
          if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.emissive.setHex(0x000000);
            mesh.material.emissiveIntensity = 0;
          }
        }
      }
    }

    // 2. Death collapse animation
    if (this._isDead) {
      this._deathAnimTime += dt;
      if (this._deathAnimTime < 0.6) {
        // Fall backward to ground
        this.group.rotation.x = -Math.min(Math.PI / 2, this._deathAnimTime * 2.8);
        this.group.position.y = -Math.min(0.7, this._deathAnimTime * 1.2);
      }
      return;
    }

    // 3. Stance adjustment based on state & role
    if (state === 'TAKE_COVER') {
      // Crouch stance
      this.group.scale.set(1, 0.75, 1);
      this._weaponGroup.rotation.x = 0.1;
    } else if (state === 'COMBAT_ENGAGE') {
      this.group.scale.set(1, 1, 1);
      this._weaponGroup.rotation.x = 0; // ready aim
    } else if (role === 'RETREAT') {
      this.group.scale.set(1, 1, 1);
      this._weaponGroup.rotation.x = -0.45; // sprint retreat carry
    } else {
      this.group.scale.set(1, 1, 1);
      this._weaponGroup.rotation.x = -0.3; // low ready
    }
  }

  public aimAt(targetWorldPos: THREE.Vector3): void {
    if (this._isDead) return;

    // Turn weapon group toward target elevation
    const weaponWorld = new THREE.Vector3();
    this._weaponGroup.getWorldPosition(weaponWorld);
    const dy = targetWorldPos.y - weaponWorld.y;
    const dist = Math.hypot(targetWorldPos.x - weaponWorld.x, targetWorldPos.z - weaponWorld.z);
    const pitch = -Math.atan2(dy, Math.max(0.1, dist));
    this._weaponGroup.rotation.x = Math.max(-0.8, Math.min(0.8, pitch));
  }
}
