import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow';
import { getStepDescription, getStepDuration, layoutRecipe } from './recipeTimeline.js';

export const emptyRecipe = { nodes: [], edges: [], error: '', importVersion: 0 };

// Store the recipe once. The older file format also includes copies by node type.
export function exportRecipe(nodes, edges) {
  const savedNodes = nodes.map(({ id, type, data, position }) => {
    const saved = { label: data.label, background: data.background };
    if (Number.isFinite(data.preferredY)) saved.preferredY = data.preferredY;
    if (type === 'step') {
      saved.durationMinutes = data.durationMinutes;
      saved.label = `${data.label} (${data.durationMinutes} min)`;
    }
    return { id, type, data: saved, position };
  });
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
  const nodes = file.nodes.map(({ id, type, data }) => {
    if (!id || ids.has(id) || !['step', 'ingredient', 'finalDish'].includes(type) ||
        typeof data?.label !== 'string') {
      throw new Error('Each recipe node needs a unique ID, a supported type and a label.');
    }
    ids.add(id);
    const restored = { label: data.label, background: data.background };
    if (Number.isFinite(data.preferredY)) restored.preferredY = data.preferredY;
    if (type === 'step') {
      restored.label = getStepDescription(data);
      restored.durationMinutes = getStepDuration(data);
    }
    return { id, type, data: restored };
  });
  if (edges.some(edge => !ids.has(edge?.source) || !ids.has(edge?.target))) {
    throw new Error('A recipe connection refers to a missing node.');
  }
  return { nodes, edges };
}

function schedule(state, nodes, edges) {
  return { ...state, nodes: layoutRecipe(nodes, edges), edges, error: '' };
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
      case 'add':
        return schedule(state, [...state.nodes, action.node], state.edges);
      case 'edit': {
        const nodes = state.nodes.map(node => {
          if (node.id !== action.id) return node;
          const data = { ...node.data, label: action.label };
          if (node.type === 'step') data.durationMinutes = action.durationMinutes;
          return { ...node, data };
        });
        return schedule(state, nodes, state.edges);
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
