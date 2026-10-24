// Motion sensor → real "up" in the camera picture (public/js/gravity.js),
// with the browser globals stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const win = new EventTarget();
globalThis.window = win;
globalThis.screen = { orientation: { angle: 0 } };
const { startGravity, pictureUp } = await import('../../public/js/gravity.js');
startGravity();

function feel(x, y, z = 0) {
  // Android/spec sign: accelerationIncludingGravity points away from the ground
  for (let i = 0; i < 40; i++) {
    const e = new Event('devicemotion');
    e.accelerationIncludingGravity = { x, y, z };
    win.dispatchEvent(e);
  }
}
const round = (v) => v && v.map((n) => Math.round(n * 100) / 100 + 0);

test('phone upright (portrait): up is the top of the picture', () => {
  feel(0, 9.81);
  assert.deepEqual(round(pictureUp()), [0, -1]);
  assert.deepEqual(round(pictureUp({ mirrored: true })), [0, -1]);
});

test('phone on its side with rotation lock: up is a side of the picture', () => {
  feel(9.81, 0); // the phone's right edge points to the sky
  assert.deepEqual(round(pictureUp()), [1, 0]); // back camera
  assert.deepEqual(round(pictureUp({ mirrored: true })), [-1, 0]); // front camera frames are left-right swapped
});

test('screen rotated to landscape (no lock): the browser turns the picture, up is the top again', () => {
  globalThis.screen.orientation.angle = 90;
  feel(9.81, 0);
  assert.deepEqual(round(pictureUp()), [0, -1]);
  globalThis.screen.orientation.angle = 0;
});

test('phone lying flat: up unknown, the analyzers fall back to the picture', () => {
  feel(0.5, 0.5, 9.8);
  assert.equal(pictureUp(), null);
});
