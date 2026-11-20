import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyRecipe, recipeReducer } from '../src/recipeGraph.js';
import { layoutRecipe, PIXELS_PER_MINUTE } from '../src/recipeTimeline.js';

function soup() {
  return recipeReducer(emptyRecipe, {
    type: 'import',
    file: {
      nodes: [
        { id: 'oil', type: 'ingredient', data: { label: 'Olive oil' } },
        { id: 'stock', type: 'ingredient', data: { label: 'Stock' } },
        { id: 'heat', type: 'step', data: { label: 'Heat stock (4 min)' } },
        { id: 'chop', type: 'step', data: { label: 'Chop carrots (2 min)' } },
        { id: 'cook', type: 'step', data: { label: 'Cook (5 min)' } },
      ],
      edges: [
        { id: 'legacy-oil', source: 'oil', target: 'cook' },
        { id: 'legacy-chop', source: 'chop', target: 'cook', type: 'custom', label: 'chopped carrots' },
      ],
    },
  });
}

test('one editor save updates the label, duration, ingredient uses and step prerequisites together', () => {
  const state = soup();
  const original = state.nodes.find(node => node.id === 'cook');
  const saved = recipeReducer(state, {
    type: 'saveItem',
    node: { ...original, data: { ...original.data, label: 'Simmer soup', durationMinutes: 7 } },
    sources: ['stock', 'chop', 'heat'],
  });

  assert.equal(saved.error, '');
  assert.deepEqual(saved.edges.map(edge => [edge.source, edge.target]).sort(), [
    ['chop', 'cook'], ['heat', 'cook'], ['stock', 'cook'],
  ]);
  assert.deepEqual(saved.edges.find(edge => edge.source === 'chop'), state.edges[1]);
  const { label, startMinute, endMinute } = saved.nodes.find(node => node.id === 'cook').data;
  assert.deepEqual([label, startMinute, endMinute], ['Simmer soup', 4, 11]);
});

test('a cyclic editor save leaves the previous label, duration and connections intact', () => {
  const state = soup();
  const before = structuredClone(state);
  const chop = state.nodes.find(node => node.id === 'chop');
  const rejected = recipeReducer(state, {
    type: 'saveItem',
    node: { ...chop, data: { ...chop.data, label: 'Dice carrots', durationMinutes: 3 } },
    sources: ['oil', 'cook'],
  });

  assert.match(rejected.error, /cycle/i);
  assert.deepEqual(rejected.nodes, before.nodes);
  assert.deepEqual(rejected.edges, before.edges);
  assert.deepEqual(state, before);
});

test('creates a scheduled step with multiple prerequisites in one save', () => {
  const saved = recipeReducer(soup(), {
    type: 'saveItem',
    node: { id: 'plate', type: 'step', data: { label: 'Plate', durationMinutes: 1 } },
    sources: ['cook', 'heat'],
  });
  assert.equal(saved.error, '');
  assert.deepEqual(saved.edges.filter(edge => edge.target === 'plate').map(edge => edge.source).sort(),
    ['cook', 'heat']);
  const plate = saved.nodes.find(node => node.id === 'plate');
  assert.deepEqual([plate.data.startMinute, plate.data.endMinute], [7, 8]);
});

test('a batch of ingredients appends in order and a bad batch adds nothing', () => {
  const state = soup();
  const nodes = ['1 tsp salt', '2 carrots', '2 carrots'].map((label, index) => ({
    id: `ingredient-${index}`, type: 'ingredient', data: { label },
  }));
  const saved = recipeReducer(state, { type: 'addIngredients', nodes });
  assert.equal(saved.error, '');
  const added = saved.nodes.slice(state.nodes.length);
  assert.deepEqual(added.map(node => node.data.label), nodes.map(node => node.data.label));
  assert.equal(new Set(added.map(node => node.position.y)).size, added.length);
  assert.equal(saved.edges, state.edges);

  for (const invalid of [nodes[0], state.nodes[0], { id: 'blank', type: 'ingredient', data: { label: ' ' } }]) {
    const rejected = recipeReducer(state, { type: 'addIngredients', nodes: [...nodes, invalid] });
    assert.ok(rejected.error);
    assert.equal(rejected.nodes, state.nodes);
    assert.equal(rejected.edges, state.edges);
  }
});

test('a wider display scale aligns predecessor finishes, dependent starts and the final dish', () => {
  const state = soup();
  const nodes = [...state.nodes, { id: 'dish', type: 'finalDish', data: { label: 'Soup' } }];
  const scale = 104;
  const displayed = layoutRecipe(nodes, state.edges, scale);
  const chop = displayed.find(node => node.id === 'chop');
  const cook = displayed.find(node => node.id === 'cook');
  const dish = displayed.find(node => node.id === 'dish');
  assert.equal(cook.position.x, chop.position.x + chop.data.durationMinutes * scale);
  assert.equal(dish.position.x, cook.position.x + cook.data.durationMinutes * scale);
  assert.equal(state.nodes.find(node => node.id === 'cook').position.x, 2 * PIXELS_PER_MINUTE);
  assert.deepEqual([cook.data.startMinute, dish.data.endMinute], [2, 7]);
});

test('fractional display scales keep short steps and an overnight rise proportional', () => {
  const nodes = [
    { id: 'prep', type: 'step', data: { label: 'Mix', durationMinutes: 2.5 } },
    { id: 'rise', type: 'step', data: { label: 'Rise', durationMinutes: 720 } },
    { id: 'bake', type: 'step', data: { label: 'Bake', durationMinutes: 25 } },
    { id: 'bread', type: 'finalDish', data: { label: 'Bread' } },
  ];
  const edges = [{ source: 'prep', target: 'rise' }, { source: 'rise', target: 'bake' }];
  const [prep, rise, bake, bread] = layoutRecipe(nodes, edges, 0.875);
  assert.deepEqual([prep.position.x, rise.position.x, bake.position.x, bread.position.x],
    [0, 2.5 * 0.875, 722.5 * 0.875, 747.5 * 0.875]);
  assert.equal(bread.data.endMinute, 747.5);
});
