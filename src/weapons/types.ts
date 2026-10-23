/**
 * Tactical FPS - Weapon Interfaces (Phase 1 Stub)
 * Prepares typed structures for Phase 2, 3, and 4.
 */

export type WeaponSlot = 'primary' | 'secondary' | 'lethal' | 'tactical';

export type FireMode = 'semi' | 'burst' | 'auto';

export interface AmmoState {
  currentMag: number;
  magCapacity: number;
  reserve: number;
  maxReserve: number;
}

export interface WeaponRecoilConfig {
  pitchMin: number;
  pitchMax: number;
  yawMin: number;
  yawMax: number;
  recoverySpeed: number;
}

export interface WeaponDefinition {
  id: string;
  name: string;
  slot: WeaponSlot;
  fireRateRPM: number;
  fireMode: FireMode;
  ammo: AmmoState;
  damage: {
    head: number;
    torso: number;
    limbs: number;
  };
  rangeFalloffMeters: number[];
  recoil: WeaponRecoilConfig;
}
