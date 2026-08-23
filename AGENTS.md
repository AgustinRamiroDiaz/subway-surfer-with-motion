# AGENTS.md

## Project

Subway Surfer with Motion is a React/Vite motion-controlled runner game. The frontend uses camera-based person detection to move one or two players in a Three.js scene.

## Structure

- `frontend/src/App.tsx`: app shell, camera/detector/game wiring.
- `frontend/src/GameScene.tsx`: Three.js runner scene, obstacles, collisions, HUD stats.
- `frontend/src/useMotionDetector.ts`: camera frame loop and detector state.
- `frontend/src/aiDetector.ts`: YOLO and MediaPipe detector loading/decoding.
- `frontend/src/poseOverlay.ts`: camera overlay drawing and player-position assignment.
- `frontend/src/DetectionControls.tsx`: detector controls and advanced settings.
- `frontend/src/CameraFeedbackPanel.tsx`: camera preview, overlay, and position guides.
- `docs/spec/`: user-facing behavior specs for the app and minigames.

## Commands

Run from the repository root:

- `pnpm start`: start the Vite dev server for the frontend.
- `pnpm build`: run TypeScript checks and build the frontend.
- `pnpm test`: run Vitest tests.
- `pnpm lint`: run ESLint.

## Development Notes

- Backward compatibility is not a requirement; prefer the simplest correct current behavior, including breaking or replacing existing interfaces when needed.
- Prefer existing React hooks and component patterns over adding new abstractions.
- Keep detector work in `aiDetector.ts` and camera-loop state in `useMotionDetector.ts`.
- The game supports two players. MediaPipe must keep `numPoses: 2`; YOLO can return multiple detections naturally.
- Player positions are normalized values from `0` to `1`. They should drive gameplay and camera markers, but avoid showing raw percentages in the game HUD.
- Camera mirroring is a display preference and is accounted for when assigning player positions.
- Keep `docs/spec/` aligned with the code. Any change to user-facing app behavior, controls, game rules, scoring, calibration, camera feedback, or minigames should update the relevant spec in the same change.
- Specs in `docs/spec/` should describe observable behavior and product rules. Do not include implementation details such as frameworks, rendering libraries, detector libraries, build tools, or internal module names.
- Tests live next to source files as `*.test.ts` or `*.test.tsx`.

## Verification

For behavior changes, run at least:

- `pnpm test`
- `pnpm build`

For UI/gameplay changes, also start the app with `pnpm start` and verify the camera preview, markers, and game scene manually.
