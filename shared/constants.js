// Shared constants between client and server
// Physics must be identical on both sides

export const PHYSICS = {
  gravity:           { x: 0, y: 0, z: -3.25 * 4 },
  defaultRestitution: 0.2,

  car: {
    mass:            40,
    // Body-local axes matching client Physics.js: X=depth(forward), Y=width(right), Z=up
    // chassisDepth=2.03 → half=1.015, chassisWidth=1.02 → half=0.51, chassisHeight=1.16 → half=0.58
    chassisHalfSize: { x: 1.015, y: 0.51, z: 0.58 },
    // Same chassis shape offset as client Physics.js
    chassisOffset:   { x: 0, y: 0, z: 0.41 },

    wheel: {
      radius:                          0.25,
      suspensionStiffness:             50,
      suspensionRestLength:            0.1,
      frictionSlip:                    10,
      dampingRelaxation:               1.8,
      dampingCompression:              1.5,
      maxSuspensionForce:              100000,
      rollInfluence:                   0.01,
      maxSuspensionTravel:             0.3,
      customSlidingRotationalSpeed:    -30,
    },

    // Body-local positions matching client Physics.js convention:
    //   X = wheelFrontOffsetDepth / wheelBackOffsetDepth (forward axis)
    //   Y = ±wheelOffsetWidth (right axis)
    // [frontLeft, frontRight, backLeft, backRight] — same order as client
    wheelPositions: [
      { x:  0.635, y:  0.39, z: 0 },  // frontLeft
      { x:  0.635, y: -0.39, z: 0 },  // frontRight
      { x: -0.475, y:  0.39, z: 0 },  // backLeft
      { x: -0.475, y: -0.39, z: 0 },  // backRight
    ],

    controls: {
      maxForce:      800,
      boostForce:    1600,
      maxBrake:      50,
      maxSteer:      0.3,
    },
  },
}

export const NETWORK = {
  tickRate:              20,    // Hz — server broadcast frequency
  physicsRate:           60,    // Hz — physics step frequency
  maxPlayers:            20,
  interpolationDelay:    80,    // ms — client renders this far behind server (extrapolates if buffer dries up)
  snapshotBufferTime:    3000,  // ms — how long to keep old snapshots
  pingInterval:          2000,  // ms
}

// Input bitmask
export const INPUT = {
  UP:    1,
  DOWN:  2,
  LEFT:  4,
  RIGHT: 8,
  BRAKE: 16,
  BOOST: 32,
}

// Race grid — 2-wide staggered positions on the start straight (facing +X)
export const SPAWN_GRID = [
  { x: 10,  y: -33 },  { x: 10,  y: -37 },
  { x:  5,  y: -33 },  { x:  5,  y: -37 },
  { x:  0,  y: -33 },  { x:  0,  y: -37 },
  { x: -5,  y: -33 },  { x: -5,  y: -37 },
  { x: -10, y: -33 },  { x: -10, y: -37 },
  { x: -15, y: -33 },  { x: -15, y: -37 },
  { x: -20, y: -33 },  { x: -20, y: -37 },
  { x: -25, y: -33 },  { x: -25, y: -37 },
  { x: -30, y: -33 },  { x: -30, y: -37 },
  { x: -35, y: -33 },  { x: -35, y: -37 },
]

export const CAR_COLORS = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e91e63', // pink
  '#ffffff',  // white
]

// ── Combat tuning — server is authoritative; client visuals reflect server truth ──
export const COMBAT = {
  maxHp:              100,
  respawnMs:          3000,
  spawnInvulnMs:      2000,    // 2s invulnerability window after respawn

  missile: {
    speed:            65,      // m/s — matches client Weapons.js SPEED
    lifeMs:           3500,
    cooldownMs:       850,
    hitRadius:        2.8,
    damage:           30,
    maxInFlight:      40,      // global cap to prevent abuse
  },

  meteor: {
    damage:           25,
    hitRadius:        3.5,
  },

  mine: {
    armDelayMs:       1000,    // 1s arming time after drop
    lifeMs:           45000,   // mines persist 45s before despawn
    triggerRadius:    2.4,
    explosionRadius:  4.0,
    damage:           45,
    cooldownMs:       2500,
    maxPerPlayer:     4,
  },

  chat: {
    minIntervalMs:    700,     // 0.7s between messages per player
    burstMax:         4,       // up to 4 messages allowed in burst window
    burstWindowMs:    5000,    // 5s window for burst
    maxLength:        120,
    maxNameLength:    16,
  },
}

// ── Matchbox COLLECT mode tuning ────────────────────────────────────────────
// Player drives the arena and picks up 10 Matchbox cars before the timer
// expires. Server is authoritative for pickup state, score, and timer.
export const COLLECT = {
  durationMs:       60_000,   // 60s match
  countdownMs:      3_000,    // 3-2-1-GO pre-match phase
  targetCount:      10,
  pickupRadius:     2.6,      // m — proximity for auto-collect
  pickupHeightZ:    1.0,      // float a meter above ground
  // Mud puddles — flat brown patches that drag the car when driven through.
  // Each has (x, y) center, radius in meters, and a drag factor (lower = slower).
  mudPuddles: [
    { x:  20, y:   8, r: 4.5, drag: 0.65 },
    { x: -16, y: -14, r: 5.0, drag: 0.55 },
    { x:  -8, y:  22, r: 3.8, drag: 0.7  },
    { x:  18, y: -22, r: 4.2, drag: 0.6  },
    { x: -22, y:  -2, r: 4.0, drag: 0.6  },
  ],

  // 10 fixed positions, each paired with a distinct car model key. Spread
  // across cardinal quadrants + plateau + ramps to force movement.
  positions: [
    { x:   0, y:   0, z: 2.6, model: 'nissan_pickup'   },  // plateau apex
    { x:  28, y:  28, z: 1.3, model: 'el_camino'       },  // NE bowl
    { x: -28, y:  35, z: 3.4, model: 'dodge_challenger'},  // NW stairs deck top
    { x:  28, y: -36, z: 1.3, model: 'ford_f150'       },  // SE kicker landing
    { x: -28, y: -28, z: 2.9, model: 'plymouth_coupe'  },  // SW spine
    { x:   0, y:  35, z: 1.0, model: 'volvo_240'       },  // N corridor
    { x:  35, y:   0, z: 1.0, model: 'ford_mustang'    },  // E corridor
    { x: -35, y:   0, z: 1.0, model: 'fiat_500'        },  // W corridor
    { x:  14, y: -16, z: 1.0, model: 'bluebird_wagon'  },  // mid south-east
    { x: -14, y:  16, z: 1.0, model: 'international'   },  // mid north-west
  ],
}

// Vehicle classes — asymmetric stats. Server validates the type on join.
// Multipliers stack on top of PHYSICS.car.controls values; HP overrides COMBAT.maxHp.
export const VEHICLE_TYPES = {
  default: {
    name:        'Default',
    icon:        '🚗',
    blurb:       'Balanced HP, speed, and handling.',
    hp:          100,
    forceMul:    1.0,
    boostMul:    1.0,
    massMul:     1.0,
    steerMul:    1.0,
  },
  speeder: {
    name:        'Speeder',
    icon:        '🏎️',
    blurb:       'Glass cannon. Fast and nimble, fragile.',
    hp:          75,
    forceMul:    1.2,
    boostMul:    1.25,
    massMul:     0.8,
    steerMul:    1.15,
  },
  tank: {
    name:        'Tank',
    icon:        '🚙',
    blurb:       'Heavy bruiser. More HP, slower.',
    hp:          160,
    forceMul:    0.9,
    boostMul:    0.85,
    massMul:     1.5,
    steerMul:    0.85,
  },
  // Cybertruck stays as default-equivalent for backwards compatibility
  cybertruck: {
    name:        'Cybertruck',
    icon:        '🚙',
    blurb:       'Default stats, alt cosmetic.',
    hp:          100,
    forceMul:    1.0,
    boostMul:    1.0,
    massMul:     1.0,
    steerMul:    1.0,
  },
}
