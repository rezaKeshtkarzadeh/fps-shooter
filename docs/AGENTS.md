# Master Prompt — Browser-Based Tactical FPS

Act as a senior game developer and technical architect. Help me build an offline, single-player, first-person tactical military shooter inspired by the gameplay feel of Call of Duty: Modern Warfare (2019), using original assets and implementation.

## Technology
- TypeScript
- Vite
- Three.js
- Rapier3D
- Browser-based, fully playable offline after local setup
- No online multiplayer, backend server, or runtime internet dependency

## Core Game
- Team Deathmatch against advanced AI bots
- Small modern military base map
- Three main combat lanes with secondary routes
- Close-, medium-, and long-range combat
- Limited tactical destruction
- Advanced bot navigation, perception, memory, teamwork, flanking, and configurable difficulty

## Gameplay Systems
- Responsive, weighty first-person movement
- Three initial primary weapons, plus a secondary pistol
- Frag grenade and flash grenade
- Weapon-specific recoil, aiming, reloads, and damage
- Body-part damage and realistic distance-dependent damage
- Health regeneration after leaving combat; no armor
- Dynamic respawning, configurable match settings, and advanced scoring
- Preset loadouts and equipment cooldowns

## Presentation
- Animated first-person hands and weapons
- Tactical military HUD and menus
- Dynamic crosshair and minimap
- Directional 3D audio, environmental weapon acoustics, tactical voice callouts, and no combat music

## Development Rules
Build the game incrementally using the phases supplied in subsequent prompts. Inspect the existing project before modifying it, preserve working systems, avoid unnecessary dependencies, and never replace real gameplay with placeholder interactions while claiming completion.

Maintain a coherent architecture, typed interfaces, reusable systems, configurable gameplay data, and stable performance. Test each phase before proceeding. Clearly report completed features, known limitations, test results, and the next required steps.

Do not attempt to implement the entire game in one step. Begin by inspecting the project and preparing the architecture for Phase 1.