# Tactical FPS Simulator

A browser-based, offline-capable, single-player tactical first-person shooter built with TypeScript, Vite, Three.js, and Rapier3D.

The project aims to deliver a tactical military combat experience inspired by the gameplay feel of *Call of Duty: Modern Warfare (2019)*, with original implementation and assets.

**Project status:** Phase 4 — Work in Progress

This project is an evolving web-based combat simulator, not a finished game. Core systems, gameplay details, AI behavior, presentation, and overall polish still require further development, testing, and refinement.

## Overview

The goal is to build a tactical FPS that runs directly in a modern web browser, supports offline single-player gameplay after local setup, and does not require an online multiplayer service or backend server.

The experience focuses on tactical movement, weapon handling, combat against AI-controlled opponents, team-based objectives, and a modern military environment.

### Key Goals

- **Single-player combat:** Team Deathmatch against AI-controlled bots.
- **Tactical gameplay:** Responsive movement, aiming, recoil, reloading, grenades, and weapon-specific damage.
- **Advanced AI:** Perception, memory, navigation, teamwork, flanking, and configurable difficulty.
- **Modern military environment:** A compact military base with three main combat lanes and secondary routes.
- **Immersive presentation:** First-person weapons and hands, a tactical HUD, minimap, directional audio, and contextual voice callouts.
- **Offline support:** No runtime internet dependency, online multiplayer, or backend server.

## Technology Stack

| Technology | Purpose |
| --- | --- |
| [TypeScript](https://www.typescriptlang.org/) | Typed application and gameplay logic |
| [Vite](https://vite.dev/) | Development server and production build tooling |
| [Three.js](https://threejs.org/) | 3D rendering, scenes, cameras, and visual effects |
| [Rapier3D](https://rapier.rs/) | Physics simulation and collision detection |
| [Bun](https://bun.sh/) | JavaScript runtime, package manager, and development tooling |

### Alternative 3D Engine

If you prefer a more integrated 3D engine with a broader set of built-in game-development tools, consider [Babylon.js](https://www.babylonjs.com/) as an alternative to [Three.js](https://threejs.org/).

Babylon.js provides features such as built-in physics integration, a scene graph, animation systems, and debugging tools that may be useful for a project of this scope.

Both engines are capable of powering browser-based 3D games. The best choice depends on your architecture, workflow, performance requirements, and desired level of built-in functionality.

**Note:** The current project architecture is based on Three.js and Rapier3D. Switching to Babylon.js would require a deliberate architectural change rather than a simple dependency replacement.

## Gameplay Features

The following features define the intended gameplay scope. Their implementation and completeness may vary at the current development stage.

### Combat and Weapons

- Three initial primary weapon types and a secondary pistol.
- Weapon-specific recoil, aiming, reloading, and damage behavior.
- Body-part damage and distance-dependent damage calculations.
- Frag and flash grenades.
- Health regeneration after leaving combat, without an armor system.
- Preset loadouts and equipment cooldowns.

### AI and Team Combat

- Team Deathmatch against AI-controlled opponents.
- Navigation around obstacles and across multiple combat routes.
- Perception and memory of enemies and combat events.
- Team coordination, flanking, and tactical positioning.
- Configurable AI difficulty.

### Map and Environment

- A small modern military base.
- Three main combat lanes with secondary routes.
- Close-, medium-, and long-range combat opportunities.
- Limited tactical destruction.
- Dynamic respawning and configurable match settings.

### User Interface and Audio

- Animated first-person hands and weapons.
- Tactical military HUD and menus.
- Dynamic crosshair and minimap.
- Directional 3D audio and environmental weapon acoustics.
- Tactical voice callouts.
- No combat music, emphasizing environmental audio and battlefield awareness.

## Development Status

The project is currently in **Phase 4** of development and remains a work in progress.

It should be treated as an evolving browser-based tactical combat simulator rather than a completed, production-ready game.

Further development is required to complete and refine the gameplay systems, improve AI decision-making, tune weapon behavior, enhance animation and audio, optimize performance, and validate the overall experience.

The exact completion status of individual features should be verified against the current source code and implemented systems.

### Remaining Development Priorities

- Continue implementing and refining the current development phase.
- Improve AI navigation, perception, combat decisions, and team coordination.
- Balance weapons, damage, recoil, and combat pacing.
- Refine movement, aiming, animations, and player feedback.
- Improve HUD usability, minimap behavior, and menu interactions.
- Integrate and tune audio, environmental effects, and tactical callouts.
- Test collision handling, respawning, match flow, and edge cases.
- Profile performance and verify reliable offline operation.
- Fix known issues and replace any incomplete gameplay systems with functional implementations.

## Getting Started

### Prerequisites

Install [Bun](https://bun.sh/) and a modern browser with WebGL support.

### Installation

Clone or download the repository, then open a terminal in the project directory.

Install the project dependencies:

```bash
bun install
```

### Development

Start the Vite development server:

```bash
bun run dev
```

Open the local URL printed in the terminal to launch the application.

### Production Build

Create a production build:

```bash
bun run build
```

### Preview the Production Build

```bash
bun run preview
```

**Note:** These commands assume that the corresponding scripts are defined in `package.json`. Check the existing project configuration if a command is unavailable.

### Offline Usage

The project is designed to avoid runtime internet dependencies. After the required dependencies and assets have been installed or downloaded locally, the application should not need external services to run its single-player gameplay.

Development and preview commands typically start a local server. A production build can also be served locally or packaged through an appropriate static hosting solution.

Offline support must be verified against the actual application, including asset loading, fonts, audio, and any third-party resources. Running the development server is not, by itself, proof that every feature works offline.

## Project Principles

Development follows these principles:

- **Incremental implementation:** Build and test one phase at a time.
- **Maintainable architecture:** Use typed interfaces, reusable systems, and configurable gameplay data.
- **Preserve existing work:** Inspect the current codebase before modifying it and avoid replacing working systems unnecessarily.
- **Real functionality:** Do not represent placeholder interactions as completed gameplay.
- **Performance awareness:** Maintain stable frame rates and efficient resource usage.
- **Transparent progress:** Document completed features, known limitations, test results, and the next development steps.

## License and Assets

This project is intended to use original implementation, original or appropriately licensed assets, and independently developed gameplay systems.

*Call of Duty: Modern Warfare (2019)* is referenced solely as a gameplay and presentation inspiration. This project is not an official product of, nor affiliated with, Activision.

A license should be added to the repository once the project's distribution and asset-licensing terms have been established.

---

**Current focus:** Continue development from Phase 4, verify existing functionality, resolve incomplete systems, and progressively move toward a stable, polished, offline single-player tactical FPS experience.
