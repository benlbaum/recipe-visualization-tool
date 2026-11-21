import assert from 'node:assert/strict';
import test from 'node:test';
import { boxReducer, listRecipes, makeRecipeBox, serializeRecipeBox } from '../src/recipeBox.js';

function recipe(name, minutes) {
  return {
    nodes: [
      { id: 'ingredient', type: 'ingredient', data: { label: 'Salt' } },
      { id: 'step', type: 'step', data: { label: 'Cook', durationMinutes: minutes } },
      { id: 'dish', type: 'finalDish', data: { label: name } },
    ],
    edges: [],
  };
}

const demo = recipe('Beer Cheese Dip', 3);
const newBox = () => makeRecipeBox(demo, null);
const toggle = state => boxReducer(state, { type: 'checkIngredient', id: 'ingredient' });
const open = (state, id) => boxReducer(state, { type: 'openRecipe', id });
const addSoup = state => boxReducer(state, { type: 'insertRecipe', id: 'soup', file: recipe('Soup', 5) });

test('switching and reloading preserves each draft, its checklist and the current recipe', () => {
  const initial = toggle(newBox());
  const soup = addSoup(initial);
  assert.deepEqual(soup.checkedIds, []);
  assert.equal(soup.cover, null);
  const edited = boxReducer(soup, { type: 'edit', id: 'step', label: 'Simmer', durationMinutes: 7 });
  assert.deepEqual(listRecipes(edited).map(item => [item.id, item.title, item.totalMinutes]), [
    ['example', 'Beer Cheese Dip', 3], ['soup', 'Soup', 7],
  ]);
  const example = open(edited, 'example');
  assert.deepEqual(example.checkedIds, ['ingredient']);
  assert.equal(example.cover, 'beer-cheese');
  assert.ok(example.importVersion > edited.importVersion);
  const restored = makeRecipeBox(demo, serializeRecipeBox(example));
  assert.equal(restored.activeId, 'example');
  assert.equal(restored.storageBlocked, false);
  assert.deepEqual(restored.checkedIds, ['ingredient']);
  const reopened = open(restored, 'soup');
  assert.equal(reopened.nodes.find(node => node.id === 'step').data.label, 'Simmer');
  assert.deepEqual(reopened.checkedIds, []);
  assert.deepEqual(listRecipes(reopened), listRecipes(edited));
});

test('invalid and duplicate imports leave all recipes intact', () => {
  const state = toggle(addSoup(newBox()));
  const before = serializeRecipeBox(state);
  for (const action of [
    { type: 'insertRecipe', id: 'broken', file: { nodes: [{}] } },
    { type: 'insertRecipe', id: 'soup', file: recipe('Replacement', 1) },
    { type: 'openRecipe', id: 'gone' },
  ]) {
    const rejected = boxReducer(state, action);
    assert.ok(rejected.error);
    assert.equal(serializeRecipeBox(rejected), before);
  }
});

test('disk snapshots store recipe inputs and ignore chart selection and measurements', () => {
  const withEdge = { ...demo, edges: [{ id: 'uses', source: 'ingredient', target: 'step', style: { stroke: 'green' } }] };
  const state = makeRecipeBox(withEdge, null);
  const before = serializeRecipeBox(state);
  const selected = boxReducer(state, { type: 'edgesChange', changes: [{ type: 'select', id: 'uses', selected: true }] });
  const measured = boxReducer(selected, { type: 'nodesChange', changes: [
    { type: 'select', id: 'step', selected: true },
    { type: 'dimensions', id: 'step', dimensions: { width: 400, height: 300 } },
  ] });
  assert.equal(serializeRecipeBox(measured), before);
  const { file } = JSON.parse(before).recipes[0];
  assert.deepEqual(Object.keys(file).sort(), ['edges', 'nodes']);
  assert.ok(file.nodes.every(node => Object.keys(node).sort().join(',') === 'data,id,type'));
  assert.deepEqual(makeRecipeBox(demo, before).edges, withEdge.edges);
});

test('removing the current recipe opens a surviving draft with its prep checks', () => {
  const state = addSoup(toggle(newBox()));
  const removed = boxReducer(state, { type: 'removeRecipe', id: 'soup' });
  assert.equal(removed.activeId, 'example');
  assert.deepEqual(removed.checkedIds, ['ingredient']);
  assert.ok(removed.importVersion > state.importVersion);
  const restored = makeRecipeBox(demo, serializeRecipeBox(removed));
  assert.deepEqual(listRecipes(restored).map(entry => entry.id), ['example']);
  assert.deepEqual(restored.checkedIds, ['ingredient']);

  for (const id of ['example', 'missing']) {
    const rejected = boxReducer(removed, { type: 'removeRecipe', id });
    assert.ok(rejected.error);
    assert.equal(serializeRecipeBox(rejected), serializeRecipeBox(removed));
  }
});

test('removing an inactive recipe preserves the editor and its pending layout', () => {
  const soup = toggle(addSoup(newBox()));
  const state = boxReducer(soup, { type: 'edit', id: 'step', label: 'Rest', durationMinutes: 8 });
  const remaining = boxReducer(state, { type: 'removeRecipe', id: 'example' });
  assert.equal(remaining.activeId, 'soup');
  assert.equal(remaining.nodes, state.nodes);
  assert.equal(remaining.edges, state.edges);
  assert.equal(remaining.importVersion, state.importVersion);
  assert.deepEqual(remaining.checkedIds, ['ingredient']);
  assert.deepEqual(listRecipes(remaining).map(entry => [entry.id, entry.totalMinutes]), [['soup', 8]]);
});

test('a blank recipe can grow independently and deleted ingredients leave its checklist', () => {
  const blank = boxReducer(toggle(newBox()), { type: 'insertRecipe', id: 'new', file: { nodes: [] } });
  assert.deepEqual(listRecipes(blank)[1], {
    id: 'new', title: 'Untitled recipe', cover: null, ingredientCount: 0, stepCount: 0, completedCount: 0, totalMinutes: 0,
  });
  const withSalt = boxReducer(blank, { type: 'add', node: demo.nodes[0] });
  assert.deepEqual(toggle(toggle(withSalt)).checkedIds, []);
  const removed = boxReducer(toggle(withSalt), { type: 'nodesChange', changes: [{ type: 'remove', id: 'ingredient' }] });
  assert.deepEqual(removed.checkedIds, []);
  assert.deepEqual(open(removed, 'example').checkedIds, ['ingredient']);
});

test('resetting prep clears only the active checklist, including after reload', () => {
  const prepared = toggle(addSoup(toggle(newBox())));
  const reset = boxReducer(prepared, { type: 'resetPrep' });
  assert.deepEqual(reset.checkedIds, []);
  assert.equal(reset.nodes, prepared.nodes);
  assert.equal(reset.edges, prepared.edges);
  const restored = makeRecipeBox(demo, serializeRecipeBox(reset));
  assert.deepEqual(restored.checkedIds, []);
  assert.equal(boxReducer(restored, { type: 'resetPrep' }), restored);
  assert.deepEqual(open(restored, 'example').checkedIds, ['ingredient']);
});

test('the example cover follows the original dish across ordinary edits, but clears after a rename or removal', () => {
  const state = newBox();
  const renamed = label => boxReducer(state, { type: 'edit', id: 'dish', label });
  assert.equal(renamed(' BEER  CHEESE Dip ').cover, 'beer-cheese');
  assert.equal(renamed('Beer bread').cover, null);
  assert.equal(boxReducer(state, { type: 'nodesChange', changes: [{ type: 'remove', id: 'dish' }] }).cover, null);
  assert.equal(boxReducer(state, { type: 'edit', id: 'ingredient', label: 'Pepper' }).cover, 'beer-cheese');
});

test('malformed saved data opens a usable example while keeping persistence blocked', () => {
  const valid = JSON.parse(serializeRecipeBox(newBox()));
  for (const malformed of [
    '', JSON.stringify({ ...valid, version: 99 }), JSON.stringify({ ...valid, activeId: 'missing' }),
    JSON.stringify({ ...valid, recipes: [valid.recipes[0], valid.recipes[0]] }),
    JSON.stringify({ ...valid, recipes: [...valid.recipes, { id: 'bad', file: {} }] }),
  ]) {
    const fallback = makeRecipeBox(demo, malformed);
    assert.ok(fallback.error);
    assert.equal(fallback.storageBlocked, true);
    assert.equal(fallback.activeId, 'example');
    assert.equal(listRecipes(fallback)[0].title, 'Beer Cheese Dip');
    assert.equal(addSoup(fallback).storageBlocked, true);
  }
});
