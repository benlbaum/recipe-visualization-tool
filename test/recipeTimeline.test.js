import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getStepDescription, getStepDuration, getStepNames, layoutRecipe, MIN_STEP_WIDTH, PIXELS_PER_MINUTE } from '../src/recipeTimeline.js';

const step = (id, durationMinutes) => ({ id, type: 'step', data: { label: id, durationMinutes } });
const edge = (source, target) => ({ source, target });
const dish = { id: 'dish', type: 'finalDish', data: { label: 'Dinner' } };
const ingredient = { id: 'salt', type: 'ingredient', data: { label: 'Salt' } };

function timings(layout) {
  return Object.fromEntries(layout.filter(node => node.type === 'step').map(node =>
    [node.id, [node.data.startMinute, node.data.endMinute]]
  ));
}

test('step references distinguish repeated instructions at the same or different times', () => {
  const steps = ['pan', 'wok', 'finish'].map(id => ({ id, type: 'step', data: { label: 'Saute', durationMinutes: 2 } }));
  const nodes = layoutRecipe([ingredient, ...steps, dish], [edge('wok', 'finish')]);
  assert.deepEqual(Object.fromEntries(getStepNames(nodes)), {
    pan: 'Saute, 0–2 min (1 of 2)', wok: 'Saute, 0–2 min (2 of 2)', finish: 'Saute, 2–4 min',
  });
});

test('a fork starts both branches together and a join waits for the longer branch', () => {
  const nodes = [dish, step('serve', 1), step('sauce', 3), ingredient, step('boil', 9), step('prep', 2)];
  const edges = [edge('salt', 'prep'), edge('prep', 'boil'), edge('prep', 'sauce'),
    edge('boil', 'serve'), edge('sauce', 'serve'), edge('serve', 'dish')];
  const original = structuredClone(nodes);
  const result = layoutRecipe(nodes, edges);

  assert.deepEqual(timings(result), { prep: [0, 2], boil: [2, 11], sauce: [2, 5], serve: [11, 12] });
  assert.deepEqual(result.map(node => node.id), nodes.map(node => node.id));
  assert.deepEqual(nodes, original);
  const [final, serve, sauce, salt, boil] = result;
  assert.ok(salt.position.x + MIN_STEP_WIDTH < 0);
  assert.equal(boil.position.x, 2 * PIXELS_PER_MINUTE);
  assert.equal(boil.position.x, sauce.position.x);
  assert.notEqual(boil.position.y, sauce.position.y);
  assert.equal(final.data.endMinute, 12);
  assert.equal(final.position.x, 12 * PIXELS_PER_MINUTE);
  assert.notEqual(final.position.y, serve.position.y); // the one-minute caption extends past the bar
  assert.deepEqual(layoutRecipe(result, edges), result);
});

test('schedule recalculates after changing a duration or removing a dependency', () => {
  const nodes = [step('heat', 4), step('stir', 2), step('plate', 1), step('rest', 20), dish];
  const edges = [edge('heat', 'stir'), edge('stir', 'plate'), edge('plate', 'dish')];
  const initial = layoutRecipe(nodes, edges);
  assert.equal(initial[1].data.startMinute, 4);
  assert.equal(initial[4].data.endMinute, 20);
  assert.ok(initial[4].position.x >= 20 * PIXELS_PER_MINUTE);
  const changed = initial.map(node => node.id === 'heat' ? step('heat', 1.5) : node);
  assert.deepEqual(timings(layoutRecipe(changed, edges)), {
    heat: [0, 1.5], stir: [1.5, 3.5], plate: [3.5, 4.5], rest: [0, 20],
  });
  assert.deepEqual(timings(layoutRecipe(initial, edges.slice(1))), {
    heat: [0, 4], stir: [0, 2], plate: [2, 3], rest: [0, 20],
  });
});

test('row placement reserves the visible label and measured height and respects vertical dragging', () => {
  const short = { ...step('short', 1), height: 220 };
  short.data.preferredY = 100;
  const parallel = step('parallel', 6);
  parallel.data.preferredY = 100;
  const nodes = [short, parallel, step('next', 1), step('last', 2)];
  const layout = layoutRecipe(nodes, [edge('short', 'next'), edge('parallel', 'last')]);
  const [first, second, next, last] = layout;
  assert.equal(first.position.y, 100);
  assert.equal(second.position.x, first.position.x);
  assert.ok(second.position.y >= first.position.y + short.height);
  assert.ok(next.position.x < first.position.x + MIN_STEP_WIDTH);
  assert.ok(next.position.y + 100 <= first.position.y || next.position.y >= first.position.y + short.height);
  assert.equal(last.position.y, 0);
});

test('decimal-minute dependencies align with the same time on another branch', () => {
  const nodes = [step('a', 0.1), step('b', 0.2), step('c', 0.3), step('d', 1), step('e', 1)];
  const edges = [edge('a', 'b'), edge('b', 'd'), edge('c', 'e')];
  const layout = layoutRecipe(nodes, edges);
  assert.equal(layout[1].data.endMinute, 0.3);
  assert.equal(layout[3].position.x, layout[4].position.x);
});

test('only step-to-step edges consume time and cycles cannot yield partial schedules', () => {
  const nodes = [step('a', 2), step('b', 1), ingredient, dish];
  const edges = [edge('salt', 'a'), edge('missing', 'a'), edge('a', 'b'), edge('a', 'b'), edge('b', 'dish')];
  assert.deepEqual(timings(layoutRecipe(nodes, edges)), { a: [0, 2], b: [2, 3] });
  assert.throws(() => layoutRecipe(nodes, [...edges, edge('b', 'a')]), /cycle/i);
  assert.throws(() => layoutRecipe(nodes, [edge('a', 'a')]), /cycle/i);
  assert.deepEqual(layoutRecipe([], []), []);
  assert.equal(layoutRecipe([dish], [])[0].data.endMinute, 0);
});

test('stored durations take precedence over legacy label suffixes', () => {
  const legacy = { label: 'Wait (covered) (2.5 min)' };
  assert.equal(getStepDuration(legacy), 2.5);
  assert.equal(getStepDescription(legacy), 'Wait (covered)');
  assert.equal(getStepDuration({ ...legacy, durationMinutes: 3 }), 3);
  assert.equal(getStepDuration({ label: 'Cook', durationMinutes: -2 }), 1);
  assert.equal(getStepDuration({ label: 'Cook (0 min)' }), 1);
  assert.equal(getStepDescription({ label: 'Saute (covered)' }), 'Saute (covered)');
});

test('the bundled beer cheese recipe imports with parallel prep and a 15-minute finish', () => {
  const demo = JSON.parse(readFileSync(new URL('../src/demoRecipe.json', import.meta.url), 'utf8'));
  const result = layoutRecipe(demo.nodes, demo.edges);
  const steps = result.filter(node => node.type === 'step');
  assert.deepEqual(steps.map(node => [node.data.startMinute, node.data.endMinute]),
    [[0, 1], [0, 1], [1, 3], [3, 6], [6, 10], [10, 15]]);
  assert.notEqual(steps[0].position.y, steps[1].position.y);
  assert.equal(result.find(node => node.type === 'finalDish').data.endMinute, 15);
});
