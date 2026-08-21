# Accessibility

Allow configuring games so that they can be limited for certain people

Examples:

- allow removing the jump behavior on a game

# UX

## Allow exploring prior to the main game

Allow to move around prior to start playing

## Explain to the user how to configure the backend

[x] Package the Python backend so that it's a binary in releases tha people can download from GitHub

# New levels

## Dance Dance revolution with hands

Using hands in different places in the screen to hit the coming notes

Ideas:

- add hand posture recognition to use hand forms in each position
- use 9 positions (3 by 3 grid)
- get inspired from beat saber https://store.steampowered.com/app/620980/Beat_Saber/
- add long hands (staying with the hand in the same place for a while)

Inspirations:

- guitar hero
- dance dance revolution
- beat saber
- just dance

## Top down games

In top down games, human hands or even poses can be used as their controllers, thus making any kind of 2d game with simple inputs.

This can be a bit more abstract for kids though, since it might not be a simple mapping

# Review jumpDuckLevel

It currently uses a 2x3 position grid

I think it would be more intuitive for it to just be a 2x2 grid

# Improve camera handling

Currently it's cropping it, which is not taking advantage of the wider camera of my laptop

# Misc

## Add full e2e test

Inputs:

- generated video
- RNG seed for the balls or a static level

Using all different pipelines

We should see the player win the game

# Tech debt

## Decouple hand gesture and pose detection

They are entirely different modules, it does not make sense to have things like

```
detection: PersonDetection | HandGestureDetection
```

We should probably make the differt modules boundaries clearer, and then use them as building blocks
Then, in the building blocks we could impose dynamic restrictions about which module goes with what

Example:

- hand gesture recognizer gives gestures and positions
- another module can be the mapper from gesture to game actions
- game only knows about the game actions

By doing this, we'll know which modules adhere to the interfaces of the others, so that mappings make sense

## Improvements

`````
Overall, the repository has a good foundation: strict TypeScript, feature-oriented directories, detector clients behind a common entry point, and several pure mapping functions. The main constraint is that orchestration has accumulated in a few large modules, making new game modes and detector types require coordinated edits across the application.

## Highest-priority improvements

1. Introduce a gameplay input boundary

Raw detector types currently flow into the game as:

```ts
PersonDetection | HandGestureDetection | null
````

That union propagates through the detector hook and forces unsafe assertions throughout [GameScene.tsx](/home/az/dev/subway-surfer-with-motion/frontend/src/game/GameScene.tsx:204), including treating the same value as both pose and hand data.

Instead, convert detector results into game-facing inputs before they reach `GameScene`:

```ts
type PlayerInput =
  | { kind: "sideways"; normalizedX: number }
  | { kind: "pose"; pose: PlayerPose }
  | { kind: "hand"; gesture: HandGesture; cell: GridCell };
```

Even better, each level can receive only the actions it understands:

```ts
type JumpDuckInput = {
  horizontal: "left" | "center" | "right";
  vertical: "jump" | "run" | "duck";
};

type HandRhythmInput = {
  gesture: HandRhythmGesture | "none";
  cell: HandRhythmCell;
};
```

This would:

- Remove `as PersonDetection` and `as HandGestureDetection`.
- Keep detector coordinate systems out of gameplay.
- Let recorded or keyboard inputs drive the game without a camera.
- Make incompatible detector/game combinations impossible or explicitly validated.

2. Extract a deterministic game simulation from Three.js

The large effect in [GameScene.tsx](/home/az/dev/subway-surfer-with-motion/frontend/src/game/GameScene.tsx:154) currently handles:

- Animation scheduling.
- Calibration.
- Player movement.
- Spawning.
- Collision rules.
- Scoring.
- Three.js mutation.
- React state publication.
- Resource cleanup.

Move gameplay rules into a pure simulation:

```ts
function stepGame(
  state: GameState,
  inputs: PlayerInput[],
  deltaMs: number,
  random: RandomSource,
): GameStepResult;
```

`GameScene` should primarily translate the simulation state into Three.js transforms. Injecting time and randomness is important because obstacle generation currently uses `Math.random()` directly in [obstacles.ts](/home/az/dev/subway-surfer-with-motion/frontend/src/game/obstacles.ts:245).

This enables fast tests for:

- Collision boundaries.
- Scoring and despawning.
- Pausing and resuming.
- Calibration completion.
- Seeded obstacle sequences.
- Entire simulated games without WebGL.

3. Make levels registry-driven

Adding a level currently requires conditional changes throughout `App`, `GameScene`, obstacle creation, headings, spawn timing, detector selection, and UI buttons.

A lightweight registry would centralize that knowledge:

```ts
type LevelDefinition = {
  id: RunnerGameId;
  detectorTask: DetectorTask;
  defaultBackend: DetectorBackendId;
  spawnIntervalMs: number;
  createState(playerCount: number): LevelState;
  mapInput(snapshot: TrackingSnapshot): LevelInput[];
  update(state: LevelState, context: LevelUpdateContext): LevelUpdate;
};
```

Then `App` can render game selection from the registry, and `GameScene` delegates level-specific behavior rather than growing nested `selectedGameId` checks such as those around [GameScene.tsx](/home/az/dev/subway-surfer-with-motion/frontend/src/game/GameScene.tsx:292).

Keep the registry small; a general plugin framework is unnecessary at this stage.

4. Break up `useMotionDetector`

[useMotionDetector.ts](/home/az/dev/subway-surfer-with-motion/frontend/src/hooks/useMotionDetector.ts:19) is currently 502 lines and owns several distinct responsibilities:

- Detector lifecycle.
- Pull and stream scheduling.
- Frame capture and scaling.
- Track-ID retention and player assignment.
- UI throttling.
- Overlay drawing.
- Timing calculation.
- Translated status messages.

A practical split would be:

- `DetectionSession`: detector loading, start, stop, disposal.
- `useDetectionLoop`: video-frame scheduling and capture.
- `assignDetectionsToPlayers`: pure tracking/assignment state transition.
- `useDetectionPresentation`: throttled React state and diagnostics.
- Overlay rendering stays outside the detector session.

The track-ID logic beginning at [useMotionDetector.ts](/home/az/dev/subway-surfer-with-motion/frontend/src/hooks/useMotionDetector.ts:162) is especially suitable for a pure stateful function with fake time. It currently has no direct tests.

Use semantic status values such as `{ phase: 'loading-model' }` internally and translate them in the UI. This avoids coupling infrastructure to `useI18n`.

## Important correctness cleanup

There are currently two persistence mechanisms for the selected game:

- `selectedRunnerGameId` inside app preferences.
- `GAME_SELECTION_STORAGE_KEY` in [gameStorage.ts](/home/az/dev/subway-surfer-with-motion/frontend/src/game/gameStorage.ts:3).

`readStoredRunnerGameId` is not used, while `GameScene` still writes the second key. Consequently, the invalid-level test writes to an unused storage entry and does not test the preference parser.

Additionally, [appPreferences.ts](/home/az/dev/subway-surfer-with-motion/frontend/src/app/appPreferences.ts:112) casts a stored string to `RunnerGameId` without validating it.

Consolidate this to one source of truth, validate the game ID at runtime, and test the exact storage path used by the application.

## Application and UI cleanup

`App.tsx` contains many nearly identical preference callbacks and passes a boolean indicating whether a detector reset is necessary around [App.tsx](/home/az/dev/subway-surfer-with-motion/frontend/src/app/App.tsx:92). That policy will become fragile as preferences grow.

Prefer a typed preference reducer:

```ts
dispatch({ type: "detector/backendChanged", backend });
dispatch({ type: "camera/mirrorChanged", mirrored });
dispatch({ type: "game/selected", gameId });
```

Derive a stable `detectorConfigurationKey` from only the fields requiring a reload. A change to that key can trigger detector replacement automatically; callers no longer decide whether to pass `true`.

[DetectionControls.tsx](/home/az/dev/subway-surfer-with-motion/frontend/src/ui/DetectionControls.tsx:96) could then be split into focused view components:

- `CameraSettings`
- `PlayerSettings`
- `DetectorSettings`
- `TimingDiagnostics`
- `DetectionList`

These should receive small grouped models rather than roughly twenty individual props.

## Strengthen protocol boundaries

The browser and Python server independently describe the same wire format:

- TypeScript in [detectionSchema.ts](/home/az/dev/subway-surfer-with-motion/frontend/src/pose-detection/detectionSchema.ts:73).
- Python dictionaries in [protocol.py](/home/az/dev/subway-surfer-with-motion/pose-estimation-tracker-server/src/pose_estimation_tracker_server/protocol.py).
- Unchecked JSON casts in [pythonWebRtcDetectorClient.ts](/home/az/dev/subway-surfer-with-motion/frontend/src/pose-detection/pythonWebRtcDetectorClient.ts:140).

Define a versioned JSON Schema and either generate types or validate both implementations against shared fixtures. At minimum, validate incoming WebRTC results before handing them to gameplay.

The 448-line Python [server.py](/home/az/dev/subway-surfer-with-motion/pose-estimation-tracker-server/src/pose_estimation_tracker_server/server.py:1) would also benefit from separation into:

- CLI/configuration.
- YOLO inference service.
- WebRTC session.
- WebSocket signaling.
- Protocol validation.

Injecting the tracker and peer-connection factories would allow session lifecycle tests without loading Ultralytics or opening sockets.

## Testing and CI

The current baseline is healthy:

- Frontend: 24 tests passed.
- Python: 10 tests passed.
- TypeScript build passed.
- ESLint passed.

The largest gaps are orchestration and gameplay behavior. Add tests in this order:

1. Pure player assignment and track timeout tests.
2. Pure level input mapping tests.
3. Seeded simulation tests for spawn, collision, scoring, and calibration.
4. Hook tests for start/stop/reset and stale detector results.
5. Worker protocol and WebRTC message validation tests.
6. One Playwright flow using a deterministic prerecorded video or fake tracking source.

The deployment workflow currently runs frontend tests and build, but not lint or Python tests. Extend [.github/workflows/deploy-github-pages.yml](/home/az/dev/subway-surfer-with-motion/.github/workflows/deploy-github-pages.yml:25) with:

- `pnpm lint`
- `uv run pytest`
- Optionally coverage thresholds focused initially on new pure domain modules.

## Suggested implementation sequence

1. Fix and consolidate game persistence.
2. Introduce typed, detector-independent player inputs.
3. Extract track assignment from `useMotionDetector` and add tests.
4. Extract the deterministic game simulation with injected clock/RNG.
5. Add the level registry and migrate one level at a time.
6. Split the large hook and UI component.
7. Add shared frontend/Python protocol validation and CI coverage.
8. Lazy-load documentation, Three.js/game code, and detector-specific code—the current build reports a 1.08 MB main JavaScript chunk and a 23.6 MB WASM asset.

No files were changed during this review.

`````
