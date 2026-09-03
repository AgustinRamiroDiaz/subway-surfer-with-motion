# Minigames

## Shared Behavior

All minigames run inside the same runner stage:

- The complete camera image fits inside the playable game stage without changing its aspect ratio. It expands until either its horizontal or vertical edge reaches the stage boundary.
- Player avatars react continuously to the latest camera input.
- Incoming obstacles or targets move toward the players.
- New obstacles or targets appear only while the game is running.
- Spawning pauses while a mode is waiting for required calibration.
- Every mode plays the song selected on the level board and uses a four-beat audible count-in before music-synchronized play begins. Each bundled song supplies its own beat timing and synchronized events.
- Pausing stops music and obstacle movement at the same song position. Resuming begins another four-beat count-in before continuing.
- Obstacles or targets that pass the players without being hit or matched count as dodged.
- Hits are counted globally and per player.
- A recent hit briefly changes the game status before returning to running.
- The saved render-rate control defaults to 60 frames per second and limits visual updates between 15 and 165 frames per second without changing detector frequency or elapsed-time-based gameplay timing.

## Sideways Run

Sideways Run is the default mode.

The player moves horizontally based on their position in the camera view:

- Moving left in the displayed camera view moves the avatar left.
- Moving right in the displayed camera view moves the avatar right.
- The avatar stays near the center when the player is centered or not detected.

Obstacles appear at random horizontal positions. One obstacle is assigned to the strongest audible beat of each selected musical bar, while quiet bars create rests. Each obstacle moves from its song position so that it reaches the player on its assigned beat. A collision counts as one hit for the colliding player. If an obstacle passes all players without a collision, it counts as dodged.

This mode does not require calibration. Starting it begins the four-beat count-in immediately.

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

- The music begins with a four-beat audible count-in.
- Raising the body above the calibrated neutral height maps to jump.
- Lowering the body below the calibrated neutral height maps to duck.
- Leaning or shifting the face left or right of the calibrated shoulder range maps to left or right.
- Otherwise the player remains in run-center.

Obstacles are built from top or bottom pieces on the left or right side of each player track:

- Top pieces block jump and run actions for their side.
- Bottom pieces block run and duck actions for their side.
- Left pieces block left and center horizontal actions.
- Right pieces block center and right horizontal actions.

Each obstacle pattern is assigned to the strongest audible beat of a selected musical bar. Quiet bars create rests, and obstacle positions follow the song clock so the pattern reaches every player on its assigned beat.

Each blocked piece that overlaps a player's current action cell counts as a hit. Multiple pieces can count as multiple hits. Hit pieces visibly change feedback color. If an obstacle passes without any player hitting any piece, it counts as dodged.

## Hand Rhythm

Hand Rhythm uses hand position and recognized hand gesture instead of full-body movement.

Before playing, players can choose between the default Three.js 3D presentation and a native
Canvas 2D presentation. The choice is saved. Both presentations consume the same hand input,
music clock, target chart, matching rules, feedback, and render-rate limit; changing presentation
does not reload or reconfigure the detector. The Canvas 2D presentation preserves the complete
fitted camera area and represents target depth through perspective-correct movement and scaling:
targets change slowly while distant and accelerate visually as they approach the hit area.

When multiple hands are visible for one player, each on-screen hand marker follows the nearest hand from the previous detection frame. Changes in detector confidence or result order do not swap the two markers, and a temporarily missing hand leaves its marker slot empty instead of moving the other marker into it.

The main game view is split into one panel per configured player. Each panel fills its share of the stage width and uses a player-centered view of that player's grid, hand marker, incoming targets, and matching section of the camera feedback. Camera imagery and detection marks fit inside the panel without cropping and are aligned to the grid inside the game world, including when the camera view is mirrored. Player panels remain ordered from left to right and are separated by visible dividers.

Each player panel includes a translucent rear horizon, row-height rails, and an overhead ceiling grid extending from the target spawn area to the hit area. These references use the same boundaries as the low, middle, and top target rows so incoming prompts remain easy to classify while they approach.

Each player has a section of the camera view. The selected grid size divides each player section into either:

- A 2 by 2 grid.
- A 3 by 3 grid.

The player avatar follows the detected hand cell in that player's section. The player's visible hand marker uses a translucent emoji for the currently recognized gesture, so targets and the camera remain visible beneath it, and is sized to the detected hand. Its visual position and size smooth over small prediction fluctuations while catching up faster to deliberate larger movements. The marker follows the continuous detected hand position independently from the discrete grid cell used for matching, so crossing a cell boundary does not pull or snap the emoji to the cell center. This visual smoothing does not delay target matching. If tracking is temporarily lost, the marker retains its last visual transform and smoothly continues toward the new prediction when the hand returns.

Before the first count-in, every player must hold an open palm in the central area of their grid. Each player panel shows whether that player is ready. All players must remain ready together briefly before the four-beat audible count-in begins. This central readiness area is the same for both grid sizes and does not require a literal center cell. Resuming a paused level begins another four-beat count-in without repeating the hand-readiness step.

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
