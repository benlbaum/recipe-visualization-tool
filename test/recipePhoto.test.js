import assert from 'node:assert/strict';
import test from 'node:test';
import { isRecipePhoto, prepareRecipePhoto } from '../src/recipePhoto.js';
import { boxReducer, makeRecipeBox, serializeRecipeBox } from '../src/recipeBox.js';
import { exportRecipe } from '../src/recipeGraph.js';

// One red pixel encoded independently in each supported format.
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQD3A0FDAAAAAElFTkSuQmCC';
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCLAGVxf//Z';
const webp = 'data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=';
const recipe = { nodes: [{ id: 'dish', type: 'finalDish', data: { label: 'Soup' } }] };

test('accepts bounded, self-contained raster photos and checks the format of their bytes', () => {
  for (const valid of [png, jpeg, webp]) assert.equal(isRecipePhoto(valid), true);
  for (const invalid of [
    null, 'beer-cheese', 'https://example.com/photo.jpg', 'blob:local',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', png.replace('png', 'jpeg'),
    jpeg.slice(0, -4), webp.slice(0, -4), png.slice(0, -8),
    png.replace('iVB', '%VB'), png + 'A'.repeat(256 * 1024),
  ]) assert.equal(isRecipePhoto(invalid), false);
});

test('rejects oversized input and unsupported or mislabeled files before decoding', async () => {
  await assert.rejects(prepareRecipePhoto(new Blob([new Uint8Array(12 * 1024 * 1024 + 1)])), /12 MB/);
  await assert.rejects(prepareRecipePhoto(new Blob(['<svg/>'], { type: 'image/jpeg' })), /JPEG, PNG or WebP/);
  const pngBytes = Uint8Array.from(atob(png.split(',')[1]), c => c.charCodeAt(0));
  await assert.rejects(prepareRecipePhoto(new Blob([pngBytes], { type: 'image/webp' })), /JPEG, PNG or WebP/);
});

test('custom covers survive renames, recipe switches, draft reloads and file imports', () => {
  const initial = makeRecipeBox(recipe, null);
  const custom = boxReducer(initial, { type: 'setCover', cover: png });
  const renamed = boxReducer(custom, { type: 'edit', id: 'dish', label: 'Tomato soup' });
  assert.equal(renamed.cover, png);
  const file = { ...exportRecipe(renamed.nodes, renamed.edges), cover: renamed.cover };
  const imported = boxReducer(renamed, { type: 'insertRecipe', id: 'copy', file });
  assert.equal(imported.cover, png);
  const persisted = makeRecipeBox(recipe, serializeRecipeBox(imported));
  assert.equal(persisted.cover, png);
  const cleared = boxReducer(persisted, { type: 'setCover', cover: null });
  assert.equal(cleared.cover, null);
  assert.equal(boxReducer(cleared, { type: 'openRecipe', id: 'example' }).cover, png);
  const stock = boxReducer(cleared, { type: 'insertRecipe', id: 'stock', file: { ...file, cover: 'beer-cheese' } });
  assert.equal(stock.cover, 'beer-cheese');
});

test('rejects invalid new covers while restoring recipes from older v1 boxes with unknown cover names', () => {
  const previous = makeRecipeBox(recipe, null);
  const invalid = 'https://example.com/soup.jpg';
  const error = boxReducer(previous, { type: 'setCover', cover: invalid });
  assert.ok(error.error);
  assert.equal(error.cover, previous.cover);
  const badImport = boxReducer(previous, { type: 'insertRecipe', id: 'bad', file: { ...recipe, cover: invalid } });
  assert.ok(badImport.error);
  assert.equal(badImport.activeId, previous.activeId);
  const legacy = JSON.parse(serializeRecipeBox(previous));
  legacy.recipes[0].cover = 'unused-old-cover';
  const restored = makeRecipeBox(recipe, JSON.stringify(legacy));
  assert.equal(restored.cover, null);
  assert.equal(restored.storageBlocked, false);
  assert.equal(restored.nodes[0].data.label, 'Soup');
});
