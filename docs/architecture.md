# Game architecture

The game collection uses feature-oriented minigame slices on top of a small shared platform.

## Boundaries

- The application shell owns camera and detector startup, game selection, persisted preferences, and top-level run controls.
- The game catalog contains only the metadata needed before a game is loaded, such as its detector task, default detector backend, and translated labels.
- Each minigame slice owns its gameplay loop, input interpretation, scheduling, collision or judgment rules, scoring, and HUD.
- Shared game modules contain capabilities with the same meaning across games: Three.js world lifecycle, player avatars, projection math, player assignment, and track layout.

The app shell owns one shared music player and its pause/resume lifecycle. Each minigame reads the audio playback clock and owns its own music-aware chart and target movement. This keeps visual frame rate and animation timing from becoming the source of musical time.

Hand Rhythm remains an independent slice because its hand-readiness step, gesture judgment, grid targets, and player score panels do not use the forward-obstacle runner model.

Sideways and Jump/Duck currently share the Pose Runner slice. They both use pose input, a shared music-aware obstacle chart, track collisions, and the same aggregate runner HUD. Obstacle positions are derived from absolute song time so they reach the player on their assigned beats even if rendering is throttled or a frame is delayed. Their level definitions may configure that shared behavior without exposing hand-rhythm-specific fields.

## Adding a game

Add selection metadata to the game catalog, then implement a scene within its own directory under `frontend/src/game/games/`. Reuse a current slice only when the new game has the same update clock, input semantics, collision rules, scoring, and presentation lifecycle. Otherwise, add a separate slice and share only the lower-level capabilities it actually needs.

Avoid expanding shared types with optional fields for one game. A field used only by one game belongs in that game's local types. When two slices independently need identical behavior, extract the smallest stable helper after the common behavior is clear.
