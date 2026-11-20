import { emptyRecipe, recipeReducer, savedRecipeNode } from './recipeGraph.js';
import { isRecipePhoto } from './recipePhoto.js';

const dishTitle = nodes => nodes.find(node => node.type === 'finalDish')?.data.label.trim() ?? '';
const supportedCover = cover => cover === null || cover === 'beer-cheese' || isRecipePhoto(cover);
const photoError = 'Choose a local JPEG, PNG or WebP photo to use as the recipe cover.';

function availableChecks(nodes, checkedIds) {
  const ingredients = new Set(nodes.filter(node => node.type === 'ingredient').map(node => node.id));
  return [...new Set(checkedIds)].filter(id => ingredients.has(id));
}

function readEntry({ id, file, cover = file?.cover ?? null, checkedIds = [] }, fromStorage = false) {
  if (typeof id !== 'string' || !id || !Array.isArray(checkedIds) ||
      checkedIds.some(value => typeof value !== 'string') || (cover !== null && typeof cover !== 'string')) {
    throw new Error('A recipe box entry is invalid.');
  }
  if (!supportedCover(cover)) {
    // Old boxes accepted arbitrary strings as cover names. Unrecognized
    // names displayed no image and must not prevent restoring the recipe.
    if (fromStorage) cover = null;
    else throw new Error(photoError);
  }
  const { nodes, edges, error } = recipeReducer(emptyRecipe, { type: 'import', file });
  if (error) throw new Error(error);
  return { id, nodes, edges, cover, checkedIds: availableChecks(nodes, checkedIds) };
}

// The editor owns the active graph. Its slot in the collection stores just
// the ID, keeping recipe order stable while switching or updating a draft.
function openEntry(entries, activeId, importVersion, storageBlocked = false) {
  const entry = entries.find(item => item.id === activeId);
  if (!entry) throw new Error('The active recipe is missing from the recipe box.');
  const { nodes, edges, cover, checkedIds } = entry;
  return {
    nodes, edges, activeId, cover, checkedIds, importVersion, storageBlocked, error: '',
    entries: entries.map(item => item.id === activeId ? { id: activeId } : item),
  };
}

function allEntries(state) {
  const { activeId: id, nodes, edges, cover, checkedIds } = state;
  return state.entries.map(entry => entry.id === id ? { id, nodes, edges, cover, checkedIds } : entry);
}

export function makeRecipeBox(demoFile, serializedOrNull) {
  const demo = () => readEntry({ id: 'example', file: demoFile, cover: 'beer-cheese' });
  if (serializedOrNull == null) return openEntry([demo()], 'example', 1);
  try {
    const saved = JSON.parse(serializedOrNull);
    if (saved?.version !== 1 || !Array.isArray(saved.recipes)) throw new Error('Unknown recipe box format.');
    const entries = saved.recipes.map(entry => readEntry(entry, true));
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate recipe ID.');
    return openEntry(entries, saved.activeId, 1);
  } catch {
    return {
      ...openEntry([demo()], 'example', 1, true),
      error: 'Your saved recipe box could not be opened. The example is available for this session.',
    };
  }
}

export function serializeRecipeBox(state) {
  const recipes = allEntries(state).map(({ id, nodes, edges, cover, checkedIds }) => {
    const savedNodes = nodes.map(savedRecipeNode);
    const savedEdges = edges.map(edge => {
      const saved = { ...edge };
      delete saved.selected;
      return saved;
    });
    return { id, file: { nodes: savedNodes, edges: savedEdges }, cover, checkedIds };
  });
  return JSON.stringify({ version: 1, activeId: state.activeId, recipes });
}

export function listRecipes(state) {
  return allEntries(state).map(({ id, nodes, cover }) => ({
    id, cover, title: dishTitle(nodes) || 'Untitled recipe',
    stepCount: nodes.filter(node => node.type === 'step').length,
    ingredientCount: nodes.filter(node => node.type === 'ingredient').length,
    totalMinutes: nodes.reduce((latest, node) => Math.max(latest, node.data.endMinute ?? 0), 0),
  }));
}

export function boxReducer(state, action) {
  switch (action.type) {
    case 'setCover':
      return supportedCover(action.cover)
        ? { ...state, cover: action.cover, error: '' }
        : { ...state, error: photoError };
    case 'removeRecipe': {
      const index = state.entries.findIndex(entry => entry.id === action.id);
      if (index < 0) return { ...state, error: 'Recipe not found.' };
      if (state.entries.length === 1) return { ...state, error: 'Keep at least one recipe in your box.' };
      const entries = state.entries.filter(entry => entry.id !== action.id);
      if (action.id !== state.activeId) return { ...state, entries, error: '' };
      const next = entries[Math.min(index, entries.length - 1)];
      return openEntry(entries, next.id, state.importVersion + 1, state.storageBlocked);
    }
    case 'openRecipe': {
      if (state.activeId === action.id) return state;
      if (!state.entries.some(entry => entry.id === action.id)) return { ...state, error: 'Recipe not found.' };
      return openEntry(allEntries(state), action.id, state.importVersion + 1, state.storageBlocked);
    }
    case 'insertRecipe': {
      if (state.entries.some(entry => entry.id === action.id)) {
        return { ...state, error: 'A recipe with this ID is already in your box.' };
      }
      try {
        const entry = readEntry(action);
        return openEntry([...allEntries(state), entry], entry.id, state.importVersion + 1, state.storageBlocked);
      } catch (error) {
        return { ...state, error: error.message };
      }
    }
    case 'resetPrep':
      return state.checkedIds.length ? { ...state, checkedIds: [] } : state;
    case 'checkIngredient': {
      if (!state.nodes.some(node => node.type === 'ingredient' && node.id === action.id)) return state;
      const checkedIds = state.checkedIds.includes(action.id)
        ? state.checkedIds.filter(id => id !== action.id)
        : [...state.checkedIds, action.id];
      return { ...state, checkedIds };
    }
    default: {
      const next = recipeReducer(state, action);
      if (next.nodes === state.nodes) return next;
      const title = nodes => dishTitle(nodes).replace(/\s+/g, ' ').toLowerCase();
      const exampleRenamed = state.cover === 'beer-cheese' && title(next.nodes) !== title(state.nodes);
      return {
        ...next,
        cover: exampleRenamed ? null : state.cover,
        checkedIds: availableChecks(next.nodes, state.checkedIds),
      };
    }
  }
}
