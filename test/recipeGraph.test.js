import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyRecipe, exportRecipe, recipeReducer } from '../src/recipeGraph.js';

function legacyRecipe() {
  return {
    nodes: [
      { id: 'cut', type: 'step', data: { label: 'Cut carrots (2 min)' }, position: { x: 900, y: 11 } },
      { id: 'cook', type: 'step', data: { label: 'Cook (4 min)' }, position: { x: 600, y: 11 } },
      { id: 'dish', type: 'finalDish', data: { label: 'Soup' }, position: { x: 1200, y: 11 } },
    ],
    edges: [{ id: 'cut-cook', source: 'cut', target: 'cook', type: 'custom' }],
    steps: [{ id: 'cut', type: 'step', data: { label: 'Deleted description (200 min)' } }],
    finalDish: null,
  };
}

function load(file, state = emptyRecipe) {
  return recipeReducer(state, { type: 'import', file });
}

function roundTrip(state) {
  return load(JSON.parse(JSON.stringify(exportRecipe(state.nodes, state.edges))));
}

function byId(state, id) {
  return state.nodes.find(node => node.id === id);
}

test('imports the canonical graph and rebuilds legacy groups when exporting', () => {
  const file = legacyRecipe();
  const state = load(file);
  assert.equal(state.error, '');
  assert.equal(state.importVersion, 1);
  const cut = byId(state, 'cut');
  assert.equal(cut.data.label, 'Cut carrots');
  assert.equal(cut.data.durationMinutes, 2);
  assert.notDeepEqual(cut.position, file.nodes[0].position);

  const saved = exportRecipe(state.nodes, state.edges);
  assert.deepEqual(saved.steps.map(node => node.id), ['cut', 'cook']);
  assert.equal(saved.steps[0].data.label, 'Cut carrots (2 min)');
  assert.equal(saved.finalDish.data.label, 'Soup');
  assert.deepEqual(saved.edges, file.edges);
});

test('imports a nodes-only recipe as independent steps', () => {
  const { nodes } = legacyRecipe();
  const state = load({ nodes });
  assert.equal(state.error, '');
  assert.deepEqual(state.edges, []);
  assert.equal(byId(state, 'cut').data.startMinute, 0);
  assert.equal(byId(state, 'cook').data.startMinute, 0);
});

test('an edited duration moves its dependent and survives successive file round trips', () => {
  const initial = load(legacyRecipe());
  const edited = recipeReducer(initial, { type: 'edit', id: 'cut', label: 'Dice carrots', durationMinutes: 6.5 });
  assert.ok(byId(edited, 'cook').position.x > byId(initial, 'cook').position.x);
  let state = edited;
  for (let i = 0; i < 2; i++) {
    state = roundTrip(state);
    assert.equal(state.error, '');
    assert.equal(byId(state, 'cut').data.label, 'Dice carrots');
    assert.equal(byId(state, 'cut').data.durationMinutes, 6.5);
    assert.deepEqual(state.nodes.map(node => node.position), edited.nodes.map(node => node.position));
  }

  const brief = recipeReducer(edited, { type: 'edit', id: 'cut', label: 'Dice carrots', durationMinutes: 1e-7 });
  assert.equal(byId(roundTrip(roundTrip(brief)), 'cut').data.label, 'Dice carrots');
});

test('adding and deleting nodes or edges reschedules the graph without stale connections', () => {
  const state = load(legacyRecipe());
  const plated = recipeReducer(state, { type: 'add', node: {
    id: 'plate', type: 'step', data: { label: 'Plate', durationMinutes: 1 },
  } });
  const connection = { source: 'cook', target: 'plate' };
  const connected = recipeReducer(plated, { type: 'connect', connection });
  const newEdge = connected.edges.find(edge => edge.target === 'plate');
  assert.equal(connected.error, '');
  assert.ok(byId(connected, 'plate').position.x > byId(plated, 'plate').position.x);
  const removed = recipeReducer(connected, { type: 'edgesChange', changes: [{ type: 'remove', id: newEdge.id }] });
  assert.deepEqual(removed.edges, plated.edges);
  assert.equal(byId(removed, 'plate').position.x, byId(plated, 'plate').position.x);

  const deleted = recipeReducer(connected, { type: 'nodesChange', changes: [{ type: 'remove', id: 'cook' }] });
  assert.equal(byId(deleted, 'cook'), undefined);
  assert.deepEqual(deleted.edges, []);
  assert.deepEqual(exportRecipe(deleted.nodes, deleted.edges).steps.map(node => node.id), ['cut', 'plate']);
});

test('rejected connections and imports preserve the last usable graph', () => {
  const state = load(legacyRecipe());
  const before = structuredClone(state);
  const cycle = { source: 'cook', target: 'cut' };
  const badFile = legacyRecipe();
  badFile.edges.push({ ...cycle, id: 'back' });
  for (const rejected of [
    recipeReducer(state, { type: 'connect', connection: cycle }),
    load(badFile, state),
    load({ nodes: [], edges: [{ id: 'broken', source: 'gone', target: 'missing' }] }, state),
  ]) {
    assert.ok(rejected.error);
    assert.deepEqual(rejected.nodes, before.nodes);
    assert.deepEqual(rejected.edges, before.edges);
    assert.equal(rejected.importVersion, before.importVersion);
  }
  assert.deepEqual(state, before);
});

test('ReactFlow measurements, pointer release and keyboard movement preserve the time axis', () => {
  const file = legacyRecipe();
  file.edges = [];
  const state = load(file);
  const change = (current, ...changes) => recipeReducer(current, { type: 'nodesChange', changes });
  const measured = change(state, { type: 'dimensions', id: 'cut', dimensions: { width: 210, height: 250 } });
  assert.ok(byId(measured, 'cook').position.y >= 250);

  const x = byId(measured, 'cut').position.x;
  const dragging = change(measured, { type: 'position', id: 'cut', dragging: true, position: { x: 455, y: 173 } });
  assert.deepEqual(byId(dragging, 'cut').position, { x, y: 173 });
  const dropped = change(dragging, { type: 'position', id: 'cut', dragging: false });
  const dropY = byId(dropped, 'cut').position.y;
  assert.equal((dropY + 125) % 100, 0);
  assert.equal(byId(roundTrip(dropped), 'cut').position.y, dropY);

  const keyed = change(dropped, { type: 'position', id: 'cut', dragging: false, position: { x, y: dropY + 5 } });
  assert.deepEqual(byId(keyed, 'cut').position, { x, y: dropY + 5 });
  assert.equal(byId(roundTrip(keyed), 'cut').position.y, dropY + 5);
});
