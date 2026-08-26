# Minigames

## Shared Behavior

All minigames run inside the same game stage:

- Player avatars react continuously to the latest camera input.
- Gameplay advances only while the selected mode is running.
- Pausing preserves the current level state until play resumes.
- Each configured player receives an independent control section.

## Sideways Run

Sideways Run is the default mode.

The player moves horizontally based on their position in the camera view:

- Moving left in the displayed camera view moves the avatar left.
- Moving right in the displayed camera view moves the avatar right.
- The avatar stays near the center when the player is centered or not detected.

Obstacles appear at random horizontal positions and move toward the player. A collision counts as one hit for the colliding player. If an obstacle passes all players without a collision, it counts as dodged.

This mode does not require calibration.

## Climber

Climber uses the gesture detector and gives every configured player a separate view onto a long vertical wall. Only a portion of the wall is visible at once, and each player climbs independently.

- Closing a fist near a wall knob grabs it.
- Each hand must grab a different knob; one knob cannot be held by both hands.
- The wall only moves when both hands are attached and both closed fists move downward together.
- Pulling the wall downward raises the player's viewpoint and advances their height.
- Opening a hand releases its knob so that the player can reach up and grab another one.
- A fist that is not close enough to a knob does not attach, and the player's status explains why.

Small hand jitter does not move the wall, and a single hand cannot create progress. The slower of the two coordinated downward movements determines how far the wall travels, with sudden frame-to-frame movement limited to prevent tracking errors from creating large jumps. The height indicator shows progress toward the marked top of the wall. A player completes the level when their view reaches the top.

Detected hand cursors are white while neutral, yellow for an unattached closed fist, green for an open palm, and orange while attached. Attached knobs grow and glow orange, the goal is marked in green, and each player's completion panel turns green at the top.

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

When multiple hands are visible for one player, each on-screen hand marker follows the nearest hand from the previous detection frame. Changes in detector confidence or result order do not swap the two markers, and a temporarily missing hand leaves its marker slot empty instead of moving the other marker into it.

The main game view is split into one panel per configured player. Each panel uses a player-centered view of that player's grid, hand marker, incoming targets, and matching section of the camera feedback. Camera imagery and detection marks are aligned to the grid inside the game world, including when the camera view is mirrored. Player panels remain ordered from left to right and are separated by visible dividers.

Each player has a section of the camera view. The selected grid size divides each player section into either:

- A 2 by 2 grid.
- A 3 by 3 grid.

The player avatar follows the detected hand cell in that player's section. The player's visible hand marker uses a translucent emoji for the currently recognized gesture, so targets and the camera remain visible beneath it, and is sized to the detected hand. Its visual position and size smooth over small prediction fluctuations while catching up faster to deliberate larger movements. The marker follows the continuous detected hand position independently from the discrete grid cell used for matching, so crossing a cell boundary does not pull or snap the emoji to the cell center. This visual smoothing does not delay target matching. If tracking is temporarily lost, the marker retains its last visual transform and smoothly continues toward the new prediction when the hand returns.

The level plays its music through a dedicated music channel. Before the first count-in, every player must hold an open palm in the central area of their grid. Each player panel shows whether that player is ready. All players must remain ready together briefly before the four-beat audible count-in begins. This central readiness area is the same for both grid sizes and does not require a literal center cell. Resuming a paused level begins another four-beat count-in without repeating the hand-readiness step. Pausing stops both music and target movement at the same song position.

Targets appear as gesture prompts placed in grid cells. The target chart follows the song's beat grid, and every configured player receives each chart prompt. Targets move according to the current song position so that they reach the hit zone on their assigned beat.

Players can choose a saved difficulty before playing. Every difficulty follows the same analyzed musical accents, sections, and quiet rests:

- Easy leaves at least two beats between targets, uses a smaller gesture set, has no rapid bursts, and never requires both hands at once.
- Medium leaves at least one beat between targets, uses more gestures, has no rapid bursts, and reserves simultaneous two-hand targets for only the strongest eligible accents.
- Hard is the original full music-aware chart. It has the highest target density, the full gesture variety, limited eighth-note bursts, and all eligible two-hand accents.

Quiet beats create rests instead of targets. Louder attacks create larger targets, while the balance of low, middle, and high sound energy influences target rows and gesture families. Strong musical accents can create two targets in different cells at the same beat, requiring both hands simultaneously. The simultaneous-target control determines how many of the strongest eligible accents use both hands; zero disables simultaneous targets. Section intensity controls overall note density, and rapid passages limit movement between consecutive cells so that prompts remain physically reachable.

The player succeeds by making the prompted gesture while their detected hand is in the prompted cell as the target reaches the hit zone.

Supported gesture prompts are:

- Closed fist.
- Open palm.
- Pointing up.
- Thumb down.
- Thumb up.
- Victory.
- I love you.

A successful on-beat match counts as one hit for the target player. A failed match at the assigned beat counts as one miss for that player. Each player column shows only that player's hit and miss totals at its bottom edge.

Targets use a static yellow halo before judgment rather than continuously rotating bands. When a target is judged, that halo turns green for a hit or red for a miss; no large result sign obscures the play area.

This mode does not require calibration.
