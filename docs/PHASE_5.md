# Phase 5 — Advanced Tactical Bot AI

Implement advanced offline combat AI integrated with the existing map, physics, and weapon systems.

Navigation:
- NavMesh-based pathfinding
- Obstacle avoidance and alternative routes
- Tactical cover evaluation
- Flanking paths and advantageous positions

Perception and memory:
- Field-of-view checks and line-of-sight obstruction
- Hearing gunshots and footsteps based on sound intensity and distance
- Estimation of the approximate source location
- Memory of last known enemy positions
- Search and investigation behaviors
- Sharing enemy information among allied bots

Team tactics:
- Dynamic roles such as assault, support, flank, and retreat
- Coordinated movement and covering fire
- Tactical repositioning and situational changes
- Avoidance of excessive clustering and repeated identical behavior

Difficulty:
- Configurable easy, medium, and hard settings
- Adjust reaction time, accuracy, perception, and tactical sophistication
- Do not grant bots unfair omniscience or hidden knowledge of the player's position

Use clear AI states or behavior trees, configurable parameters, and debugging tools. Test navigation failures, blocked routes, sound investigation, team coordination, and difficulty differences.