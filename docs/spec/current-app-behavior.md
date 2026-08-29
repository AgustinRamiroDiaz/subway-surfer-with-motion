# Current App Behavior

## Purpose

Webcam Motion Games is a camera-controlled game collection. Players use body or hand movement in front of a camera to control avatars and avoid or match incoming targets.

## Main Screen

The main screen contains:

- A game stage with the selected game mode.
- A camera feedback overlay aligned to the game stage.
- A control panel for starting, pausing, selecting modes, and adjusting camera and tracking preferences.
- A game status area and game statistics.

The app supports English and Spanish interface text. Spanish is the default language when no saved preference exists.

## Game Modes

The game mode selector offers:

- Sideways run.
- Jump and duck.
- Hand Rhythm.

Changing game mode while a run is active pauses the run. Each mode can use its own camera-preview and detection-overlay visibility preference.

## Run States

The game can be in one of three states:

- Ready: the run is not active and can be started.
- Running: the camera and tracking are active and the selected game mode advances.
- Paused: the run has been stopped after previously running.

The primary action enables the camera when it is off, then starts the run once the camera can be used. The pause action is only available while the game is running.

Every game mode plays music. Music-synchronized gameplay begins after a four-beat audible count-in. Jump and Duck performs its required calibration before the first count-in; Hand Rhythm performs its hand-readiness check before the first count-in. Pausing preserves the song position, and resuming uses another count-in before music and obstacles continue.

Stopping the camera clears current detection state and returns the game to ready.

## Camera Feedback

The camera feedback area shows the selected camera view when enabled. If the camera is off, the feedback area shows an empty camera state.

The complete displayed camera view fits inside the game stage without changing its aspect ratio. The view expands until its width or height reaches the corresponding stage boundary, whichever happens first. Any remaining space outside the fitted camera view stays outside the camera-controlled area.

Camera mirroring is enabled by default. Mirroring affects the displayed camera view and keeps player left/right control aligned with what the player sees.

Players can independently toggle:

- The camera preview for the selected game mode.
- The detection overlay for the selected game mode.

The detection overlay can show player sections, player markers, body or hand detection marks, and mode-specific guides.

## Player Assignment

The game supports one to four configured players, with two players as the default.

For body-controlled modes:

- Detected players are assigned from left to right in the displayed camera view.
- If fewer players are detected than configured, missing players use evenly spaced default positions.
- When tracking identity is available, player assignment persists briefly through temporary detection loss.

For hand-controlled mode:

- The camera view is divided into one section per configured player.
- Each section can be assigned one detected hand.
- The highest-confidence hand in a section controls that player for the current frame.

## Controls And Preferences

The control panel exposes:

- Camera selection.
- Camera mirroring.
- Camera preview visibility.
- Detection overlay visibility.
- Player count.
- Detection confidence threshold.
- Game render rate from 15 to 165 frames per second, defaulting to 60.
- Hand Rhythm grid size when Hand Rhythm is selected.
- Advanced tracking options.

Preferences are saved locally and restored on the next visit when possible. Invalid or unsupported saved values fall back to defaults.

Changing the game render rate takes effect immediately without restarting the detector. It limits visual frame submission only; camera detection and game simulation continue on their own schedules.

Changing tracking configuration resets the active detector state and returns the game to ready.

## Status And Diagnostics

The app shows:

- Camera readiness.
- Current tracking status.
- Current tracking configuration label.
- Last processing time when available.
- Detection errors when they occur.
- Detection diagnostics, including detected people or hands and timing details when available.

Camera access errors are surfaced as readable status messages, including denied permission, blocked camera, unsupported browser camera access, and phone camera access requirements.

## Game HUD And Stats

The game stage shows:

- The selected mode title.
- A status label.
- Total dodged count.
- Total hit count.
- Per-player hit counts.

Raw normalized player-position percentages are not shown in the game HUD.
