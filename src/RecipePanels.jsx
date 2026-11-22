import PropTypes from 'prop-types';
import { useLayoutEffect, useRef } from 'react';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import './RecipePanels.css';

const nodeType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    startMinute: PropTypes.number,
    endMinute: PropTypes.number,
  }).isRequired,
});

function EditButton({ node, onEdit }) {
  const label = `Edit ${node.data.label}`;
  return (
    <button type="button" className="recipe-panel-edit" aria-label={label} title={label}
      onClick={() => onEdit(node.id)}>
      <EditOutlinedIcon aria-hidden="true" />
    </button>
  );
}
EditButton.propTypes = { node: nodeType.isRequired, onEdit: PropTypes.func.isRequired };

export function IngredientsPanel({ nodes, checkedIds, onToggle, onReset, onAdd, onEdit, onCook, scrollRef,
  neededOnly, onNeededChange }) {
  const ingredients = nodes.filter(node => node.type === 'ingredient');
  const ready = ingredients.filter(node => checkedIds.has(node.id)).length;
  const shown = neededOnly ? ingredients.filter(node => !checkedIds.has(node.id)) : ingredients;
  const checklist = useRef(null);
  const filter = useRef(null);
  const goToMethod = useRef(null);
  const nextIndex = useRef(null);

  useLayoutEffect(() => {
    if (nextIndex.current === null) return;
    const inputs = checklist.current.querySelectorAll('input');
    const target = inputs[Math.min(nextIndex.current, inputs.length - 1)] ?? goToMethod.current ?? filter.current;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest' });
    nextIndex.current = null;
  });

  function check(id, index) {
    if (neededOnly) nextIndex.current = index;
    onToggle(id);
  }
  return (
    <section className="ingredient-panel" aria-label="Ingredient preparation" ref={checklist}>
      <header className="ingredient-panel-header">
        <h2>Ingredients</h2>
        <button type="button" className="recipe-panel-add" onClick={onAdd} aria-label="Add ingredient">
          <AddIcon aria-hidden="true" /> Add
        </button>
      </header>
      {ingredients.length > 0 ? (
        <>
          <div className="ingredient-progress">
            <span aria-live="polite">{ready} of {ingredients.length} ready</span>
            <progress value={ready} max={ingredients.length} aria-label="Ingredient preparation" />
            <button className="ingredient-filter" type="button" aria-pressed={neededOnly} ref={filter}
              onClick={() => onNeededChange(!neededOnly)}>Still needed</button>
          </div>
          <ul className="ingredient-checklist" ref={scrollRef}>
            {shown.map((node, index) => (
              <li key={node.id}>
                <label>
                  <input type="checkbox" checked={checkedIds.has(node.id)} onChange={() => check(node.id, index)} />
                  <span>{node.data.label}</span>
                </label>
                <EditButton node={node} onEdit={onEdit} />
              </li>
            ))}
          </ul>
          {neededOnly && !shown.length && <p className="ingredient-all-ready">Everything is gathered.</p>}
          {ready > 0 && <footer className="ingredient-actions">
            <button className="ingredient-reset" type="button" onClick={onReset}>Uncheck all</button>
            {onCook && ready === ingredients.length && nodes.some(node => node.type === 'step') &&
              <button className="action secondary" ref={goToMethod} onClick={onCook}>Go to method <ArrowForwardRoundedIcon /></button>}
          </footer>}
        </>
      ) : (
        <p className="ingredient-empty">Add the ingredients you want to gather before cooking.</p>
      )}
    </section>
  );
}
IngredientsPanel.propTypes = {
  nodes: PropTypes.arrayOf(nodeType).isRequired,
  checkedIds: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onCook: PropTypes.func,
  scrollRef: PropTypes.func,
  neededOnly: PropTypes.bool.isRequired,
  onNeededChange: PropTypes.func.isRequired,
};
