# Phase 7 — Team Deathmatch, Respawning, and UI

Implement a complete offline Team Deathmatch loop against AI bots.

Match systems:
- Configurable team composition and bot count
- Configurable match duration, score limit, and respawn delay
- Dynamic respawn selection based on teammate locations, enemy proximity, and immediate threats
- No temporary spawn protection
- Team score and match-end conditions
- Advanced scoring for eliminations, headshots, assists, and configured secondary objectives
- Clear victory, defeat, and scoreboard screens

UI:
- Tactical military HUD
- Health, ammunition, magazine count, sprint state, and essential alerts
- Responsive crosshair reacting to movement and weapon recoil
- Minimap showing teammates and only legitimately available enemy information
- Compact kill feed
- Military-style main menu, settings, loadout selection, pause menu, and match configuration

Ensure menus pause or resume the correct systems, input focus works correctly, and HUD values reflect actual gameplay state.

Test full match flow from menu to combat, death, respawn, scoring, and match completion.