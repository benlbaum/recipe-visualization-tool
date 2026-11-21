import PropTypes from 'prop-types';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

// Text access to the same connections as the canvas, including ingredients
// whose nodes are hidden while planning.
export default function SelectionDetails({ node, nodes, edges, onEdit, onClose }) {
  const incomingIds = new Set(edges.filter(edge => edge.target === node.id).map(edge => edge.source));
  const outgoingIds = new Set(edges.filter(edge => edge.source === node.id).map(edge => edge.target));
  const incoming = nodes.filter(item => incomingIds.has(item.id));
  const ingredients = incoming.filter(item => item.type === 'ingredient');
  const prerequisites = incoming.filter(item => item.type === 'step');
  const following = nodes.filter(item => outgoingIds.has(item.id));
  return (
    <aside className="selection-detail" aria-label="Selected item details">
      <header>
        <div><strong>{node.data.label}</strong>{node.type === 'step' && <small>{node.data.startMinute}–{node.data.endMinute} min</small>}</div>
        <button className="icon-button" aria-label="Edit selected item" title="Edit selected item" onClick={() => onEdit(node.id)}><EditOutlinedIcon /></button>
        <button className="icon-button" aria-label="Clear selection" title="Clear selection" onClick={onClose}><CloseRoundedIcon /></button>
      </header>
      <dl>
        {ingredients.length > 0 && <div><dt>Ingredients</dt><dd>{ingredients.map(item => item.data.label).join(' · ')}</dd></div>}
        {prerequisites.length > 0 && <div><dt>Starts after</dt><dd>{prerequisites.map(item => item.data.label).join(' · ')}</dd></div>}
        {following.length > 0 && <div><dt>{node.type === 'ingredient' ? 'Used in' : 'Followed by'}</dt><dd>{following.map(item => item.data.label).join(' · ')}</dd></div>}
      </dl>
    </aside>
  );
}
SelectionDetails.propTypes = { node: PropTypes.object.isRequired, nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired, onEdit: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired };
