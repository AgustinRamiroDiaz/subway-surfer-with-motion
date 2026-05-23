import {
  type Detector,
  type DetectorLoadOptions,
  type DetectorLoadResult,
  type DetectorResult,
} from './aiDetector';

const DEFAULT_POSE_TRACKER_SIGNALING_URL = 'ws://127.0.0.1:8765';
const DETECTOR_CONNECT_TIMEOUT_MS = 8_000;

type SignalingMessage =
  | {
      type: 'answer';
      sdp: string;
    }
  | {
      type: 'ice-candidate';
      candidate: RTCIceCandidateInit | null;
    }
  | {
      type: 'error';
      message: string;
    };

type DetectorDataChannelMessage =
  | {
      type: 'result';
      sequence: number;
      result: DetectorResult;
    }
  | {
      type: 'error';
      message: string;
    };

export type PythonWebRtcDetectorLoadResult = DetectorLoadResult & {
  dispose: () => void;
  mode: 'stream';
};

function getPoseTrackerSignalingUrl(): string {
  return import.meta.env.VITE_POSE_TRACKER_SIGNALING_URL ?? DEFAULT_POSE_TRACKER_SIGNALING_URL;
}

function waitForIceGatheringComplete(peerConnection: RTCPeerConnection): Promise<void> {
  if (peerConnection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onStateChange = (): void => {
      if (peerConnection.iceGatheringState === 'complete') {
        peerConnection.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }
    };
    peerConnection.addEventListener('icegatheringstatechange', onStateChange);
  });
}

function waitForSocketOpen(socket: WebSocket, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Could not connect to Python pose tracker signaling at ${url}`));
      socket.close();
    }, DETECTOR_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };

    socket.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`Python pose tracker signaling failed at ${url}`));
    };
  });
}

async function waitForAnswer(socket: WebSocket): Promise<RTCSessionDescriptionInit> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Python pose tracker signaling timed out waiting for an answer'));
      socket.close();
    }, DETECTOR_CONNECT_TIMEOUT_MS);

    socket.onmessage = (event: MessageEvent<string>) => {
      let message: SignalingMessage;
      try {
        message = JSON.parse(event.data) as SignalingMessage;
      } catch {
        window.clearTimeout(timeoutId);
        reject(new Error('Python pose tracker signaling returned invalid JSON'));
        return;
      }

      if (message.type === 'error') {
        window.clearTimeout(timeoutId);
        reject(new Error(message.message));
        return;
      }

      if (message.type === 'answer') {
        window.clearTimeout(timeoutId);
        resolve({ type: 'answer', sdp: message.sdp });
      }
    };
  });
}

export async function loadPythonWebRtcDetector(
  options: DetectorLoadOptions
): Promise<PythonWebRtcDetectorLoadResult> {
  if (!options.stream) {
    throw new Error('Python WebRTC detector requires an active camera stream');
  }

  const url = getPoseTrackerSignalingUrl();
  options.onStatusChange?.({ message: `Connecting to ${url}` });

  const socket = new WebSocket(url);
  const peerConnection = new RTCPeerConnection({ iceServers: [] });
  const dataChannel = peerConnection.createDataChannel('detections', {
    ordered: false,
    maxRetransmits: 0,
  });
  let disposed = false;

  const dispose = (): void => {
    disposed = true;
    dataChannel.close();
    peerConnection.close();
    socket.close();
  };

  dataChannel.onopen = () => {
    options.onStatusChange?.({ message: 'Python WebRTC data channel connected' });
  };

  dataChannel.onmessage = (event: MessageEvent<string>) => {
    let message: DetectorDataChannelMessage;
    try {
      message = JSON.parse(event.data) as DetectorDataChannelMessage;
    } catch {
      options.onError?.(new Error('Python WebRTC detector returned invalid JSON'));
      return;
    }

    if (message.type === 'error') {
      options.onError?.(new Error(message.message));
      return;
    }

    options.onResult?.(message.result);
  };

  dataChannel.onerror = () => {
    options.onError?.(new Error('Python WebRTC data channel failed'));
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
      options.onError?.(new Error(`Python WebRTC connection ${peerConnection.connectionState}`));
    }
  };

  socket.onclose = () => {
    if (!disposed && peerConnection.connectionState !== 'connected') {
      options.onError?.(new Error('Python pose tracker signaling disconnected'));
    }
  };

  try {
    options.stream.getVideoTracks().forEach((track) => {
      peerConnection.addTrack(track, options.stream as MediaStream);
    });

    await waitForSocketOpen(socket, url);
    const answerPromise = waitForAnswer(socket);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection);

    socket.send(
      JSON.stringify({
        type: 'offer',
        sdp: peerConnection.localDescription?.sdp ?? offer.sdp,
        config: {
          threshold: options.threshold ?? 0.45,
          maxPoses: options.playerCount,
        },
      })
    );

    await peerConnection.setRemoteDescription(await answerPromise);
    options.onStatusChange?.({ message: `Connected to ${url}` });

    const detector: Detector = () =>
      Promise.reject(new Error('Python WebRTC detector streams results instead of handling frame requests'));

    return {
      detector,
      runtime: 'Python WebRTC',
      mode: 'stream',
      dispose,
    };
  } catch (cause: unknown) {
    dispose();
    throw cause;
  }
}
