// MediaPipe Pose Landmarker, on-device. All files are self-hosted under
// /vendor and /models: the camera picture is processed in this tab and never
// sent anywhere (no third-party requests at all).
export const MP_VERSION = '1.1.0'; // must match @mediapipe/tasks-vision in package.json (npm run setup checks)
const BUNDLE = `/vendor/mediapipe-${MP_VERSION}/vision_bundle.mjs`;
const WASM = `/vendor/mediapipe-${MP_VERSION}/wasm`;
const MODEL = '/models/pose_landmarker_lite.task';

let cached = null;

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 5_800_000;
  if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(Math.min(0.99, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// MediaPipe 1.x has a built-in usage logger that POSTs task name and timing
// stats (never images) to odml.pa.googleapis.com every 60 s, with no public
// opt-out. Repdle promises no third-party requests: the CSP in _headers blocks
// it, and this stops the attempts. If a future version renames its internals,
// nothing breaks — the CSP still blocks the request.
function silenceTelemetry(task) {
  for (const a of Object.values(task)) {
    if (!a || typeof a !== 'object') continue;
    for (const b of Object.values(a)) {
      if (b && typeof b.flush === 'function' && typeof b.close === 'function' && Array.isArray(b.i) && typeof b.l === 'string') {
        b.error = new Error('usage logging disabled by Repdle');
        b.close(); // flush() sees the error and sends nothing; the 60 s timer is cleared
      }
    }
  }
}

// Returns { landmarker, delegate }. Tries the GPU first, then the CPU.
export async function loadPose(onProgress) {
  if (cached) return cached;
  const [{ FilesetResolver, PoseLandmarker }, model] = await Promise.all([
    import(BUNDLE),
    fetchWithProgress(MODEL, onProgress),
  ]);
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  let lastErr;
  const delegates = new URLSearchParams(location.search).get('cpu') === '1' ? ['CPU'] : ['GPU', 'CPU'];
  for (const delegate of delegates) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      onProgress?.(1);
      silenceTelemetry(landmarker);
      cached = { landmarker, delegate };
      return cached;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('pose model failed to start');
}

export async function openCamera(video, facingMode = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('This browser has no camera access (needs HTTPS).');
    e.name = 'NotSupportedError';
    throw e;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// Skeleton overlay (drawn in video pixel space; CSS mirrors it with the video).
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];

export function drawSkeleton(ctx, lm, w, h, color = '#34d399') {
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  ctx.lineWidth = Math.max(3, w / 160);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = '#fff';
  for (const [a, b] of BONES) {
    const p = lm[a], q = lm[b];
    if ((p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
    ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const p = lm[i];
    if ((p.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(3, w / 140), 0, Math.PI * 2);
    ctx.fill();
  }
}
