import { useLayoutEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useReactFlow, useStoreApi } from 'reactflow';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { getStepNames, MIN_STEP_WIDTH } from './recipeTimeline.js';

function RelatedItems({ label, items, names, onNavigate }) {
  if (!items.length) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd className="selection-detail__links">
        {items.map(item => (
          <button key={item.id} type="button" onClick={() => onNavigate(item.id)}>
            <span>{item.data.label}</span>
            {item.type === 'step' && <small>{names.get(item.id).slice(item.data.label.length + 2)}</small>}
          </button>
        ))}
      </dd>
    </div>
  );
}
RelatedItems.propTypes = { label: PropTypes.string.isRequired, items: PropTypes.array.isRequired, names: PropTypes.instanceOf(Map).isRequired,
  onNavigate: PropTypes.func.isRequired };

// Text access to the same connections as the canvas, including ingredients
// whose nodes are hidden while planning.
export default function SelectionDetails({ node, nodes, edges, onEdit, onClose, onNavigate }) {
  const heading = useRef(null);
  const destination = useRef(null);
  const { getNode, getViewport, setViewport } = useReactFlow();
  const store = useStoreApi();
  const names = useMemo(() => getStepNames(nodes), [nodes]);

  useLayoutEffect(() => {
    if (destination.current !== node.id) return;
    heading.current.focus({ preventScroll: true });
    heading.current.closest('aside').scrollTop = 0;
    // A different inspector height can resize the plot. Reveal the caption in
    // that new viewport, preserving the cook's zoom and any already visible row.
    const frame = requestAnimationFrame(() => {
      destination.current = null;
      const target = getNode(node.id);
      const plot = store.getState().domNode;
      if (!target || !plot) return;
      const { x, y, zoom } = getViewport();
      const left = target.position.x * zoom + x;
      const top = target.position.y * zoom + y;
      const maxLeft = Math.max(14, plot.clientWidth - MIN_STEP_WIDTH * zoom - 14);
      const maxTop = Math.max(14, plot.clientHeight - (target.height || 0) * zoom - 60);
      const dx = Math.min(Math.max(left, 14), maxLeft) - left;
      const dy = Math.min(Math.max(top, 14), maxTop) - top;
      if (dx || dy) setViewport({ x: x + dx, y: y + dy, zoom });
    });
    return () => cancelAnimationFrame(frame);
  }, [node.id, getNode, getViewport, setViewport, store]);

  function navigate(id) {
    destination.current = id;
    onNavigate(id);
  }

  const incomingIds = new Set(edges.filter(edge => edge.target === node.id).map(edge => edge.source));
  const outgoingIds = new Set(edges.filter(edge => edge.source === node.id).map(edge => edge.target));
  const incoming = nodes.filter(item => incomingIds.has(item.id));
  const ingredients = incoming.filter(item => item.type === 'ingredient');
  const prerequisites = incoming.filter(item => item.type === 'step');
  const following = nodes.filter(item => outgoingIds.has(item.id));
  return (
    <aside className="selection-detail" aria-label="Selected item details">
      <header>
        <div>
          <h3 ref={heading} tabIndex={-1} aria-label={names.get(node.id)}>{node.data.label}</h3>
          {node.type === 'step' && <small>{names.get(node.id).slice(node.data.label.length + 2)}</small>}
        </div>
        <button className="icon-button" aria-label="Edit selected item" title="Edit selected item" onClick={() => onEdit(node.id)}><EditOutlinedIcon /></button>
        <button className="icon-button" aria-label="Clear selection" title="Clear selection" onClick={onClose}><CloseRoundedIcon /></button>
      </header>
      <dl>
        {ingredients.length > 0 && <div><dt>Ingredients</dt><dd>{ingredients.map(item => item.data.label).join(' · ')}</dd></div>}
        <RelatedItems label="Starts after" items={prerequisites} names={names} onNavigate={navigate} />
        <RelatedItems label={node.type === 'ingredient' ? 'Used in' : 'Followed by'} items={following} names={names} onNavigate={navigate} />
        {node.type === 'step' && !following.length && <div><dt>Followed by</dt><dd>No connection yet</dd></div>}
      </dl>
    </aside>
  );
}
SelectionDetails.propTypes = { node: PropTypes.object.isRequired, nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired, onEdit: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired,
  onNavigate: PropTypes.func.isRequired };
