import type { PersonDetection } from '../pose-detection/detectionSchema';
import {
  getDefaultPlayerPositions,
  getPersonPosition,
  getPlayerPositions,
} from './playerPositions';

export const DEFAULT_TRACK_TIMEOUT_MS = 2_000;

export type PlayerTrackingState = {
  trackIds: Array<number | null>;
  lastSeenByTrackId: Map<number, number>;
};

export type PlayerTrackingResult = {
  positions: number[];
  detections: Array<PersonDetection | null>;
  state: PlayerTrackingState;
};

export function createPlayerTrackingState(playerCount: number): PlayerTrackingState {
  return {
    trackIds: Array.from({ length: playerCount }, () => null),
    lastSeenByTrackId: new Map(),
  };
}

type AssignPlayerDetectionsOptions = {
  detections: PersonDetection[];
  frameWidth: number;
  mirrored: boolean;
  playerCount: number;
  previousPositions: number[];
  previousState: PlayerTrackingState;
  nowMs: number;
  trackTimeoutMs?: number;
};

function displayedPosition(detection: PersonDetection, frameWidth: number, mirrored: boolean): number {
  const position = getPersonPosition(detection, frameWidth);
  return mirrored ? 1 - position : position;
}

export function assignPlayerDetections({
  detections,
  frameWidth,
  mirrored,
  playerCount,
  previousPositions,
  previousState,
  nowMs,
  trackTimeoutMs = DEFAULT_TRACK_TIMEOUT_MS,
}: AssignPlayerDetectionsOptions): PlayerTrackingResult {
  const fallbackPositions = getDefaultPlayerPositions(playerCount);
  const hasTrackingIds = detections.some((detection) => detection.id !== undefined);

  if (!hasTrackingIds) {
    const positions = getPlayerPositions(detections, frameWidth, mirrored, playerCount);
    const sortedByPosition = detections
      .slice(0, playerCount)
      .sort((left, right) => displayedPosition(left, frameWidth, mirrored) - displayedPosition(right, frameWidth, mirrored));

    return {
      positions,
      detections: positions.map((_, index) => sortedByPosition[index] ?? null),
      state: previousState,
    };
  }

  const trackIds = previousState.trackIds.length === playerCount
    ? [...previousState.trackIds]
    : Array.from({ length: playerCount }, () => null);
  const lastSeenByTrackId = new Map(previousState.lastSeenByTrackId);

  detections.forEach((detection) => {
    if (detection.id !== undefined) {
      lastSeenByTrackId.set(detection.id, nowMs);
    }
  });

  lastSeenByTrackId.forEach((lastSeen, trackId) => {
    if (nowMs - lastSeen <= trackTimeoutMs) {
      return;
    }

    lastSeenByTrackId.delete(trackId);
    const playerIndex = trackIds.indexOf(trackId);
    if (playerIndex !== -1) {
      trackIds[playerIndex] = null;
    }
  });

  const positions = fallbackPositions.map(
    (fallbackPosition, index) => previousPositions[index] ?? fallbackPosition
  );
  const playerDetections: Array<PersonDetection | null> = Array.from(
    { length: playerCount },
    () => null
  );
  const assigned = new Set<PersonDetection>();

  trackIds.forEach((trackedId, index) => {
    if (trackedId === null) {
      return;
    }

    const detection = detections.find((candidate) => candidate.id === trackedId);
    if (!detection) {
      return;
    }

    positions[index] = displayedPosition(detection, frameWidth, mirrored);
    playerDetections[index] = detection;
    assigned.add(detection);
  });

  const unassignedDetections = detections
    .filter((detection) => !assigned.has(detection))
    .sort((left, right) => displayedPosition(left, frameWidth, mirrored) - displayedPosition(right, frameWidth, mirrored));
  const emptySlots = trackIds
    .map((trackId, index) => (trackId === null ? index : -1))
    .filter((index) => index !== -1);

  unassignedDetections.slice(0, emptySlots.length).forEach((detection, index) => {
    const emptySlot = emptySlots[index];
    if (emptySlot === undefined) {
      return;
    }

    trackIds[emptySlot] = detection.id ?? null;
    positions[emptySlot] = displayedPosition(detection, frameWidth, mirrored);
    playerDetections[emptySlot] = detection;
  });

  return {
    positions,
    detections: playerDetections,
    state: { trackIds, lastSeenByTrackId },
  };
}
