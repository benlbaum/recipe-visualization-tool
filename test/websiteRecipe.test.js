import test from 'node:test';
import assert from 'node:assert/strict';
import { isWebsiteRecipe, timeLabel, websiteRecipeFile } from '../src/websiteRecipe.js';
import { makeRecipeBox, serializeRecipeBox } from '../src/recipeBox.js';
import { exportRecipe } from '../src/recipeGraph.js';

const card = {
  title: 'Test bread', url: 'https://example.org/bread', description: 'A small loaf.', published: {
    totalTime: 'PT2H15M', recipeYield: '1 loaf', nutrition: { calories: '110 kcal' },
  }, ingredients: ['200 g flour', '½ tsp salt'], steps: [
    { section: 'Dough', text: 'Mix well (2 min)', duration: 'PT2M' },
    { section: '', text: 'Rest until doubled.', duration: null },
  ],
};

test('web import keeps complete text, explicit timing and order through save, reload and export', () => {
  const file = websiteRecipeFile(card);
  const state = makeRecipeBox(file, null);
  const restored = makeRecipeBox(file, serializeRecipeBox(state));
  const [mix, rest] = restored.nodes.filter(n => n.type === 'step');
  assert.equal(mix.data.label, 'Dough — Mix well (2 min)');
  assert.deepEqual([mix.data.durationMinutes, rest.data.durationMinutes, rest.data.startMinute], [2, 1, 2]);
  assert.equal(rest.data.durationEstimated, true);
  assert.equal(mix.data.durationEstimated, undefined);
  const exported = exportRecipe(restored.nodes, restored.edges);
  assert.deepEqual(exported.ingredients.map(i => i.data.label), card.ingredients);
  assert.deepEqual(exported.finalDish.data.sourceRecipe, card);
  assert.deepEqual(exported.edges.map(e => [e.source, e.target]), [['step-0', 'step-1'], ['step-1', 'final-dish']]);
});

test('published times include days, hours and minutes and stay separate from planning durations', () => {
  assert.equal(timeLabel(card.published.totalTime), '2 hr 15 min');
  assert.equal(timeLabel('P1DT5M'), '24 hr 5 min');
  assert.equal(timeLabel('About an hour'), 'About an hour');
  assert.equal(timeLabel(null), '');
});

test('reject incomplete cards and unusable source links before rendering or saving', () => {
  for (const change of [{ steps: [] }, { url: 'https://' }, { url: 'file:///test' }, { ingredients: [{}] }]) {
    assert.equal(isWebsiteRecipe({ ...card, ...change }), false);
    assert.throws(() => websiteRecipeFile({ ...card, ...change }), /complete recipe/);
  }
});
