/**
 * Tactical FPS - Weapon Type Definitions (Phase 3)
 * Data-driven weapon configurations with MW2019-style gunplay parameters.
 */

export type WeaponSlot = 'primary' | 'secondary';
export type FireMode = 'semi' | 'burst' | 'auto';
export type HitZone = 'HEAD' | 'TORSO' | 'STOMACH' | 'LIMBS';

export interface AmmoState {
  currentMag: number;
  magCapacity: number;
  reserve: number;
  maxReserve: number;
}

export interface DamageProfile {
  maxDamage: number;       // Dmax
  minDamage: number;       // Dmin
  nearDistance: number;     // Dnear - max damage threshold distance (m)
  farDistance: number;      // Dfar - min damage threshold distance (m)
}

export interface RecoilProfile {
  pitchPerShot: number;      // Upward camera kick (radians)
  pitchVariance: number;     // Random variance on pitch
  yawVariance: number;       // Horizontal dispersion sigma (radians)
  recoverySpeed: number;     // Spring omega for elastic recovery (rad/s)
  // Viewmodel spring kick
  kickBackDistance: number;  // Z-axis kick distance (meters)
  kickUpRotation: number;    // X-axis rotation kick (radians)
}

export interface ADSProfile {
  adsTime: number;           // Time to fully ADS (seconds), e.g. 0.20s
  adsFov: number;            // Zoomed FOV when fully ADS'd (degrees)
  adsPosition: { x: number; y: number; z: number };  // Viewmodel aim position offset
  adsMoveSpeedMultiplier: number;  // Speed penalty while ADS
}

export interface SprintOffsets {
  // Hipfire resting position
  hipPosition: { x: number; y: number; z: number };
  hipRotation: { x: number; y: number; z: number };  // Euler angles (radians)
  // Sprint lowered position
  sprintPosition: { x: number; y: number; z: number };
  sprintRotation: { x: number; y: number; z: number };
  // Tac-sprint raised position (MW2019 style, weapon pointed upward)
  tacSprintPosition: { x: number; y: number; z: number };
  tacSprintRotation: { x: number; y: number; z: number };
}

export interface WeaponDefinition {
  id: string;
  name: string;
  slot: WeaponSlot;
  fireMode: FireMode;
  fireRateRPM: number;         // Rounds per minute
  burstCount?: number;         // For burst mode
  ammo: {
    magCapacity: number;
    maxReserve: number;
  };
  damage: DamageProfile;
  recoil: RecoilProfile;
  ads: ADSProfile;
  offsets: SprintOffsets;
  reloadTime: number;          // Seconds for full reload
  sprintToFireDelay: number;   // Seconds (from SPRINT state)
  tacSprintToFireDelay: number; // Seconds (from TAC_SPRINT state, longer)
  slideSpreadMultiplier: number; // Extra spread when sliding
  // Mesh generation hint
  meshScale: number;
  meshColor: number;           // hex color for greybox
}

// Hitbox multiplier table per spec Section 2
export const HITBOX_MULTIPLIERS: Record<HitZone, number> = {
  HEAD: 2.0,
  TORSO: 1.2,
  STOMACH: 1.0,
  LIMBS: 0.8,
};

/**
 * Calculate distance-dependent damage falloff per Phase 3 Section 3.
 * BaseDamage = Dmax - tDrop * (Dmax - Dmin)
 * FinalDamage = BaseDamage * hitboxMultiplier
 */
export function calculateDamage(
  distance: number,
  profile: DamageProfile,
  hitZone: HitZone
): number {
  const tDrop = Math.max(0, Math.min(1,
    (distance - profile.nearDistance) / (profile.farDistance - profile.nearDistance)
  ));
  const baseDamage = profile.maxDamage - tDrop * (profile.maxDamage - profile.minDamage);
  return baseDamage * HITBOX_MULTIPLIERS[hitZone];
}
