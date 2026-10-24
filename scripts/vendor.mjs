// Copies MediaPipe's browser bundle + wasm into public/vendor, downloads the
// Pose Landmarker (lite) model into public/models and creates .dev.vars. Everything is then served
// from your own domain: no CDN, no third-party request when someone plays.
import { mkdir, copyFile, stat, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/tasks-vision');
const { version } = JSON.parse(await readFile(join(src, 'package.json'), 'utf8'));
const poseJs = await readFile(join(root, 'public/js/pose.js'), 'utf8');
if (!poseJs.includes(`MP_VERSION = '${version}'`)) throw new Error(`public/js/pose.js MP_VERSION must be '${version}' (the installed @mediapipe/tasks-vision)`);
// Versioned folder, so the files can be cached as immutable.
await rm(join(root, 'public/vendor'), { recursive: true, force: true });
const out = join(root, `public/vendor/mediapipe-${version}`);
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const MODEL = join(root, 'public/models/pose_landmarker_lite.task');

const files = [
  'vision_bundle.mjs',
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm',
];
for (const f of files) {
  await mkdir(dirname(join(out, f)), { recursive: true });
  await copyFile(join(src, f), join(out, f));
}
console.log(`copied ${files.length} MediaPipe ${version} files → public/vendor/mediapipe-${version}`);

const have = await stat(MODEL).catch(() => null);
if (have && have.size > 1_000_000) {
  console.log(`model already present (${(have.size / 1e6).toFixed(1)} MB)`);
} else {
  await mkdir(dirname(MODEL), { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(MODEL, buf);
  console.log(`downloaded pose_landmarker_lite.task (${(buf.length / 1e6).toFixed(1)} MB)`);
}

// Local dev flags for `wrangler dev` (fake clock/country for tests, /api/dev/cron).
// .dev.vars is never deployed; production must not have DEV set.
const devVars = join(root, '.dev.vars');
if (!(await stat(devVars).catch(() => null))) {
  await writeFile(devVars, 'DEV=1\n');
  console.log('wrote .dev.vars (DEV=1, local only)');
}
