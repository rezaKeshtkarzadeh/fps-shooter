# Phase 2 — First-Person Character Controller

Extend the existing project without breaking Phase 1.

Implement a physics-based first-person controller using Rapier3D, including:
- Walking and sprinting
- Tactical sprint and faster sprint with configurable limits and recovery
- Jumping, crouching, prone movement, and sliding
- Mantling over suitable obstacles
- Ladder interaction
- Acceleration, deceleration, air control, and grounded detection
- Collision-safe movement and reliable slope handling
- Configurable movement speeds, stamina or sprint constraints, and input settings

Use a coherent state machine to prevent incompatible movement states. Use swept collision checks or equivalent safe methods where needed to prevent clipping through geometry.

Keep the camera responsive with restrained motion. Do not add excessive camera shake.

Test transitions between movement states, collisions, jumping, and obstacle traversal. Report what is implemented and verified.