import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow';
import { getStepDescription, getStepDuration, layoutRecipe } from './recipeTimeline.js';
import { isWebsiteRecipe } from './websiteRecipe.js';

export const emptyRecipe = { nodes: [], edges: [], error: '', importVersion: 0 };

export function savedRecipeNode({ id, type, data }) {
  const saved = { label: data.label, background: data.background };
  if (type === 'finalDish' && isWebsiteRecipe(data.sourceRecipe)) saved.sourceRecipe = data.sourceRecipe;
  if (Number.isFinite(data.preferredY)) saved.preferredY = data.preferredY;
  if (type === 'step') {
    saved.durationMinutes = data.durationMinutes;
    if (data.durationEstimated === true) saved.durationEstimated = true;
    // The legacy reader removes exactly one suffix, including when the
    // cook's own description already ends with a duration.
    saved.label = `${data.label} (${data.durationMinutes} min)`;
  }
  return { id, type, data: saved };
}

// Older readers also expect positions and copies grouped by node type.
export function exportRecipe(nodes, edges) {
  const savedNodes = nodes.map(node => ({ ...savedRecipeNode(node), position: node.position }));
  return {
    nodes: savedNodes,
    edges,
    ingredients: savedNodes.filter(node => node.type === 'ingredient'),
    steps: savedNodes.filter(node => node.type === 'step'),
    finalDish: savedNodes.find(node => node.type === 'finalDish') ?? null,
  };
}

function readRecipe(file) {
  const edges = file?.edges ?? [];
  if (!Array.isArray(file?.nodes) || !Array.isArray(edges)) {
    throw new Error('The recipe file needs a list of nodes and an optional list of edges.');
  }
  const ids = new Set();
  const nodes = file.nodes.map(node => {
    const { id, type, data } = node ?? {};
    if (typeof id !== 'string' || !id.trim() || ids.has(id) || !['step', 'ingredient', 'finalDish'].includes(type) ||
        typeof data?.label !== 'string') {
      throw new Error('Each recipe node needs a unique text ID, a supported type and a label.');
    }
    ids.add(id);
    const restored = { label: data.label, background: data.background };
    if (type === 'finalDish' && isWebsiteRecipe(data.sourceRecipe)) restored.sourceRecipe = data.sourceRecipe;
    if (Number.isFinite(data.preferredY)) restored.preferredY = data.preferredY;
    if (type === 'step') {
      restored.label = getStepDescription(data);
      restored.durationMinutes = getStepDuration(data);
      if (data.durationEstimated === true) restored.durationEstimated = true;
    }
    return { id, type, data: restored };
  });
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!ids.has(edge?.source) || !ids.has(edge?.target)) {
      throw new Error('A recipe connection refers to a missing node.');
    }
    if (edge.id == null) continue;
    if (typeof edge.id !== 'string' || !edge.id.trim() || edgeIds.has(edge.id)) {
      throw new Error('Recipe connection IDs must be unique, nonempty text.');
    }
    edgeIds.add(edge.id);
  }

  // Keep hand-authored connections individually editable. Reserve every
  // explicit ID first so a later edge never collides with a generated ID.
  let sequence = 1;
  const restoredEdges = edges.map(edge => {
    if (edge.id != null) return edge;
    let id;
    do {
      id = `imported-edge-${sequence++}`;
    } while (edgeIds.has(id));
    return { ...edge, id };
  });
  return { nodes, edges: restoredEdges };
}

function schedule(state, nodes, edges) {
  return { ...state, nodes: layoutRecipe(nodes, edges), edges, error: '' };
}

function saveItem(state, node, sources) {
  const index = state.nodes.findIndex(item => item.id === node.id);
  const nodes = [...state.nodes];
  if (index < 0) nodes.push(node);
  else nodes[index] = node;
  if (!sources) return schedule(state, nodes, state.edges);

  const incoming = new Set(sources);
  const edges = state.edges.filter(edge => edge.target !== node.id || incoming.has(edge.source));
  for (const edge of edges) {
    if (edge.target === node.id) incoming.delete(edge.source);
  }
  let connected = edges;
  for (const source of incoming) {
    if (!nodes.some(item => item.id === source && item.type !== 'finalDish') || source === node.id) {
      throw new Error('Choose a different ingredient or step as a prerequisite.');
    }
    connected = addEdge({ source, target: node.id, type: 'custom' }, connected);
  }
  return schedule(state, nodes, connected);
}

function changeNodes(state, changes) {
  const removed = new Set(changes.filter(change => change.type === 'remove').map(change => change.id));
  const edges = removed.size
    ? state.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target))
    : state.edges;
  const nodes = applyNodeChanges(changes, state.nodes);
  // ReactFlow emits a final position change without coordinates on pointer release.
  // Pin only the vertical preference. Scheduling owns all horizontal positions.
  let needsLayout = removed.size > 0 || changes.some(change => change.type === 'dimensions');
  for (const change of changes) {
    if (change.type !== 'position') continue;
    const node = nodes.find(item => item.id === change.id);
    if (!node) continue;
    const previous = state.nodes.find(item => item.id === node.id);
    node.position = { x: previous.position.x, y: node.position.y };
    delete node.positionAbsolute;
    if (!change.dragging && (!change.position || change.position.y !== previous.position.y)) {
      const halfHeight = (node.height ?? 100) / 2;
      const preferredY = change.position
        ? change.position.y // keyboard movement arrives in small increments
        : Math.round((node.position.y + halfHeight) / 100) * 100 - halfHeight;
      node.data = { ...node.data, preferredY };
      needsLayout = true;
    }
  }
  if (needsLayout) return { ...state, nodes: layoutRecipe(nodes, edges), edges };
  return { ...state, nodes, edges };
}

export function recipeReducer(state, action) {
  try {
    switch (action.type) {
      case 'import': {
        const { nodes, edges } = readRecipe(action.file);
        return { ...schedule(state, nodes, edges), importVersion: state.importVersion + 1 };
      }
      case 'addIngredients': {
        const { nodes } = readRecipe({ nodes: action.nodes });
        const existing = new Set(state.nodes.map(node => node.id));
        if (nodes.some(node => node.type !== 'ingredient' || !node.data.label.trim() || existing.has(node.id))) {
          throw new Error('Each new ingredient needs its own ID and a name.');
        }
        return nodes.length ? schedule(state, [...state.nodes, ...nodes], state.edges) : state;
      }
      case 'add':
      case 'saveItem':
        return saveItem(state, action.node, action.sources);
      case 'edit': {
        const node = state.nodes.find(item => item.id === action.id);
        if (!node) return state;
        const data = { ...node.data, label: action.label };
        if (node.type === 'step') data.durationMinutes = action.durationMinutes;
        return saveItem(state, { ...node, data });
      }
      case 'connect':
        return schedule(state, state.nodes, addEdge({ ...action.connection, type: 'custom' }, state.edges));
      case 'nodesChange':
        return changeNodes(state, action.changes);
      case 'edgesChange': {
        const edges = applyEdgeChanges(action.changes, state.edges);
        return action.changes.every(change => change.type === 'select')
          ? { ...state, edges }
          : schedule(state, state.nodes, edges);
      }
      case 'error':
        return { ...state, error: action.message };
      default:
        return state;
    }
  } catch (error) {
    // A rejected connection or import must leave the last usable graph intact.
    return { ...state, error: error.message };
  }
}
