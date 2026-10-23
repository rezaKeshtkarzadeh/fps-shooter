/**
 * Tactical FPS - Game Configuration
 * Bitmasks, physics properties, movement tuning, camera limits, player dimensions,
 * stance definitions, sliding physics, mantle traversal, and ladder kinematics.
 */

export const CollisionGroups = {
  GROUP_ENVIRONMENT: 0x0001,
  GROUP_PLAYER:      0x0002,
  GROUP_BOT:         0x0004,
  GROUP_PROJECTILE:  0x0008,
  GROUP_HITSCAN:     0x0010,
  GROUP_LADDER:      0x0020,
} as const;

/**
 * Rapier interaction groups bitmask helper:
 * Upper 16 bits: membership groups this collider belongs to.
 * Lower 16 bits: filter groups this collider can interact with.
 */
export function createInteractionGroups(memberships: number, filter: number): number {
  return ((memberships & 0xffff) << 16) | (filter & 0xffff);
}

export const GAME_CONFIG = {
  // Physics & Loop
  physics: {
    tickRate: 120, // 120 Hz fixed timestep
    fixedDelta: 1 / 120,
    maxAccumulatorDelta: 0.1, // Prevent spiral of death on lag spikes
    gravity: -24.0, // Weighty MW2019-style tactical gravity
  },

  // Stances & Dimensions
  stances: {
    stand: {
      eyeHeight: 1.6, // meters
      capsuleRadius: 0.4,
      capsuleHalfHeight: 0.5, // total height = 2*0.5 + 2*0.4 = 1.8m
      speed: 5.2, // m/s
    },
    crouch: {
      eyeHeight: 1.05,
      capsuleRadius: 0.4,
      capsuleHalfHeight: 0.2, // total height = 2*0.2 + 2*0.4 = 1.2m
      speed: 2.8, // m/s
    },
    prone: {
      eyeHeight: 0.35,
      capsuleRadius: 0.3,
      capsuleHalfHeight: 0.1, // total height = 2*0.1 + 2*0.3 = 0.8m
      speed: 1.4, // m/s
    },
    slide: {
      eyeHeight: 0.95,
      capsuleRadius: 0.4,
      capsuleHalfHeight: 0.2, // total height = 1.2m
    },
    clearanceEpsilon: 0.05, // meters clearance tolerance
  },

  // Locomotion & Sprinting
  movement: {
    walkSpeed: 5.2, // m/s
    sprintSpeed: 8.0, // m/s
    tacSprintSpeed: 10.2, // m/s (MW2019 tactical sprint)
    jumpVelocity: 7.2, // m/s
    acceleration: 45.0,
    deceleration: 32.0,
    airControl: 0.20, // 20% air control to prevent mid-air zigzagging

    // Tactical sprint constraints
    tacSprintMaxDuration: 3.0, // seconds
    tacSprintCooldown: 4.0, // seconds
    tacSprintAngleThreshold: Math.cos((25 * Math.PI) / 180), // ~0.906 forward cone
  },

  // Character Controller Tuning
  controller: {
    skinOffset: 0.02,
    autoStepMaxHeight: 0.35, // Smoothly step over stairs up to 35cm
    autoStepMinWidth: 0.2,
    autoStepIncludeDynamic: true,
    slideEnabled: true,
    maxSlopeClimbAngle: (45 * Math.PI) / 180, // Can climb up to 45 deg
    minSlopeSlideAngle: (50 * Math.PI) / 180, // Slides down >50 deg
    snapToGroundDistance: 0.4, // Snaps down ramps and stairwells
    spawnPosition: { x: 0, y: 0.95, z: 0 },
  },

  // Slide Dynamics
  slide: {
    entryBoost: 1.25, // v_entry = v_current * 1.25
    friction: 0.55, // mu_slide friction coefficient
    minSpeed: 2.5, // m/s exit threshold
    maxDuration: 1.4, // seconds max slide time
    steeringDamping: 1.5, // rad/s maximum angular redirect rate
    dutchRollAngle: (-2.5 * Math.PI) / 180, // slight camera roll during slide
  },

  // Mantle & Traversal
  mantle: {
    forwardRayDistance: 0.85, // meters forward from chest
    chestHeightOffset: 0.9, // meters up from feet (reliably scans 1.0m - 1.8m obstacles)
    minLedgeHeight: 0.6, // min obstacle height (m)
    maxLedgeHeight: 1.8, // max obstacle height (m)
    duration: 0.45, // seconds for quadratic Bezier traversal
    apexHeightOffset: 0.2, // apex lift above ledge
  },

  // Ladder Traversal
  ladder: {
    climbSpeed: 3.2, // m/s
    jumpOffImpulse: 4.0, // m/s push-off away from ladder normal
    interactionDistance: 0.85, // meters
  },

  // Camera & Mouse
  camera: {
    fov: 85,
    near: 0.05,
    far: 500,
    mouseSensitivity: 0.0022,
    minPitch: (-89 * Math.PI) / 180,
    maxPitch: (89 * Math.PI) / 180,

    // Critically Damped Spring for Camera Pivot height
    springFrequency: 18.0, // rad/s (omega)
    dampingRatio: 1.0, // critically damped (zeta = 1.0)

    // Dual-axis Lissajous Head Bob
    headBob: {
      amplitudeX: 0.022,
      amplitudeY: 0.032,
      baseFrequency: 7.5,
    },
  },
} as const;
