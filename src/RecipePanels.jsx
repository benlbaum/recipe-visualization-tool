import PropTypes from 'prop-types';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import './RecipePanels.css';

const minutes = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 15 });
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

export function IngredientsPanel({ nodes, checkedIds, onToggle, onReset, onAdd, onEdit }) {
  const ingredients = nodes.filter(node => node.type === 'ingredient');
  const ready = ingredients.filter(node => checkedIds.has(node.id)).length;
  return (
    <section className="ingredient-panel" aria-label="Ingredient preparation">
      <header className="ingredient-panel-header">
        <h2>Ingredients</h2>
        <button type="button" className="recipe-panel-add" onClick={onAdd} aria-label="Add ingredient">
          <AddIcon aria-hidden="true" /> Add
        </button>
      </header>
      {ingredients.length > 0 ? (
        <>
          <div className="ingredient-progress">
            <span>{ready} of {ingredients.length} ready</span>
            <progress value={ready} max={ingredients.length} aria-label="Ingredient preparation" />
            {ready > 0 && <button className="ingredient-reset" type="button" onClick={onReset}>Uncheck all</button>}
          </div>
          <ul className="ingredient-checklist">
            {ingredients.map(node => (
              <li key={node.id}>
                <label>
                  <input type="checkbox" checked={checkedIds.has(node.id)} onChange={() => onToggle(node.id)} />
                  <span>{node.data.label}</span>
                </label>
                <EditButton node={node} onEdit={onEdit} />
              </li>
            ))}
          </ul>
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
};

export function MethodPanel({ nodes, edges, onEdit, onAdd }) {
  const steps = nodes.filter(node => node.type === 'step')
    .sort((a, b) => a.data.startMinute - b.data.startMinute);
  if (steps.length === 0) {
    return (
      <section className="method-panel method-empty" aria-label="Cooking method">
        <h2>Add your first step</h2>
        <p>Give the step a duration to start the cooking schedule.</p>
        <button type="button" className="recipe-panel-add" onClick={onAdd}>
          <AddIcon aria-hidden="true" /> Add step
        </button>
      </section>
    );
  }

  const byId = new Map(nodes.map(node => [node.id, node]));
  const inputs = new Map(steps.map(node => [node.id, new Set()]));
  for (const edge of edges) {
    const source = byId.get(edge.source);
    if (source) inputs.get(edge.target)?.add(source);
  }
  const groups = new Map();
  for (const step of steps) {
    const start = step.data.startMinute;
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(step);
  }

  return (
    <section className="method-panel" aria-label="Cooking method">
      {[...groups].map(([start, group]) => (
        <div className="method-group" key={start}>
          {group.length > 1 && <p className="method-together">{group.length} steps start together at minute {minutes.format(start)}</p>}
          <ul className="method-steps">
            {group.map(step => {
              const sources = [...inputs.get(step.id)];
              const ingredients = sources.filter(node => node.type === 'ingredient');
              const dependencies = sources.filter(node => node.type === 'step');
              return (
                <li key={step.id}>
                  <span className="method-time">{minutes.format(start)}–{minutes.format(step.data.endMinute)} min</span>
                  <div className="method-instruction">
                    <h3>{step.data.label}</h3>
                    {(ingredients.length > 0 || dependencies.length > 0) && (
                      <dl className="method-inputs">
                        {ingredients.length > 0 && <div><dt>Ingredients</dt><dd>{ingredients.map(node => node.data.label).join(' · ')}</dd></div>}
                        {dependencies.length > 0 && <div><dt>After</dt><dd>{dependencies.map(node => node.data.label).join(' · ')}</dd></div>}
                      </dl>
                    )}
                  </div>
                  <EditButton node={step} onEdit={onEdit} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
MethodPanel.propTypes = {
  nodes: PropTypes.arrayOf(nodeType).isRequired,
  edges: PropTypes.arrayOf(PropTypes.shape({ source: PropTypes.string, target: PropTypes.string })).isRequired,
  onEdit: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
};
