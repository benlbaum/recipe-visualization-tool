import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import AddIcon from '@mui/icons-material/Add';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import FileOpenOutlinedIcon from '@mui/icons-material/FileOpenOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import ViewTimelineOutlinedIcon from '@mui/icons-material/ViewTimelineOutlined';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import CloseIcon from '@mui/icons-material/Close';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import demoRecipe from './demoRecipe.json';
import RecipePhoto from './RecipePhoto.jsx';
import TimelineCanvas from './TimelineCanvas.jsx';
import SelectionDetails from './SelectionDetails.jsx';
import { IngredientsPanel, MethodPanel } from './RecipePanels.jsx';
import { ItemEditor, NewRecipeDialog, RecipeBoxDialog, RecipeDialog, PhotoDialog } from './RecipeDialogs.jsx';
import { boxReducer, listRecipes, makeRecipeBox, serializeRecipeBox } from './recipeBox.js';
import { exportRecipe, recipeReducer } from './recipeGraph.js';

const storageKey = 'mise.recipe-box.v1';
const smallScreen = '(max-width: 760px)';
const newId = prefix => `${prefix}-${crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(2)).join('-')}`;

function readDrafts() {
  try {
    const raw = localStorage.getItem(storageKey);
    return { raw, state: makeRecipeBox(demoRecipe, raw) };
  } catch {
    return { raw: null, state: { ...makeRecipeBox(demoRecipe, null), storageBlocked: true } };
  }
}

function RecipeEditor() {
  const [initial] = useState(readDrafts);
  const [recipe, dispatch] = useReducer(boxReducer, initial.state);
  const [view, setView] = useState(() => matchMedia(smallScreen).matches ? 'method' : 'timeline');
  const [showIngredients, setShowIngredients] = useState(false);
  const [modal, setModal] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [saveWarning, setSaveWarning] = useState('');
  const fileInput = useRef(null);
  const lastSaved = useRef(initial.raw);
  const dish = recipe.nodes.find(node => node.type === 'finalDish');
  const title = dish?.data.label || 'Untitled recipe';
  const steps = recipe.nodes.filter(node => node.type === 'step');
  const ingredients = recipe.nodes.filter(node => node.type === 'ingredient');
  const selected = recipe.nodes.filter(node => node.selected && (showIngredients || node.type !== 'ingredient'));
  const total = steps.reduce((end, node) => Math.max(end, node.data.endMinute), 0);
  const checkedIds = useMemo(() => new Set(recipe.checkedIds), [recipe.checkedIds]);
  const openEditor = useCallback(id => setModal({ screen: 'edit', id }), []);
  const askDelete = useCallback((id, ids = [id]) => setRemoval({ ids }), []);
  const nodes = useMemo(() => recipe.nodes.map(node => ({
    ...node, data: { ...node.data, onRequestEdit: openEditor, onDelete: askDelete },
  })), [recipe.nodes, openEditor, askDelete]);
  const onNodesChange = useCallback(changes => dispatch({ type: 'nodesChange', changes }), []);
  const onEdgesChange = useCallback(changes => dispatch({ type: 'edgesChange', changes }), []);
  const onConnect = useCallback(connection => dispatch({ type: 'connect', connection }), []);
  const close = () => setModal(null);
  const add = type => setModal({ screen: 'edit', type });
  const editing = recipe.nodes.find(node => node.id === modal?.id);
  const editingType = editing?.type ?? modal?.type;

  useEffect(() => { document.title = `${title} · Mise`; }, [title]);
  useEffect(() => {
    const query = matchMedia(smallScreen);
    const resize = () => { if (!query.matches) setView(current => current === 'ingredients' ? 'method' : current); };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (recipe.storageBlocked || recipe.nodes.some(node => node.dragging)) return;
    try {
      const snapshot = serializeRecipeBox(recipe);
      if (snapshot === lastSaved.current) return;
      if (localStorage.getItem(storageKey) !== lastSaved.current) {
        setSaveWarning('Another tab changed your recipe box. Export this recipe before reloading.');
        return;
      }
      localStorage.setItem(storageKey, snapshot);
      lastSaved.current = snapshot;
      setSaveWarning('');
    } catch {
      setSaveWarning('Device storage is unavailable. Export this recipe to keep a copy.');
    }
  }, [recipe]);

  function saveNode(label, durationMinutes, sources) {
    const type = editingType;
    if (!editing && type === 'ingredient') {
      const additions = label.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
        .map(name => ({ id: newId('ingredient'), type: 'ingredient', data: { label: name } }));
      dispatch({ type: 'addIngredients', nodes: additions });
      close();
      return;
    }
    const node = editing ?? { id: newId(type), type };
    const data = { ...node.data, label };
    if (type === 'step') data.durationMinutes = durationMinutes;
    const action = { type: 'saveItem', node: { ...node, data }, sources };
    const result = recipeReducer(recipe, action);
    if (result.error) return result.error;
    dispatch(action);
    close();
  }

  async function importFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      dispatch({ type: 'insertRecipe', id: newId('recipe'), file: JSON.parse(await file.text()) });
      close();
    } catch {
      dispatch({ type: 'error', message: 'Could not read the file. Choose a recipe in JSON format.' });
      close();
    }
  }

  function download() {
    const file = exportRecipe(recipe.nodes, recipe.edges);
    if (recipe.cover) file.cover = recipe.cover;
    const json = JSON.stringify(file, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.download = (title.replace(/[<>:"/\\|?*]/g, '').trim() || 'recipe') + '.json';
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createRecipe(label) {
    const file = { nodes: [{ id: 'final-dish', type: 'finalDish', data: { label } }], edges: [] };
    dispatch({ type: 'insertRecipe', id: newId('recipe'), file });
    close();
  }

  const ingredientPanel = <IngredientsPanel nodes={recipe.nodes} checkedIds={checkedIds}
    onToggle={id => dispatch({ type: 'checkIngredient', id })} onReset={() => dispatch({ type: 'resetPrep' })}
    onAdd={() => add('ingredient')} onEdit={openEditor} />;
  const localWarning = saveWarning || (recipe.storageBlocked ? 'Local saving is unavailable. Export your recipe to keep a copy.' : '');
  return (
    <div className="studio">
      <header className="app-bar">
        <div className="app-bar-inner">
          <div className="brand"><span className="brand-mark"><RestaurantMenuIcon /></span><span>Mise</span></div>
          <span className="app-descriptor">Recipe planner</span>
          <nav className="app-actions" aria-label="Recipes">
            <button className="text-action box-action" onClick={() => setModal({ screen: 'box' })}><MenuBookOutlinedIcon />Recipe box</button>
            <button className="text-action file-action" title="Import recipe" aria-label="Import recipe" onClick={() => fileInput.current.click()}>
              <FileOpenOutlinedIcon /><span>Import</span></button>
            <button className="text-action file-action" title="Export recipe" aria-label="Export recipe" onClick={download}>
              <FileDownloadOutlinedIcon /><span>Export</span></button>
            <button className="action primary new-action" aria-label="New recipe" title="New recipe" onClick={() => setModal({ screen: 'new' })}>
              <AddIcon /><span>New recipe</span></button>
          </nav>
          <input type="file" hidden accept=".json,application/json" ref={fileInput} onChange={importFile} />
        </div>
      </header>
      <main className="studio-main">
        <header className={`recipe-cover${recipe.cover ? ' has-photo' : ''}`}>
          <div className="cover-copy">
            <div className="cover-title">
              <h1 title={title}>{title}</h1>
              <button className="icon-button title-edit" aria-label="Edit recipe" title="Edit recipe"
                onClick={() => dish ? openEditor(dish.id) : add('finalDish')}><EditOutlinedIcon /></button>
            </div>
            <div className="recipe-facts">
              <span><AccessTimeRoundedIcon />{total} min</span>
              <span>{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
              <span>{ingredients.length} {ingredients.length === 1 ? 'ingredient' : 'ingredients'}</span>
            </div>
          </div>
          {recipe.cover && <RecipePhoto className="recipe-photo" cover={recipe.cover}
            alt={recipe.cover === 'beer-cheese' ? 'Golden beer cheese dip with salted soft pretzels' : title} />}
          <button type="button" className={`cover-photo-action ${recipe.cover ? 'change-photo' : ''}`}
            title={recipe.cover ? 'Change recipe photo' : 'Add recipe photo'} aria-label={recipe.cover ? 'Change recipe photo' : 'Add recipe photo'}
            onClick={() => setModal({ screen: 'photo' })}>
            <PhotoCameraOutlinedIcon />{!recipe.cover && <span>Add photo</span>}
          </button>
        </header>
        {(recipe.error || localWarning) && <div className="studio-alert" role="alert"><span>{recipe.error || localWarning}</span>
          {recipe.error && <button className="icon-button" aria-label="Dismiss message"
            onClick={() => dispatch({ type: 'error', message: '' })}><CloseIcon /></button>}</div>}
        <div className="workspace-grid">
          <aside className="prep-sidebar">{ingredientPanel}</aside>
          <section className="plan-panel" aria-label="Cooking plan">
            <header className="plan-header"><h2>Cooking plan</h2>
              <button className="action primary" onClick={() => add('step')}><AddIcon />Add step</button></header>
            <div className="plan-toolbar">
              <div className="view-switch" role="group" aria-label="Cooking plan view">
                <button aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}><ViewTimelineOutlinedIcon />Timeline</button>
                <button aria-pressed={view === 'method'} onClick={() => setView('method')}><FormatListNumberedIcon />Method</button>
                <button className="mobile-ingredients" aria-pressed={view === 'ingredients'} onClick={() => setView('ingredients')}>
                  <ChecklistRoundedIcon />Ingredients</button>
              </div>
              {view === 'timeline' && <label className="links-toggle" title="Show ingredient nodes and their connections">
                <input type="checkbox" checked={showIngredients} onChange={e => setShowIngredients(e.target.checked)} />
                Ingredient links</label>}
            </div>
            <div className={'plan-body view-' + view}>
              {view === 'ingredients' ? ingredientPanel : view === 'method'
                ? <MethodPanel nodes={recipe.nodes} edges={recipe.edges} onEdit={openEditor} onAdd={() => add('step')} />
                : steps.length || (showIngredients && ingredients.length)
                  ? <TimelineCanvas nodes={nodes} edges={recipe.edges} onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange} onConnect={onConnect} version={recipe.importVersion} showIngredients={showIngredients} />
                  : <div className="empty-plan"><span className="empty-mark"><ViewTimelineOutlinedIcon /></span>
                    <h3>Start your cooking plan</h3><p>Add a step and its duration to see it on the timeline.</p>
                    <button className="action secondary" onClick={() => add('step')}><AddIcon />Add first step</button></div>}
            </div>
            {view === 'timeline' && selected.length === 1 && <SelectionDetails node={selected[0]} nodes={recipe.nodes}
              edges={recipe.edges} onEdit={openEditor}
              onClose={() => onNodesChange([{ type: 'select', id: selected[0].id, selected: false }])} />}
          </section>
        </div>
        <footer className="studio-footer"><span><CheckCircleOutlineIcon />{localWarning ? 'Session only' : 'Saved on this device'}</span>
          <span>{view === 'timeline' ? 'Drag between handles to connect steps.' : ''}</span></footer>
      </main>
      {modal?.screen === 'edit' && editingType && <ItemEditor key={editing?.id ?? editingType} type={editingType}
        node={editing} nodes={recipe.nodes} edges={recipe.edges} onSave={saveNode} onClose={close} onDelete={askDelete} />}
      {modal?.screen === 'new' && <NewRecipeDialog onClose={close} onCreate={createRecipe} />}
      {modal?.screen === 'photo' && <PhotoDialog cover={recipe.cover} onClose={close}
        onSave={cover => { dispatch({ type: 'setCover', cover }); close(); }} />}
      {modal?.screen === 'box' && <RecipeBoxDialog entries={listRecipes(recipe)} activeId={recipe.activeId} onClose={close}
        onOpen={id => { dispatch({ type: 'openRecipe', id }); close(); }} onImport={() => fileInput.current.click()}
        onRemove={entry => setRemoval({ entry })}
        onExample={() => { dispatch({ type: 'insertRecipe', id: newId('recipe'), file: demoRecipe, cover: 'beer-cheese' }); close(); }} />}
      {removal && <RecipeDialog title={removal.entry ? 'Remove recipe?' : removal.ids.length === 1 ? 'Delete item?' : 'Delete selected items?'}
        onClose={() => setRemoval(null)}>
        <div className="dialog-body"><p className="confirm-text">{removal.entry
          ? `Remove “${removal.entry.title}” from this device’s recipe box? Export it first if you want a copy.`
          : removal.ids.length === 1
            ? `This removes “${recipe.nodes.find(n => n.id === removal.ids[0])?.data.label}” and its connections from this recipe.`
            : `This removes ${removal.ids.length} items and their connections from this recipe.`}</p></div>
        <footer className="dialog-actions"><button className="action secondary" autoFocus onClick={() => setRemoval(null)}>Cancel</button>
          <button className="action destructive" onClick={() => {
            if (removal.entry) dispatch({ type: 'removeRecipe', id: removal.entry.id });
            else { onNodesChange(removal.ids.map(id => ({ type: 'remove', id }))); close(); }
            setRemoval(null);
          }}>{removal.entry ? 'Remove recipe' : 'Delete'}</button></footer></RecipeDialog>}
    </div>
  );
}

export default function RecipeVisualizer() {
  return <ReactFlowProvider><RecipeEditor /></ReactFlowProvider>;
}
