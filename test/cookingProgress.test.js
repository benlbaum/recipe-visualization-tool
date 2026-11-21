import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getCookingSteps } from '../src/cookingProgress.js';
import { boxReducer, listRecipes, makeRecipeBox, serializeRecipeBox } from '../src/recipeBox.js';
import { exportRecipe } from '../src/recipeGraph.js';

const step = (id, label, durationMinutes) => ({ id, type: 'step', data: { label, durationMinutes } });
const link = (source, target) => ({ id: source + '-' + target, source, target });
// Same step graph as Issue #9: two different sauté steps, six parallel starts,
// and three joins. Keep dependents ahead of their prerequisites in file order.
const stirFry = {
  nodes: [
    step('toss', 'Toss to combine', 1), step('simmer', 'Simmer', 1), step('wok-saute', 'Saute', 5),
    step('saute', 'Saute', 5), step('heat', 'Heat wok', 2), step('chop', 'Chop', 1),
    step('slice', 'Slice', 1), step('whisk', 'Whisk the sauce', 5), step('noodles', 'Cook noodles', 1),
    { id: 'ginger', type: 'ingredient', data: { label: 'Fresh ginger' } },
    { id: 'dish', type: 'finalDish', data: { label: 'Veggie Stir Fry' } },
  ],
  edges: [
    link('ginger', 'chop'), link('heat', 'wok-saute'), link('chop', 'wok-saute'),
    link('wok-saute', 'simmer'), link('whisk', 'simmer'), link('simmer', 'toss'),
    link('noodles', 'toss'), link('toss', 'dish'),
  ],
};
const cook = (state, id) => boxReducer(state, { type: 'toggleStepDone', id });
const complete = (state, ...ids) => ids.reduce(cook, state);
const start = () => makeRecipeBox(stirFry, null);
const finish = () => complete(start(), 'noodles', 'heat', 'chop', 'slice', 'saute', 'whisk', 'wok-saute', 'simmer', 'toss');
const index = state => getCookingSteps(state.nodes, state.edges, state.completedStepIds);
const ready = state => [...index(state).values()].filter(entry => !entry.done && !entry.waitingOn.length)
  .map(entry => entry.step.id).sort();

test('the built-in Issue #9 example keeps its nine-minute schedule and cover when resumed', () => {
  const file = JSON.parse(readFileSync(new URL('../src/stirFryRecipe.json', import.meta.url), 'utf8'));
  const example = boxReducer(start(), { type: 'insertRecipe', id: 'stir-fry', file, cover: 'stir-fry' });
  assert.equal(example.edges.length, 24);
  assert.equal(ready(example).length, 6);
  const simmer = [...index(example).values()].find(entry => entry.step.data.label === 'Simmer');
  const saute = simmer.waitingOn.find(node => node.data.label === 'Saute');
  assert.deepEqual([saute.data.startMinute, saute.data.endMinute], [2, 7]);
  const resumed = makeRecipeBox(stirFry, serializeRecipeBox(cook(example, ready(example)[0])));
  assert.deepEqual(listRecipes(resumed).find(item => item.id === 'stir-fry'), {
    id: 'stir-fry', title: 'Veggie Stir Fry', cover: 'stir-fry', ingredientCount: 17, stepCount: 9,
    totalMinutes: 9, completedCount: 1,
  });
});

test('the stir-fry exposes six independent starts and unlocks each join by ID', () => {
  let state = start();
  assert.deepEqual(ready(state), ['chop', 'heat', 'noodles', 'saute', 'slice', 'whisk']);
  assert.equal(cook(state, 'simmer'), state);
  assert.equal(cook(state, 'ginger'), state);
  assert.equal(cook(state, 'dish'), state);
  assert.deepEqual(index(state).get('chop').ingredients.map(node => node.id), ['ginger']);
  state = complete(state, 'saute', 'whisk', 'heat');
  assert.deepEqual(index(state).get('simmer').waitingOn.map(node => node.id), ['wok-saute']);
  assert.deepEqual(index(state).get('wok-saute').waitingOn.map(node => node.id), ['chop']);
  state = complete(state, 'chop', 'wok-saute', 'simmer');
  assert.deepEqual(index(state).get('toss').waitingOn.map(node => node.id), ['noodles']);
  assert.equal(index(complete(state, 'noodles', 'toss')).get('toss').done, true);
  assert.deepEqual(state.checkedIds, []);
});

test('unchecking a completed prerequisite reopens its descendants and keeps parallel work', () => {
  const done = finish();
  assert.equal(done.completedStepIds.length, 9);
  const undone = cook(done, 'heat');
  assert.deepEqual(undone.completedStepIds.sort(), ['chop', 'noodles', 'saute', 'slice', 'whisk']);
  assert.deepEqual(ready(undone), ['heat']);
  assert.equal(cook(undone, 'simmer'), undone);
  assert.equal(done.completedStepIds.length, 9);
});

test('cooking progress survives recipe switching and reload and stays out of shared recipes', () => {
  const prepped = boxReducer(finish(), { type: 'checkIngredient', id: 'ginger' });
  const file = exportRecipe(prepped.nodes, prepped.edges);
  assert.equal('completedStepIds' in file, false);
  assert.ok(file.nodes.every(node => !('done' in node.data)));
  const second = boxReducer(prepped, { type: 'insertRecipe', id: 'second', file });
  assert.deepEqual(second.completedStepIds, []);
  const restored = makeRecipeBox(stirFry, serializeRecipeBox(cook(second, 'noodles')));
  assert.deepEqual(restored.completedStepIds, ['noodles']);
  const original = boxReducer(restored, { type: 'openRecipe', id: 'example' });
  assert.equal(original.completedStepIds.length, 9);
  const reset = boxReducer(original, { type: 'resetCooking' });
  assert.deepEqual(reset.completedStepIds, []);
  assert.deepEqual(reset.checkedIds, ['ginger']);
  assert.deepEqual(boxReducer(reset, { type: 'openRecipe', id: 'second' }).completedStepIds, ['noodles']);
  assert.deepEqual(boxReducer(original, { type: 'resetPrep' }).completedStepIds, original.completedStepIds);
});

test('old drafts resume without step marks and inconsistent saved progress is repaired', () => {
  const saved = JSON.parse(serializeRecipeBox(finish()));
  delete saved.recipes[0].completedStepIds;
  assert.deepEqual(makeRecipeBox(stirFry, JSON.stringify(saved)).completedStepIds, []);
  saved.recipes[0].completedStepIds = ['unknown', 'dish', 'simmer', 'toss', 'heat', 'heat'];
  const repaired = makeRecipeBox(stirFry, JSON.stringify(saved));
  assert.deepEqual(repaired.completedStepIds, ['heat']);
  assert.equal(repaired.error, '');
});

test('changing a step, one of its ingredients or its incoming edges reopens affected work', () => {
  const done = finish();
  for (const change of [
    { type: 'edit', id: 'chop', label: 'Mince finely', durationMinutes: 1 },
    { type: 'edit', id: 'chop', label: 'Chop', durationMinutes: 3 },
    { type: 'edit', id: 'ginger', label: '2 tbsp ginger' },
    { type: 'edgesChange', changes: [{ type: 'remove', id: 'ginger-chop' }] },
    { type: 'connect', connection: { source: 'slice', target: 'chop' } },
    { type: 'nodesChange', changes: [{ type: 'remove', id: 'ginger' }] },
  ]) {
    const result = boxReducer(done, change);
    assert.deepEqual(result.completedStepIds.sort(), ['heat', 'noodles', 'saute', 'slice', 'whisk']);
  }
  const removed = boxReducer(done, { type: 'nodesChange', changes: [{ type: 'remove', id: 'chop' }] });
  assert.deepEqual(removed.completedStepIds.sort(), ['heat', 'noodles', 'saute', 'slice', 'whisk']);
  const selected = boxReducer(done, { type: 'nodesChange', changes: [{ type: 'select', id: 'simmer', selected: true }] });
  assert.equal(selected.completedStepIds, done.completedStepIds);
  assert.deepEqual(boxReducer(done, { type: 'edit', id: 'dish', label: 'Dinner' }).completedStepIds, done.completedStepIds);
});
