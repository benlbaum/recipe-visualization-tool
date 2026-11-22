import { useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Dialog from '@mui/material/Dialog';
import CloseIcon from '@mui/icons-material/Close';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import FileOpenOutlinedIcon from '@mui/icons-material/FileOpenOutlined';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import RecipePhoto from './RecipePhoto.jsx';
import { prepareRecipePhoto } from './recipePhoto.js';
import { getStepNames } from './recipeTimeline.js';

export function RecipeDialog({ title, onClose, children }) {
  const heading = useId();
  return (
    <Dialog open onClose={onClose} aria-labelledby={heading} className="mise-dialog nokey" fullWidth maxWidth="xs">
      <header className="dialog-heading">
        <h2 id={heading}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><CloseIcon /></button>
      </header>
      {children}
    </Dialog>
  );
}
RecipeDialog.propTypes = { title: PropTypes.string.isRequired, onClose: PropTypes.func.isRequired, children: PropTypes.node };

function SourceChoices({ title, choices, selected, onToggle, stepNames }) {
  if (!choices.length) return null;
  const count = choices.filter(node => selected.has(node.id)).length;
  return (
    <details className="source-choices">
      <summary><ChevronRightIcon />{title}<span>{count} selected</span></summary>
      <div>{choices.map(node => (
        <label key={node.id}>
          <input type="checkbox" checked={selected.has(node.id)} onChange={() => onToggle(node.id)} />
          <span>{node.data.label}</span>
          {stepNames && <small>{stepNames.get(node.id).slice(node.data.label.length + 2)}</small>}
        </label>
      ))}</div>
    </details>
  );
}
const nodeShape = PropTypes.shape({ id: PropTypes.string, type: PropTypes.string, data: PropTypes.object });
SourceChoices.propTypes = { title: PropTypes.string.isRequired, choices: PropTypes.arrayOf(nodeShape).isRequired,
  selected: PropTypes.instanceOf(Set).isRequired, onToggle: PropTypes.func.isRequired, stepNames: PropTypes.instanceOf(Map) };

// A downstream step cannot also be a prerequisite of the step being edited.
function unavailableSources(id, edges) {
  const unavailable = new Set([id]);
  for (const target of unavailable) {
    for (const edge of edges) {
      if (edge.source === target) unavailable.add(edge.target);
    }
  }
  return unavailable;
}

const itemLabels = { step: 'step', ingredient: 'ingredient', finalDish: 'recipe' };

export function ItemEditor({ type, node, nodes, edges, onSave, onDelete, onClose, countReopened }) {
  const [name, setName] = useState(node?.data.label ?? '');
  const [duration, setDuration] = useState(node?.data.durationMinutes ?? '');
  const [selected, setSelected] = useState(() => new Set(edges.filter(e => e.target === node?.id).map(e => e.source)));
  const [error, setError] = useState('');
  const linesHint = useId();
  const progressHint = useId();
  const addingIngredients = !node && type === 'ingredient';
  const lines = addingIngredients ? name.split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean) : [];
  const isStep = type === 'step';
  const title = `${node ? 'Edit' : 'Add'} ${itemLabels[type]}`;
  const submitLabel = node ? 'Save changes' : lines.length > 1 ? `Add ${lines.length} ingredients` : title;
  const reopened = name.trim() && (!isStep || Number(duration) > 0)
    ? countReopened?.(name.trim(), Number(duration), [...selected]) ?? 0 : 0;
  const excluded = unavailableSources(node?.id, edges);
  const candidates = nodes.filter(item => !excluded.has(item.id));
  function toggle(id) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function save(event) {
    event.preventDefault();
    if (!name.trim()) return setError('Enter a name before saving.');
    if (isStep && (!Number.isFinite(Number(duration)) || Number(duration) <= 0)) {
      return setError('Enter a duration greater than zero.');
    }
    const message = onSave(addingIngredients ? lines.join('\n') : name.trim(), Number(duration), [...selected]);
    if (message) setError(message);
  }
  return (
    <RecipeDialog title={title} onClose={onClose}>
      <form onSubmit={save} className="recipe-form">
        <div className="dialog-body">
          <label className="field">{isStep ? 'Instruction' : type === 'ingredient' ? 'Ingredient and quantity' : 'Recipe name'}
            {addingIngredients
              ? <textarea rows={4} autoFocus required value={name} onChange={e => setName(e.target.value)}
                aria-describedby={linesHint} placeholder="e.g. 2 tbsp unsalted butter" />
              : <input autoFocus required value={name} onChange={e => setName(e.target.value)}
                placeholder={isStep ? 'e.g. Simmer the sauce' : type === 'ingredient' ? 'e.g. 2 tbsp unsalted butter' : undefined} />}
          </label>
          {addingIngredients && <p className="field-hint" id={linesHint}>One ingredient per line.</p>}
          {isStep && <label className="field">Duration (minutes)
            <input type="number" inputMode="decimal" step="any" min="0" required value={duration}
              placeholder="5" onChange={e => setDuration(e.target.value)} />
          </label>}
          {type !== 'ingredient' && <>
            <SourceChoices title="Ingredients used" choices={candidates.filter(n => n.type === 'ingredient')}
              selected={selected} onToggle={toggle} />
            <SourceChoices title={isStep ? 'Start after' : 'Finish after'} choices={candidates.filter(n => n.type === 'step')}
              selected={selected} onToggle={toggle} stepNames={getStepNames(nodes)} />
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        {reopened > 0 && <p className="edit-progress-hint" id={progressHint} role="status">
          Saving this change will reopen {reopened} completed {reopened === 1 ? 'step' : 'steps'}.
        </p>}
        <footer className="dialog-actions">
          {node && <button type="button" className="text-action danger" onClick={() => onDelete(node.id)}><DeleteOutlineIcon />Delete</button>}
          <button type="button" className="action secondary" onClick={onClose}>Cancel</button>
          <button className="action primary" type="submit" aria-describedby={reopened > 0 ? progressHint : undefined}>{submitLabel}</button>
        </footer>
      </form>
    </RecipeDialog>
  );
}
ItemEditor.propTypes = { type: PropTypes.string.isRequired, node: nodeShape, nodes: PropTypes.arrayOf(nodeShape).isRequired,
  edges: PropTypes.array.isRequired, onSave: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired, countReopened: PropTypes.func };

export function NewRecipeDialog({ onCreate, onClose }) {
  const [name, setName] = useState('');
  return (
    <RecipeDialog title="New recipe" onClose={onClose}>
      <form className="recipe-form" onSubmit={event => { event.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
        <div className="dialog-body">
          <label className="field">Recipe name<input required autoFocus value={name} placeholder="What are you cooking?"
            onChange={e => setName(e.target.value)} /></label>
        </div>
        <footer className="dialog-actions"><button type="button" className="action secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="action primary" disabled={!name.trim()}>Create recipe</button></footer>
      </form>
    </RecipeDialog>
  );
}
NewRecipeDialog.propTypes = { onCreate: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired };

export function RecipeBoxDialog({ entries, activeId, onOpen, onImport, onExample, onRemove, onClose }) {
  const [examples, setExamples] = useState(false);
  return (
    <RecipeDialog title={examples ? 'Add an example' : 'Recipe box'} onClose={onClose}>
      {examples ? <>
        <div className="dialog-body library-list">
          {[['beer-cheese', 'Beer Cheese Dip', '15 min'], ['stir-fry', 'Veggie Stir Fry', '9 min']].map(([id, title, time]) =>
            <button type="button" key={id} className="library-row" autoFocus={id === 'beer-cheese'}
              onClick={() => onExample(id)} aria-label={`Add ${title}`}>
              <RecipePhoto cover={id} />
              <span className="library-detail"><strong>{title}</strong><small>{time}</small></span>
              <ChevronRightIcon aria-hidden="true" />
            </button>)}
        </div>
        <footer className="dialog-actions"><button className="action secondary" onClick={() => setExamples(false)}>Back to recipe box</button></footer>
      </> : <>
      <div className="dialog-body library-list">
        {entries.map(entry => (
          <div key={entry.id} className="library-entry"><button type="button" onClick={() => onOpen(entry.id)} className="library-row"
            aria-label={`Open ${entry.title}`}>
            {entry.cover ? <RecipePhoto cover={entry.cover} /> : <span className="library-art"><RestaurantMenuIcon /></span>}
            <span className="library-detail"><strong>{entry.title}</strong><small>
              {entry.completedCount ? `${entry.completedCount} of ${entry.stepCount} steps done` : `${entry.stepCount} ${entry.stepCount === 1 ? 'step' : 'steps'}`} · {entry.totalMinutes} min</small></span>
            {entry.id === activeId ? <span className="library-current">Open</span> : <ChevronRightIcon />}
          </button>{entries.length > 1 && <button className="icon-button remove-recipe"
            title={`Remove ${entry.title} from recipe box`} aria-label={`Remove ${entry.title} from recipe box`}
            onClick={() => onRemove(entry)}><DeleteOutlineIcon /></button>}</div>
        ))}
      </div>
      <footer className="dialog-actions"><button className="text-action" onClick={() => setExamples(true)}>Add example recipe</button>
        <button className="action secondary" onClick={onImport}><FileOpenOutlinedIcon />Import recipe</button></footer>
      </>}
    </RecipeDialog>
  );
}
RecipeBoxDialog.propTypes = { entries: PropTypes.arrayOf(PropTypes.object).isRequired, activeId: PropTypes.string.isRequired,
  onOpen: PropTypes.func.isRequired, onImport: PropTypes.func.isRequired, onExample: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired };

export function PhotoDialog({ cover, onSave, onClose }) {
  const [draft, setDraft] = useState(cover);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  async function choose(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setProcessing(true);
    setError('');
    try {
      setDraft(await prepareRecipePhoto(file));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setProcessing(false);
    }
  }
  return (
    <RecipeDialog title="Recipe photo" onClose={onClose}>
      <div className="dialog-body photo-editor">
        {draft && <RecipePhoto cover={draft} alt="Recipe photo preview" />}
        <div className="photo-tools"><button type="button" disabled={processing} className="action secondary"
          onClick={() => input.current.click()}><AddPhotoAlternateOutlinedIcon />{processing ? 'Preparing photo…' : 'Choose photo'}</button>
          {draft && <button type="button" className="text-action" disabled={processing} onClick={() => { setDraft(null); setError(''); }}>Remove photo</button>}</div>
        <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={choose} />
        <p className="photo-hint">Choose a JPEG, PNG, or WebP from your device.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="dialog-actions"><button className="action secondary" onClick={onClose}>Cancel</button>
        <button className="action primary" disabled={processing || draft === cover} onClick={() => onSave(draft)}>Save changes</button></footer>
    </RecipeDialog>
  );
}
PhotoDialog.propTypes = { cover: PropTypes.string, onSave: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired };
