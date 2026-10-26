import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../../public/js/rules.js';
import { EXERCISE_GUIDES } from '../../public/js/guide.js';

test('every exercise has a complete visual form guide with both variants', () => {
  for (const [key, ex] of Object.entries(EXERCISES)) {
    const g = EXERCISE_GUIDES[key];
    assert.ok(g, `missing guide for exercise ${key}`);
    assert.ok(g.camera, `missing camera setup for ${key}`);
    assert.ok(g.camera.view, `missing camera view for ${key}`);
    assert.ok(g.camera.placement, `missing camera placement for ${key}`);

    assert.ok(g.standard, `missing standard variant guide for ${key}`);
    assert.ok(g.standard.name, `missing standard name for ${key}`);
    assert.ok(g.standard.target, `missing standard target for ${key}`);
    assert.ok(g.standard.whatCounts.length >= 2, `standard whatCounts too short for ${key}`);
    assert.ok(g.standard.rejections.length >= 1, `standard rejections too short for ${key}`);

    assert.ok(g.lowImpact, `missing lowImpact variant guide for ${key}`);
    assert.ok(g.lowImpact.name, `missing lowImpact name for ${key}`);
    assert.ok(g.lowImpact.target, `missing lowImpact target for ${key}`);
    assert.ok(g.lowImpact.whatCounts.length >= 2, `lowImpact whatCounts too short for ${key}`);
    assert.ok(g.lowImpact.rejections.length >= 1, `lowImpact rejections too short for ${key}`);
  }
});
