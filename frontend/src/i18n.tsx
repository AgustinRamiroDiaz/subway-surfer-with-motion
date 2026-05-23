import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

export const LANGUAGES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]['id'];

const LANGUAGE_STORAGE_KEY = 'motion-runner:language:v1';
const DEFAULT_LANGUAGE: LanguageId = 'es';

const translations = {
  es: {
    'app.workspace': 'Área de juego con movimiento',
    'app.mainGame': 'Juego principal',
    'app.detectionControls': 'Controles de detección',
    'app.enableCamera': 'Activar cámara',
    'app.startRun': 'Iniciar carrera',
    'app.loadingModel': 'Cargando modelo',
    'language.label': 'Idioma',
    'language.help': 'Elige el idioma de la interfaz.',
    'camera.feedback': 'Vista de cámara',
    'camera.title': 'Cámara',
    'camera.off': 'Cámara apagada',
    'camera.front': 'Cámara frontal',
    'camera.back': 'Cámara trasera',
    'camera.selected': 'Cámara seleccionada',
    'camera.switchError': 'No se pudo cambiar la cámara',
    'camera.httpsRequired': 'El acceso a la cámara requiere HTTPS en teléfonos. Usa localhost en este dispositivo o sirve la app por HTTPS.',
    'camera.unsupported': 'Este navegador no expone acceso a la cámara mediante navigator.mediaDevices.',
    'camera.metadataError': 'No se pudieron leer los metadatos de cámara para el multiplicador de cámara de desarrollo.',
    'camera.canvasStreamError': 'Este navegador no puede crear una transmisión de cámara respaldada por canvas.',
    'game.heading': 'Juego principal',
    'game.title': 'Corredor con movimiento',
    'game.sidewaysTitle': 'Carrera lateral',
    'game.jumpDuckTitle': 'Saltos y agaches',
    'game.modeSelector': 'Selección de juego',
    'game.sidewaysMode': 'Carrera lateral',
    'game.jumpDuckMode': 'Saltar y agacharse',
    'game.status': 'Estado del juego',
    'game.controls': 'Controles del juego',
    'game.ready': 'Listo',
    'game.paused': 'Pausado',
    'game.running': 'Corriendo',
    'game.hit': 'Golpe',
    'game.playerHit': 'J{player} golpeado',
    'game.calibrationRequired': 'Calibración requerida',
    'game.calibrating': 'Calibrando {progress}%',
    'game.pause': 'Pausar',
    'game.stats': 'Estadísticas del juego',
    'game.dodged': 'Esquivados',
    'game.hits': 'Golpes',
    'game.playerHits': 'Golpes J{player}',
    'status.runState': 'Estado',
    'status.cameraIdle': 'Cámara inactiva',
    'status.cameraReady': 'Cámara lista',
    'status.modelNotLoaded': 'Modelo sin cargar',
    'status.scanning': 'Escaneando',
    'status.detectedPeople': '{count} persona detectada',
    'status.detectedPeople_plural': '{count} personas detectadas',
    'status.detectionFailed': 'La detección falló',
    'status.detectionStopped': 'Detección detenida',
    'status.loadingModel': 'Cargando modelo',
    'status.requestingCamera': 'Solicitando cámara',
    'status.cameraDenied': 'Se denegó el permiso de cámara',
    'status.cameraBlocked': 'Cámara bloqueada',
    'status.detectorLoadFailed': 'No se pudo cargar el detector',
    'status.detectorUnavailable': 'Detector no disponible',
    'status.modelReady': 'Modelo listo en {runtime}',
    'status.modelReadyFallback': 'Modelo listo en {runtime}. Fallback de WebGPU: {reason}',
    'status.loadingMediaPipe': 'Cargando runtime de MediaPipe',
    'status.loadingWasm': 'Cargando modelo en WASM',
    'status.loadingWebGpu': 'Cargando modelo en WebGPU',
    'status.pythonConnected': 'Canal de datos Python WebRTC conectado',
    'status.inferenceMs': '{ms} ms de inferencia',
    'controls.camera': 'Cámara',
    'controls.cameraHelp': 'Elige la cámara frontal del teléfono o una cámara específica cuando el navegador comparta los nombres de dispositivos.',
    'controls.mirrorCamera': 'Espejar cámara',
    'controls.mirrorCameraHelp': 'Hace que la vista previa coincida con tu imagen de espejo. La asignación de jugadores mantiene izquierda/derecha corregidas.',
    'controls.cameraMultiplier': 'Multiplicador de cámara',
    'controls.cameraMultiplierHelp': 'Modo de prueba para desarrollo que duplica el cuadro de cámara lado a lado antes de enviarlo al detector. Se reinicia automáticamente si la cámara está activa.',
    'controls.players': 'Jugadores',
    'controls.playersHelp': 'Define cuántas personas debe asignar el overlay a carriles. El detector puede ver más personas, pero el juego solo sigue esta cantidad.',
    'controls.confidence': 'Confianza',
    'controls.confidenceHelp': 'Filtra detecciones inciertas. Súbela para reducir vibración y falsos positivos; bájala cuando los cuerpos estén parcialmente visibles.',
    'controls.advancedTracking': 'Seguimiento avanzado',
    'controls.tracker': 'Detector',
    'controls.trackerHelp': 'Elige dónde corre la detección de pose: MediaPipe en el navegador, YOLO en el navegador o el tracker Python WebRTC local.',
    'controls.signalingUrl': 'URL de señalización',
    'controls.signalingUrlHelp': 'WebSocket solo intercambia oferta, respuesta y candidatos ICE de WebRTC. Los cuadros de cámara y detecciones viajan por WebRTC.',
    'controls.model': 'Modelo',
    'controls.yoloModelHelp': 'Los modelos de pose devuelven puntos del cuerpo; los de detección devuelven cajas de personas. Los modelos pequeños responden más rápido, los grandes pueden ser más estables.',
    'controls.runtime': 'Runtime',
    'controls.runtimeHelp': 'WebGPU usa la GPU del navegador cuando está disponible. WASM mantiene todo en CPU y sirve para revisar compatibilidad.',
    'controls.quantization': 'Cuantización',
    'controls.quantizationHelp': 'Controla la precisión de pesos del modelo. Los archivos de menos bits descargan más rápido y usan menos memoria; FP16 suele preservar más detalle en WebGPU.',
    'controls.mediaPipeModelHelp': 'Lite es el más rápido, Full es equilibrado y Heavy prioriza precisión cuando tu máquina tiene margen.',
    'controls.delegate': 'Delegado',
    'controls.delegateHelp': 'GPU es la ruta rápida preferida. CPU es el fallback cuando el delegado GPU no está disponible o es inestable.',
    'controls.about': 'Acerca de {label}',
    'docs.eyebrow': 'Documentación',
    'docs.entryText': 'Abre la vista de detalles del seguimiento para ver notas completas sobre propiedad del cliente y flujo de datos WebRTC.',
    'docs.link': 'Docs de seguimiento',
    'docs.aria': 'Documentación interna de seguimiento',
    'docs.title': 'Detalles del seguimiento',
    'docs.intro': 'Un mapa más profundo de cómo los cuadros de cámara, predicciones del modelo, dibujo del overlay y estado de jugadores se mantienen bajo control del cliente.',
    'docs.back': 'Volver a la app',
    'docs.client.eyebrow': 'Propiedad del cliente',
    'docs.client.title': 'El navegador es la fuente de verdad',
    'docs.client.body': 'El navegador posee el permiso de cámara, la vista previa en vivo, el canvas de overlay, la asignación de jugadores, el estado del juego y las preferencias guardadas. Cada detector devuelve la misma forma de predicción, así que cambiar de backend no entrega el resto de la experiencia.',
    'docs.local.eyebrow': 'Trackers locales',
    'docs.local.title': 'MediaPipe y YOLO usan un bucle nativo del navegador',
    'docs.local.body': 'Los detectores locales corren desde HTMLVideoElement.requestVideoFrameCallback(). La app espera un cuadro real de cámara, captura los píxeles más recientes, ejecuta inferencia, dibuja el overlay y programa el siguiente callback de video.',
    'docs.python.eyebrow': 'Python WebRTC',
    'docs.python.title': 'Seguimiento de alto rendimiento con servidor independiente',
    'docs.python.beforeLink': 'El frontend envía la pista de cámara a Python por WebRTC. Para usarlo, descarga el binario "pose-tracker-server" más reciente para tu plataforma desde ',
    'docs.python.link': 'GitHub Releases',
    'docs.python.afterLink': '. Ejecútalo con ',
    'docs.python.afterCode': ' y asegúrate de que la URL de señalización en la app coincida (predeterminado: ws://localhost:8765). Los resultados de detección vuelven por un canal de datos de baja latencia.',
    'docs.latency.eyebrow': 'Modelo de latencia',
    'docs.latency.title': 'Los cuadros frescos ganan a los cuadros en cola',
    'docs.latency.body': 'El backend conserva un único espacio para el cuadro más reciente. Cuando la inferencia está ocupada, los cuadros nuevos reemplazan a los pendientes obsoletos. Así, el siguiente resultado favorece el momento de cámara más fresco en vez de procesar entrada vieja lentamente.',
    'docs.privacy.eyebrow': 'Límite de privacidad',
    'docs.privacy.title': 'Tú eliges a dónde van los cuadros',
    'docs.privacy.body': 'Los trackers en navegador mantienen los cuadros de cámara dentro de la página. Python WebRTC envía cuadros solo al host de señalización que configures, pensado para tu propia máquina o LAN durante desarrollo local.',
    'timing.title': 'Tiempos por cuadro',
    'timing.breakdown': 'Desglose de tiempos por cuadro',
    'timing.capture': 'Captura',
    'timing.rawImage': 'Imagen cruda',
    'timing.preprocess': 'Preprocesado',
    'timing.model': 'Modelo',
    'timing.postprocess': 'Postprocesado',
    'timing.draw': 'Dibujo',
    'timing.total': 'Total',
    'people.title': 'Personas',
    'people.person': 'Persona {index}',
    'people.points': '{count} punto',
    'people.points_plural': '{count} puntos',
    'people.empty': 'No hay personas sobre el umbral.',
    'controls.stopCamera': 'Detener cámara',
    'backend.yolo.description': 'Detección de objetos y pose',
    'backend.mediapipe.description': 'Seguimiento de puntos de pose',
    'backend.python-webrtc.description': 'Seguimiento de pose remoto de baja latencia',
    'runtime.webgpu.description': 'Acelerado por GPU',
    'runtime.wasm.description': 'Fallback por CPU',
    'quantization.fp16.description': 'Media precisión WebGPU',
    'quantization.uint8.description': 'WASM cuantizado rápido',
    'quantization.int8.description': 'Cuantizado firmado de 8 bits',
    'quantization.q8.description': 'Cuantizado legado de 8 bits',
    'quantization.q4f16.description': '4 bits para WebGPU',
    'quantization.q4.description': '4 bits compacto',
    'quantization.bnb4.description': 'BitsAndBytes de 4 bits',
    'model.yolo26n.description': 'Detección nano',
    'model.yolo26s.description': 'Detección pequeña',
    'model.yolo26n-pose.description': 'Pose nano',
    'model.yolo26s-pose.description': 'Pose pequeña',
    'mediapipe.lite.description': 'Seguimiento de pose más rápido',
    'mediapipe.full.description': 'Seguimiento de pose equilibrado',
    'mediapipe.heavy.description': 'Máxima precisión',
    'delegate.gpu.description': 'Delegado acelerado',
    'delegate.cpu.description': 'Delegado de compatibilidad',
  },
  en: {
    'app.workspace': 'Motion game workspace',
    'app.mainGame': 'Main game',
    'app.detectionControls': 'Detection controls',
    'app.enableCamera': 'Enable camera',
    'app.startRun': 'Start run',
    'app.loadingModel': 'Loading model',
    'language.label': 'Language',
    'language.help': 'Choose the interface language.',
    'camera.feedback': 'Camera feedback',
    'camera.title': 'Camera',
    'camera.off': 'Camera off',
    'camera.front': 'Front camera',
    'camera.back': 'Back camera',
    'camera.selected': 'Selected camera',
    'camera.switchError': 'Unable to switch camera',
    'camera.httpsRequired': 'Camera access requires HTTPS on phones. Use localhost on this device or serve the app over HTTPS.',
    'camera.unsupported': 'This browser does not expose camera access through navigator.mediaDevices.',
    'camera.metadataError': 'Unable to read camera metadata for the developer camera multiplier.',
    'camera.canvasStreamError': 'This browser cannot create a canvas-backed camera stream.',
    'game.heading': 'Main game',
    'game.title': 'Motion runner',
    'game.sidewaysTitle': 'Sideways runner',
    'game.jumpDuckTitle': 'Jump and duck',
    'game.modeSelector': 'Game selection',
    'game.sidewaysMode': 'Sideways run',
    'game.jumpDuckMode': 'Jump and duck',
    'game.status': 'Game status',
    'game.controls': 'Game controls',
    'game.ready': 'Ready',
    'game.paused': 'Paused',
    'game.running': 'Running',
    'game.hit': 'Hit',
    'game.playerHit': 'P{player} hit',
    'game.calibrationRequired': 'Calibration required',
    'game.calibrating': 'Calibrating {progress}%',
    'game.pause': 'Pause',
    'game.stats': 'Game stats',
    'game.dodged': 'Dodged',
    'game.hits': 'Hits',
    'game.playerHits': 'P{player} hits',
    'status.runState': 'Run state',
    'status.cameraIdle': 'Camera idle',
    'status.cameraReady': 'Camera ready',
    'status.modelNotLoaded': 'Model not loaded',
    'status.scanning': 'Scanning',
    'status.detectedPeople': '{count} person detected',
    'status.detectedPeople_plural': '{count} people detected',
    'status.detectionFailed': 'Detection failed',
    'status.detectionStopped': 'Detection stopped',
    'status.loadingModel': 'Loading model',
    'status.requestingCamera': 'Requesting camera',
    'status.cameraDenied': 'Camera permission was denied',
    'status.cameraBlocked': 'Camera blocked',
    'status.detectorLoadFailed': 'Unable to load detector',
    'status.detectorUnavailable': 'Detector unavailable',
    'status.modelReady': 'Model ready on {runtime}',
    'status.modelReadyFallback': 'Model ready on {runtime}. WebGPU fallback: {reason}',
    'status.loadingMediaPipe': 'Loading MediaPipe runtime',
    'status.loadingWasm': 'Loading model on WASM',
    'status.loadingWebGpu': 'Loading model on WebGPU',
    'status.pythonConnected': 'Python WebRTC data channel connected',
    'status.inferenceMs': '{ms} ms inference',
    'controls.camera': 'Camera',
    'controls.cameraHelp': 'Choose the phone-facing camera or a specific camera once the browser has shared device names.',
    'controls.mirrorCamera': 'Mirror camera',
    'controls.mirrorCameraHelp': 'Matches the preview to your mirror image. Player assignment still uses corrected left/right positions.',
    'controls.cameraMultiplier': 'Camera multiplier',
    'controls.cameraMultiplierHelp': 'Developer test mode that duplicates the camera frame side by side before the detector receives it. Restart is automatic while the camera is active.',
    'controls.players': 'Players',
    'controls.playersHelp': 'Sets how many people the overlay should assign to lanes. The detector may see more people, but gameplay only follows this count.',
    'controls.confidence': 'Confidence',
    'controls.confidenceHelp': 'Filters uncertain detections. Raise it to reduce jitter and false positives; lower it when bodies are partially visible.',
    'controls.advancedTracking': 'Advanced tracking',
    'controls.tracker': 'Tracker',
    'controls.trackerHelp': 'Choose where pose detection runs: in-browser MediaPipe, in-browser YOLO, or the local Python WebRTC tracker.',
    'controls.signalingUrl': 'Signaling URL',
    'controls.signalingUrlHelp': 'WebSocket is used only to exchange the WebRTC offer, answer, and ICE candidates. Camera frames and detections move over WebRTC.',
    'controls.model': 'Model',
    'controls.yoloModelHelp': 'Pose models return body keypoints; detection models return person boxes. Smaller models react faster, larger ones can be steadier.',
    'controls.runtime': 'Runtime',
    'controls.runtimeHelp': 'WebGPU uses the browser GPU path when available. WASM keeps everything on CPU and is useful for compatibility checks.',
    'controls.quantization': 'Quantization',
    'controls.quantizationHelp': 'Controls model weight precision. Lower-bit files download faster and use less memory; FP16 usually preserves more detail on WebGPU.',
    'controls.mediaPipeModelHelp': 'Lite is quickest, Full is balanced, and Heavy favors accuracy when your machine has enough headroom.',
    'controls.delegate': 'Delegate',
    'controls.delegateHelp': 'GPU is the preferred fast path. CPU is the fallback when the GPU delegate is unavailable or unstable.',
    'controls.about': 'About {label}',
    'docs.eyebrow': 'Documentation',
    'docs.entryText': 'Open the tracking internals view for the full client-side ownership and WebRTC data-flow notes.',
    'docs.link': 'Tracking docs',
    'docs.aria': 'Tracking internals documentation',
    'docs.title': 'Tracking internals',
    'docs.intro': 'A deeper map of how camera frames, model predictions, overlay drawing, and player state stay under client control.',
    'docs.back': 'Back to app',
    'docs.client.eyebrow': 'Client ownership',
    'docs.client.title': 'The browser is the source of truth',
    'docs.client.body': 'The browser owns the camera permission, live preview, overlay canvas, player assignment, game state, and stored preferences. Every tracker returns the same prediction shape, so changing backends does not hand away the rest of the experience.',
    'docs.local.eyebrow': 'Local trackers',
    'docs.local.title': 'MediaPipe and YOLO use a browser-native pull loop',
    'docs.local.body': 'Local detectors run from HTMLVideoElement.requestVideoFrameCallback(). The app waits for an actual camera frame, snapshots the newest pixels, runs inference, draws the overlay, and schedules the next video-frame callback.',
    'docs.python.eyebrow': 'Python WebRTC',
    'docs.python.title': 'High-performance tracking with standalone server',
    'docs.python.beforeLink': 'The frontend sends the camera media track to Python over WebRTC. To use this, download the latest "pose-tracker-server" binary for your platform from ',
    'docs.python.link': 'GitHub Releases',
    'docs.python.afterLink': '. Run it with ',
    'docs.python.afterCode': ' and ensure the signaling URL in the app matches (default: ws://localhost:8765). Detection results return over a low-latency data channel.',
    'docs.latency.eyebrow': 'Latency model',
    'docs.latency.title': 'Fresh frames beat queued frames',
    'docs.latency.body': 'The backend keeps one latest-frame slot. When inference is busy, newer frames replace stale pending frames. That means the next result is biased toward the freshest camera moment instead of slowly working through old input.',
    'docs.privacy.eyebrow': 'Privacy boundary',
    'docs.privacy.title': 'You choose where frames go',
    'docs.privacy.body': 'In-browser trackers keep camera frames inside the page. Python WebRTC sends frames only to the signaling host you configure, which is intended for your own machine or LAN during local development.',
    'timing.title': 'Frame timing',
    'timing.breakdown': 'Frame timing breakdown',
    'timing.capture': 'Capture',
    'timing.rawImage': 'Raw image',
    'timing.preprocess': 'Preprocess',
    'timing.model': 'Model',
    'timing.postprocess': 'Postprocess',
    'timing.draw': 'Draw',
    'timing.total': 'Total',
    'people.title': 'People',
    'people.person': 'Person {index}',
    'people.points': '{count} point',
    'people.points_plural': '{count} points',
    'people.empty': 'No people above threshold.',
    'controls.stopCamera': 'Stop camera',
    'backend.yolo.description': 'Object and pose detection',
    'backend.mediapipe.description': 'Pose landmark tracking',
    'backend.python-webrtc.description': 'Remote low-latency pose tracking',
    'runtime.webgpu.description': 'GPU accelerated',
    'runtime.wasm.description': 'CPU fallback',
    'quantization.fp16.description': 'WebGPU half precision',
    'quantization.uint8.description': 'Fast WASM quantized',
    'quantization.int8.description': 'Signed 8-bit quantized',
    'quantization.q8.description': 'Legacy 8-bit quantized',
    'quantization.q4f16.description': 'WebGPU-oriented 4-bit',
    'quantization.q4.description': 'Compact 4-bit',
    'quantization.bnb4.description': 'BitsAndBytes 4-bit',
    'model.yolo26n.description': 'Nano detection',
    'model.yolo26s.description': 'Small detection',
    'model.yolo26n-pose.description': 'Nano pose',
    'model.yolo26s-pose.description': 'Small pose',
    'mediapipe.lite.description': 'Fastest pose tracking',
    'mediapipe.full.description': 'Balanced pose tracking',
    'mediapipe.heavy.description': 'Highest accuracy',
    'delegate.gpu.description': 'Accelerated delegate',
    'delegate.cpu.description': 'Compatibility delegate',
  },
} as const;

export type TranslationKey = keyof typeof translations.es;
type TranslationValues = Record<string, string | number>;

type I18nContextValue = {
  language: LanguageId;
  setLanguage: (language: LanguageId) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  tn: (key: TranslationKey, count: number, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLanguage(): LanguageId {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return LANGUAGES.some((language) => language.id === stored) ? stored as LanguageId : DEFAULT_LANGUAGE;
}

function interpolate(message: string, values: TranslationValues = {}): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    message
  );
}

export function I18nProvider({ children }: { children: ReactNode }): ReactElement {
  const [language, setLanguage] = useState<LanguageId>(readStoredLanguage);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key: TranslationKey, values?: TranslationValues) => {
    return interpolate(translations[language][key], values);
  }, [language]);

  const tn = useCallback((key: TranslationKey, count: number, values?: TranslationValues) => {
    const pluralKey = `${key}_plural` as TranslationKey;
    const selectedKey = count === 1 || !(pluralKey in translations[language]) ? key : pluralKey;
    return interpolate(translations[language][selectedKey], { count, ...values });
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t, tn }), [language, t, tn]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}

export function translateDetectorStatus(message: string, t: I18nContextValue['t']): string {
  const statusMap: Record<string, TranslationKey> = {
    'Loading MediaPipe runtime': 'status.loadingMediaPipe',
    'Loading model on WASM': 'status.loadingWasm',
    'Loading model on WebGPU': 'status.loadingWebGpu',
    'Python WebRTC data channel connected': 'status.pythonConnected',
  };

  return statusMap[message] ? t(statusMap[message]) : message;
}
