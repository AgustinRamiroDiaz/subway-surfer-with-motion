import { PLAYER_BASE_Y, PLAYER_Z, TRACK_MAX_X, TRACK_MIN_X } from '../../gameConstants';
import {
  GESTURE_TO_EMOJI,
  getHandRhythmPlayerMotion,
  type HandRhythmGridSize,
} from '../../levels/handRhythmLevel';
import { handRhythmPlayerWidth } from '../../levels/handRhythmLayout';
import {
  updatePlayerGestureEmoji,
  updatePlayerGestureEmojiPosition,
  updatePlayerGestureEmojiSize,
} from '../../playerAvatar';
import { projectWorldPoint } from '../../shared/worldProjection';
import { playerTrackX } from '../../trackLayout';
import { createHandRhythmWorld } from '../../trackWorld';
import type { HandRhythmCameraOverlayOptions } from '../../handRhythmCameraOverlay';
import {
  createHandRhythmTargetSystem,
  setHandRhythmTargetFeedback,
  type HandRhythmTarget,
} from './handRhythmTargets';
import {
  HAND_RHYTHM_CAMERA_Z,
  type HandRhythmRenderer,
  type HandRhythmVisualState,
} from './handRhythmRendererTypes';

const HAND_RHYTHM_CAMERA = {
  positionY: 2.45,
  positionZ: HAND_RHYTHM_CAMERA_Z,
  targetZ: 0,
} as const;

export function createThreeHandRhythmRenderer(
  mount: HTMLDivElement,
  playerCount: number,
  gridSize: HandRhythmGridSize,
  showFloor: boolean,
  cameraOverlayOptions: HandRhythmCameraOverlayOptions
): HandRhythmRenderer {
  const world = createHandRhythmWorld(
    mount,
    playerCount,
    HAND_RHYTHM_CAMERA,
    gridSize,
    showFloor,
    cameraOverlayOptions
  );
  world.renderer.domElement.dataset.renderer = 'three';
  const targetSystem = createHandRhythmTargetSystem(world.scene, playerCount, gridSize);
  const renderedTargets = new Map<number, { result: HandRhythmTarget['result']; target: HandRhythmTarget }>();

  const syncTargets = (state: HandRhythmVisualState): void => {
    const liveIds = new Set(state.targets.map((target) => target.id));
    renderedTargets.forEach((rendered, id) => {
      if (!liveIds.has(id)) {
        targetSystem.remove(rendered.target);
        renderedTargets.delete(id);
      }
    });

    state.targets.forEach((visualTarget) => {
      let rendered = renderedTargets.get(visualTarget.id);
      if (!rendered) {
        const target = targetSystem.spawn(visualTarget.note, visualTarget.targetPlayerIndex);
        rendered = { result: 'pending', target };
        renderedTargets.set(visualTarget.id, rendered);
      }
      rendered.target.root.position.z = visualTarget.z;
      if (visualTarget.result !== rendered.result && visualTarget.result !== 'pending') {
        setHandRhythmTargetFeedback(rendered.target, visualTarget.result === 'hit');
      }
      rendered.result = visualTarget.result;
      rendered.target.result = visualTarget.result;
    });
  };

  return {
    render: (state, deltaSeconds) => {
      const activeCells = state.hands.map((hands, playerIndex) => hands.map((hand) =>
        getHandRhythmPlayerMotion(hand, playerIndex, playerCount, gridSize).cell
      ));

      world.players.forEach((player, playerIndex) => {
        const hands = state.hands[playerIndex] ?? [];
        player.gestureSprites?.forEach((sprite, handIndex) => {
          sprite.visible = hands[handIndex] !== undefined;
        });
        player.fallback.visible = false;
        player.root.children.forEach((child) => {
          if (child.name.startsWith('pose-driven-player')) child.visible = false;
        });
        hands.slice(0, player.gestureSprites?.length ?? 1).forEach((hand, handIndex) => {
          const motion = getHandRhythmPlayerMotion(hand, playerIndex, playerCount, gridSize);
          updatePlayerGestureEmoji(
            player,
            GESTURE_TO_EMOJI[hand.gesture] ?? GESTURE_TO_EMOJI.None,
            handIndex
          );
          updatePlayerGestureEmojiPosition(
            player,
            motion.emojiWorldX,
            motion.emojiWorldY,
            deltaSeconds,
            handIndex
          );
          updatePlayerGestureEmojiSize(
            player,
            motion.emojiWorldWidth,
            motion.emojiWorldHeight,
            deltaSeconds,
            handIndex
          );
        });
      });

      world.updateHandRhythmGrid(activeCells);
      syncTargets(state);
      world.render();
    },
    resize: (width, height, videoAspectRatio) => {
      world.resize(width, height, videoAspectRatio);
      const corners = world.cameras.flatMap((camera, viewportIndex) => {
        const centerX = world.cameras.length === 1 ? 0 : playerTrackX(viewportIndex, playerCount);
        const viewWidth = world.cameras.length === 1
          ? TRACK_MAX_X - TRACK_MIN_X
          : handRhythmPlayerWidth(playerCount);
        const viewportCameraAspect = Math.max(0.1, videoAspectRatio) / world.cameras.length;
        const projectionHeight = viewWidth / viewportCameraAspect;
        const leftX = centerX - viewWidth / 2;
        const rightX = centerX + viewWidth / 2;
        return [
          projectWorldPoint(camera, leftX, PLAYER_BASE_Y, PLAYER_Z, viewportIndex, world.cameras.length),
          projectWorldPoint(camera, rightX, PLAYER_BASE_Y, PLAYER_Z, viewportIndex, world.cameras.length),
          projectWorldPoint(camera, leftX, PLAYER_BASE_Y + projectionHeight, PLAYER_Z, viewportIndex, world.cameras.length),
          projectWorldPoint(camera, rightX, PLAYER_BASE_Y + projectionHeight, PLAYER_Z, viewportIndex, world.cameras.length),
        ];
      });
      return {
        left: Math.min(...corners.map((corner) => corner.x)),
        right: Math.max(...corners.map((corner) => corner.x)),
        top: Math.min(...corners.map((corner) => corner.y)),
        bottom: Math.max(...corners.map((corner) => corner.y)),
      };
    },
    dispose: () => {
      renderedTargets.clear();
      targetSystem.dispose();
      world.dispose();
    },
  };
}
