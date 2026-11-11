# HUSH

*The night matron of Saint Maren's.*

A first-person horror game that runs in the browser. You are an electrician sent
to an abandoned children's sanatorium at 2:13 AM to restore the power. The door
locks behind you. Something in the ward wing is humming.

**She hunts by sound.** Running is loud. Doors are loud. If the humming stops,
she has heard you.

## Play

No build step — it is a static site.

```sh
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (`npx serve`, GitHub Pages, Netlify, …). Opening
`index.html` straight from disk will not work, because browsers block ES modules
on `file://`.

Headphones strongly recommended. Play in the dark.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `E` / click | Use, open, take, hide |
| `F` | Flashlight |
| `Shift` | Run (loud) |
| `C` | Crouch (quiet) |
| `Esc` | Pause |

Touch devices get an on-screen stick, look-drag and buttons.

## What is in it

- A hand-built two-floor level: lobby, offices, day room, play room, stores,
  ward, hydrotherapy, isolation cells, morgue, boiler room, generator room and
  a long service tunnel.
- A stalker AI with hearing, sight, patrol / investigate / chase / search
  states, door handling, locker checks and a "director" that keeps her close.
- A dozen scripted scares and set pieces, a finale chase, and an ending.
- Hiding in lockers, crouch-sneaking, stamina, a battery-hungry flashlight.
- Everything is generated at load time: all textures are painted on canvases
  and **all audio is synthesised** with the Web Audio API (the lullaby, the
  scream, footsteps, doors, ambience, HRTF-positioned and run through a
  generated reverb). The only dependency is a vendored copy of three.js.
- Custom rendering: HDR pipeline with bloom, filmic tonemapping, film grain,
  chromatic aberration, lens distortion and glitch effects; a shadow-casting
  flashlight with a lens cookie and dust in the beam; room-bounded ceiling
  lights injected into three's lighting shader so light never leaks through walls.

## Layout

```
index.html        page shell, HUD and menus
css/style.css     interface
src/main.js       boot, main loop, game state
src/map.js        level grid, line of sight, A* pathfinding
src/level.js      shell geometry, doors, collision, light fixtures
src/world.js      everything placed inside the level
src/props.js      furniture and prop builders
src/build.js      geometry merging helpers
src/textures.js   procedural textures
src/roomlights.js room-clipped lights (shader injection)
src/postfx.js     post-processing
src/player.js     first-person controller, flashlight, hiding
src/matron.js     the creature: model, animation, AI
src/events.js     scripted scares and story beats
src/audio.js      synthesised sound
src/story.js      notes and text
src/ui.js         HUD / menus
src/input.js      keyboard, mouse, touch
vendor/           three.js (MIT)
```

## Settings

Sensitivity, volume, brightness, field of view and graphics quality are in the
menu. Quality drops automatically if the frame rate is low.

Contains flashing lights, loud sudden sounds and disturbing imagery.
