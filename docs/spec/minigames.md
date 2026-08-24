# Minigames

## Shared Behavior

All minigames run inside the same runner stage:

- Player avatars react continuously to the latest camera input.
- Incoming obstacles or targets move toward the players.
- New obstacles or targets appear only while the game is running.
- Spawning pauses while a mode is waiting for required calibration.
- Obstacles or targets that pass the players without being hit or matched count as dodged.
- Hits are counted globally and per player.
- A recent hit briefly changes the game status before returning to running.

## Sideways Run

Sideways Run is the default mode.

The player moves horizontally based on their position in the camera view:

- Moving left in the displayed camera view moves the avatar left.
- Moving right in the displayed camera view moves the avatar right.
- The avatar stays near the center when the player is centered or not detected.

Obstacles appear at random horizontal positions and move toward the player. A collision counts as one hit for the colliding player. If an obstacle passes all players without a collision, it counts as dodged.

This mode does not require calibration.

## Jump And Duck

Jump and duck uses body position to choose one of nine action cells:

- Vertical actions: jump, run, duck.
- Horizontal actions: left, center, right.

Before play starts, each configured player must calibrate by raising both arms. Calibration completes after the app has enough raised-arm samples for every player. During calibration:

- The HUD asks players to raise their arms.
- Progress is shown while the run is active.
- Obstacles do not spawn.
- Camera guides appear after successful calibration.

After calibration:

- Raising the body above the calibrated neutral height maps to jump.
- Lowering the body below the calibrated neutral height maps to duck.
- Leaning or shifting the face left or right of the calibrated shoulder range maps to left or right.
- Otherwise the player remains in run-center.

Obstacles are built from top or bottom pieces on the left or right side of each player track:

- Top pieces block jump and run actions for their side.
- Bottom pieces block run and duck actions for their side.
- Left pieces block left and center horizontal actions.
- Right pieces block center and right horizontal actions.

Each blocked piece that overlaps a player's current action cell counts as a hit. Multiple pieces can count as multiple hits. Hit pieces visibly change feedback color. If an obstacle passes without any player hitting any piece, it counts as dodged.

## Hand Rhythm

Hand Rhythm uses hand position and recognized hand gesture instead of full-body movement.

The main game view is split into one panel per configured player. Each panel uses a player-centered view of that player's grid, hand marker, incoming targets, and matching section of the camera feedback. Camera imagery and detection marks are aligned to the grid inside the game world, including when the camera view is mirrored. Player panels remain ordered from left to right and are separated by visible dividers.

Each player has a section of the camera view. The selected grid size divides each player section into either:

- A 2 by 2 grid.
- A 3 by 3 grid.

The player avatar follows the detected hand cell in that player's section. The player's visible hand marker uses the emoji for the currently recognized gesture and is sized to the detected hand. If no hand is detected, the player stays in the center cell and shows an unknown gesture at a fallback size.

The level plays its music through a dedicated music channel. Before the first count-in, every player must hold an open palm in the central area of their grid. Each player panel shows whether that player is ready. All players must remain ready together briefly before the four-beat audible count-in begins. This central readiness area is the same for both grid sizes and does not require a literal center cell. Resuming a paused level begins another four-beat count-in without repeating the hand-readiness step. Pausing stops both music and target movement at the same song position.

Targets appear as gesture prompts placed in grid cells. The target chart is aligned to the song's quarter-note beat grid, and every configured player receives each chart prompt. Targets move according to the current song position so that they reach the hit zone on their assigned beat. By default, each player has a 10% chance for one chart prompt to create two targets in different cells at the same beat, requiring both hands to respond simultaneously; this chance is configurable in the Hand Rhythm controls. The player succeeds by making the prompted gesture while their detected hand is in the prompted cell as the target reaches the hit zone.

Supported gesture prompts are:

- Closed fist.
- Open palm.
- Pointing up.
- Thumb down.
- Thumb up.
- Victory.
- I love you.

A successful on-beat match counts as one hit for the target player and changes the target feedback to a success color. A failed match at the assigned beat changes the target feedback to a miss color. A target that passes without any successful match counts as dodged.

This mode does not require calibration.
