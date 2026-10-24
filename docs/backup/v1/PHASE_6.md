# Phase 6 — Health, Loadouts, and Equipment

Implement the player and bot health systems, preset loadouts, and usable combat equipment.

Health and damage:
- No armor system
- Different damage multipliers for head, torso, arms, and legs
- Weapon- and distance-dependent damage
- Automatic health regeneration after a configurable delay outside combat
- Clear damage, death, and regeneration feedback

Loadouts:
- Preset classes selected before the match
- A primary weapon and secondary pistol
- Frag grenade and flash grenade
- Configurable ammunition and equipment limits

Equipment:
- Functional frag grenade with projectile physics, fuse timing, blast radius, and damage falloff
- Functional flash grenade with distance and line-of-sight effects
- Configurable cooldowns for equipment reuse
- Pickups for ammunition and eligible usable equipment
- Pickup limits, interaction feedback, and appropriate inventory updates

Ensure equipment behaves consistently for both player and bots where applicable. Test explosion boundaries, occlusion, flash effects, cooldowns, pickups, death, and health regeneration.