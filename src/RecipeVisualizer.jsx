import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import ReactFlow, {
  Background, BezierEdge, Controls, ReactFlowProvider,
  useNodesInitialized, useReactFlow, useStore, useViewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import PropTypes from 'prop-types';
import { Alert, Box, Button, TextField } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import demoRecipe from './demoRecipe.json';
import RecipeNode from './RecipeNode';
import { emptyRecipe, exportRecipe, recipeReducer } from './recipeGraph.js';
import { PIXELS_PER_MINUTE } from './recipeTimeline.js';

const nodeTypes = { ingredient: RecipeNode, step: RecipeNode, finalDish: RecipeNode };
const edgeTypes = { custom: BezierEdge };

function TimelineRuler({ total }) {
  const { x, zoom } = useViewport();
  const width = useStore(store => store.width);
  const scale = zoom * PIXELS_PER_MINUTE;
  // Choose whole-minute ticks that remain legible as the cook pans and zooms.
  const minimum = Math.max(1, 64 / scale);
  const magnitude = 10 ** Math.floor(Math.log10(minimum));
  const interval = [1, 2, 5, 10].find(n => n * magnitude >= minimum) * magnitude;
  const first = Math.max(0, Math.ceil(-x / (interval * scale)));
  const last = Math.min(Math.floor(total / interval), Math.ceil((width - x) / (interval * scale)));
  const ticks = [];
  for (let i = 0; i < last - first + 1; i++) {
    const minute = (first + i) * interval;
    ticks.push(<span key={minute} style={{ left: x + minute * scale }}>{minute} min</span>);
  }
  return (
    <div className="timeline-ruler">
      <div className="timeline-ticks" aria-hidden="true">{ticks}</div>
      <strong>{total.toLocaleString(undefined, { maximumSignificantDigits: 15 })} min total</strong>
    </div>
  );
}
TimelineRuler.propTypes = { total: PropTypes.number.isRequired };

function FitImportedRecipe({ version }) {
  const { fitView, getNodes } = useReactFlow();
  const initialized = useNodesInitialized();
  const fitted = useRef(0);
  useEffect(() => {
    if (!initialized || fitted.current === version) return;
    const frame = requestAnimationFrame(() => {
      const nodes = getNodes();
      const timeline = nodes.filter(node => node.type !== 'ingredient');
      // Frame the cooking steps even when a long ingredient list extends below them.
      const top = timeline.reduce((y, node) => Math.min(y, node.position.y), Infinity);
      const bottom = timeline.reduce((y, node) => Math.max(y, node.position.y + node.height), -Infinity);
      const visible = nodes.filter(node => node.position.y <= bottom && node.position.y + node.height >= top);
      fitView({ nodes: timeline.length ? visible : nodes, padding: 0.15, maxZoom: 1.1 });
      fitted.current = version;
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, getNodes, initialized, version]);
  return null;
}
FitImportedRecipe.propTypes = { version: PropTypes.number.isRequired };

function RecipeEditor() {
  const [recipe, dispatch] = useReducer(recipeReducer, emptyRecipe);
  const [newIngredient, setNewIngredient] = useState('');
  const [description, setDescription] = useState('');
  const [minutes, setMinutes] = useState('');
  const [newFinalDish, setNewFinalDish] = useState('');
  const fileInputRef = useRef(null);
  const onEdit = useCallback((id, label, durationMinutes) => {
    dispatch({ type: 'edit', id, label, durationMinutes });
  }, []);
  const onDelete = useCallback(id => {
    dispatch({ type: 'nodesChange', changes: [{ type: 'remove', id }] });
  }, []);
  const nodes = useMemo(() => recipe.nodes.map(node => ({
    ...node, data: { ...node.data, onEdit, onDelete },
  })), [recipe.nodes, onEdit, onDelete]);
  const onNodesChange = useCallback(changes => dispatch({ type: 'nodesChange', changes }), []);
  const onEdgesChange = useCallback(changes => dispatch({ type: 'edgesChange', changes }), []);
  const onConnect = useCallback(connection => dispatch({ type: 'connect', connection }), []);
  const duration = Number(minutes);
  const canAddStep = description.trim() && Number.isFinite(duration) && duration > 0;
  const total = nodes.reduce((end, node) => Math.max(end, node.data.endMinute ?? 0), 0);

  function addNode(type, data) {
    const id = type === 'finalDish' ? 'final-dish' : `${type}-${crypto.randomUUID?.() ?? Date.now()}`;
    dispatch({ type: 'add', node: { id, type, data } });
  }

  function downloadRecipe() {
    const json = JSON.stringify(exportRecipe(recipe.nodes, recipe.edges), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.download = 'recipe.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      dispatch({ type: 'import', file: JSON.parse(await file.text()) });
    } catch {
      dispatch({ type: 'error', message: 'Could not read the recipe. Choose a recipe JSON file.' });
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', gap: 2, p: 2, flexWrap: 'wrap', overflowY: 'auto', maxHeight: '45%',
        bgcolor: 'background.paper', colorScheme: 'light' }}>
        <TextField value={newIngredient} label="Add Ingredient"
          onChange={event => setNewIngredient(event.target.value)} />
        <Button variant="contained" disabled={!newIngredient.trim()} onClick={() => {
          addNode('ingredient', { label: newIngredient.trim(), background: '#F0E68C' });
          setNewIngredient('');
        }}>Add Ingredient</Button>

        <TextField value={description} label="Step Description"
          onChange={event => setDescription(event.target.value)} />
        <TextField type="number" label="Time (minutes)" value={minutes}
          inputProps={{ min: 0, step: 'any' }} onChange={event => setMinutes(event.target.value)} />
        <Button variant="contained" disabled={!canAddStep} onClick={() => {
          addNode('step', { label: description.trim(), durationMinutes: duration, background: '#ADD8E6' });
          setDescription('');
          setMinutes('');
        }}>Add Step</Button>

        <TextField value={newFinalDish} label="Final Dish Name"
          onChange={event => setNewFinalDish(event.target.value)} />
        <Button variant="contained"
          disabled={!newFinalDish.trim() || nodes.some(node => node.type === 'finalDish')}
          onClick={() => {
            addNode('finalDish', { label: newFinalDish.trim(), background: '#90EE90' });
            setNewFinalDish('');
          }}>Add Final Dish</Button>

        <Button onClick={downloadRecipe} variant="contained" startIcon={<SaveIcon />}>Export Recipe</Button>
        <input type="file" ref={fileInputRef} hidden onChange={importFile} accept=".json" />
        <Button onClick={() => fileInputRef.current.click()} variant="contained" startIcon={<UploadIcon />}>
          Import Recipe
        </Button>
        <Button onClick={() => dispatch({ type: 'import', file: demoRecipe })} variant="contained" color="secondary">
          Import Demo Recipe
        </Button>
      </Box>
      {recipe.error && (
        <Alert severity="error" onClose={() => dispatch({ type: 'error', message: '' })}>
          {recipe.error}
        </Alert>
      )}
      {total > 0 && <TimelineRuler total={total} />}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ReactFlow nodes={nodes} edges={recipe.edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView minZoom={0.1} maxZoom={4}>
          <FitImportedRecipe version={recipe.importVersion} />
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </Box>
    </Box>
  );
}

export default function RecipeVisualizer() {
  return <ReactFlowProvider><RecipeEditor /></ReactFlowProvider>;
}
