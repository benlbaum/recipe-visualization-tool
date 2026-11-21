import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { getCookingSteps } from './cookingProgress.js';
import { formatStepInterval, getStepNames } from './recipeTimeline.js';
import './CookingMethod.css';

const minutes = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 15 });

export default function CookingMethod({
  nodes, edges, completedStepIds, onToggleStep, onResetSteps, onEdit, onAdd, scrollRef,
  readyOnly, onReadyOnlyChange,
}) {
  const rows = useRef(new Map());
  const readyButton = useRef(null);
  const finish = useRef(null);
  const pendingFocus = useRef(null);
  const [trail, setTrail] = useState([]);
  const previous = trail.at(-1);
  const ordered = useMemo(() => [...getCookingSteps(nodes, edges, completedStepIds).values()]
    .sort((a, b) => a.step.data.startMinute - b.step.data.startMinute), [nodes, edges, completedStepIds]);
  const names = useMemo(() => getStepNames(nodes), [nodes]);
  const ready = ordered.filter(entry => !entry.done && !entry.waitingOn.length);
  const doneIds = new Set(ordered.filter(entry => entry.done).map(entry => entry.step.id));
  const doneCount = doneIds.size;
  const allDone = ordered.length > 0 && doneCount === ordered.length;
  const visible = readyOnly ? ready : ordered;
  const groups = new Map();
  for (const entry of visible) {
    const start = entry.step.data.startMinute;
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(entry);
  }

  function focusStep(id, checkbox = false) {
    const row = rows.current.get(id);
    if (!row) return;
    const target = checkbox ? row.querySelector('input') : row;
    target.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function revealStep(id, onlyReady) {
    pendingFocus.current = { jump: id, onlyReady };
    if (onlyReady !== readyOnly) onReadyOnlyChange(onlyReady);
  }

  function followPrerequisite(from, to) {
    setTrail([...(previous?.to === from ? trail : []), { from, to, onlyReady: readyOnly }]);
    revealStep(to, readyOnly && ready.some(entry => entry.step.id === to));
  }

  function returnToStep() {
    setTrail(trail.slice(0, -1));
    revealStep(previous.from, previous.onlyReady && ready.some(entry => entry.step.id === previous.from));
  }

  function filter(onlyReady) {
    if (onlyReady === readyOnly) return;
    setTrail([]);
    onReadyOnlyChange(onlyReady);
  }

  useLayoutEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    if (request.finish) {
      if (!allDone) return;
      finish.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (request.jump) {
      if (request.onlyReady !== readyOnly || !rows.current.has(request.jump)) return;
      focusStep(request.jump);
    } else if (rows.current.has(request.toggled)) {
      return;
    } else if (ready.length) {
      const next = ready[Math.min(request.index, ready.length - 1)].step.id;
      focusStep(next, true);
    } else {
      readyButton.current?.focus();
    }
    pendingFocus.current = null;
  });

  function toggleStep(id) {
    if (readyOnly) pendingFocus.current = { toggled: id, index: ready.findIndex(entry => entry.step.id === id) };
    else if (!doneIds.has(id) && doneCount + 1 === ordered.length) pendingFocus.current = { finish: true };
    onToggleStep(id);
  }

  if (!ordered.length) {
    return (
      <section ref={scrollRef} className="method-panel cooking-method method-empty" aria-label="Cooking method">
        <h2>Add your first step</h2>
        <p>Give the step a duration to start the cooking schedule.</p>
        <button type="button" className="recipe-panel-add" onClick={onAdd}><AddIcon /> Add step</button>
      </section>
    );
  }

  return (
    <section ref={scrollRef} className="method-panel cooking-method" aria-label="Cooking method">
      <div className="cook-sheet">
        <header className="cook-header">
          <div className="cook-summary">
            <h2 aria-live="polite" aria-atomic="true">{doneCount} of {ordered.length} {ordered.length === 1 ? 'step' : 'steps'} done</h2>
            <progress value={doneCount} max={ordered.length} aria-label="Cooking progress" />
          </div>
          {doneCount > 0 && !allDone && <button className="cook-restart" type="button" onClick={onResetSteps}>
            <ReplayIcon aria-hidden="true" />Restart
          </button>}
        </header>
        <div className="cook-tools">
          <div className="cook-filters" role="group" aria-label="Method filter">
            <button type="button" aria-pressed={!readyOnly} onClick={() => filter(false)}>Full schedule</button>
            <button ref={readyButton} type="button" aria-label="Ready now" aria-pressed={readyOnly} onClick={() => filter(true)}>
              Ready now <span aria-hidden="true">{ready.length}</span>
            </button>
          </div>
        </div>
        {readyOnly && !ready.length && !allDone && <div className="cook-filter-empty">
          <p>No steps are ready yet.</p>
          <button type="button" onClick={() => filter(false)}>View full schedule</button>
        </div>}
        {[...groups].map(([start, group]) => (
          <div className="cook-group" key={start}>
            <div className="cook-group-heading">
              <h3>Minute {minutes.format(start)}</h3>
              {group.length > 1 && <span>{group.length} steps can start together</span>}
            </div>
            <ul className="cook-steps">
              {group.map(({ step, ingredients, prerequisites, waitingOn, done }) => {
                const waiting = waitingOn.length > 0;
                const state = done ? 'done' : waiting ? 'waiting' : 'ready';
                const name = names.get(step.id);
                return (
                  <li key={step.id} tabIndex={-1} aria-label={name} className={`cook-row is-${state}`}
                    ref={row => { if (row) rows.current.set(step.id, row); else rows.current.delete(step.id); }}>
                    {previous?.to === step.id && names.has(previous.from) &&
                      <button type="button" className="cook-back" onClick={returnToStep}>
                        <ArrowBackIcon aria-hidden="true" />Back to {names.get(previous.from)}
                      </button>}
                    <label className="cook-check">
                      <input type="checkbox" checked={done} disabled={waiting} aria-label={name}
                        onChange={() => toggleStep(step.id)} />
                    </label>
                    <div className="cook-instruction">
                      <div className="cook-meta">
                        <span className="cook-interval">{formatStepInterval(step)}</span>
                        <span className="cook-state">{done ? 'Done' : waiting ? 'Waiting' : 'Ready'}</span>
                      </div>
                      <h4>{step.data.label}</h4>
                      {ingredients.length > 0 && <p className="cook-ingredients"><strong>Ingredients</strong>{' '}
                        {ingredients.map(ingredient => ingredient.data.label).join(' · ')}</p>}
                      {[
                        ['Waiting for', waitingOn],
                        ['After', prerequisites.filter(input => doneIds.has(input.id))],
                      ].map(([heading, inputs]) => inputs.length > 0 && (
                        <div key={heading} className="cook-prerequisites">
                          <strong>{heading}</strong>
                          {inputs.map(input => (
                            <button type="button" key={input.id} aria-label={`Go to ${names.get(input.id)}`}
                              onClick={() => followPrerequisite(step.id, input.id)}>{names.get(input.id)}</button>
                          ))}
                        </div>
                      ))}
                    </div>
                    <button type="button" aria-label={`Edit ${name}`} title={`Edit ${step.data.label}`}
                      className="recipe-panel-edit" onClick={() => onEdit(step.id)}><EditOutlinedIcon aria-hidden="true" /></button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {allDone && <div ref={finish} className="cook-finish">
          <CheckCircleOutlineIcon aria-hidden="true" /><h3>Ready to serve</h3>
          <button className="cook-restart" type="button" onClick={onResetSteps}><ReplayIcon aria-hidden="true" />Cook again</button>
        </div>}
      </div>
    </section>
  );
}

CookingMethod.propTypes = {
  nodes: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired, type: PropTypes.string.isRequired, data: PropTypes.object.isRequired,
  })).isRequired,
  edges: PropTypes.arrayOf(PropTypes.shape({ source: PropTypes.string, target: PropTypes.string })).isRequired,
  completedStepIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  readyOnly: PropTypes.bool.isRequired,
  onReadyOnlyChange: PropTypes.func.isRequired,
  onToggleStep: PropTypes.func.isRequired,
  onResetSteps: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
  scrollRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
};
