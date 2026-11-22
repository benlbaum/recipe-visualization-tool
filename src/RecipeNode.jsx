import { useLayoutEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { ListItemIcon, Menu, MenuItem } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/EditOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import { formatStepInterval, MIN_STEP_WIDTH, PIXELS_PER_MINUTE } from './recipeTimeline.js';
import './RecipeNode.css';

const names = { ingredient: 'ingredient', step: 'step', finalDish: 'final dish' };
const minutes = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 15 });

export default function RecipeNode({ id, data, type, selected }) {
  const [menuPosition, setMenuPosition] = useState(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const isStep = type === 'step';
  const barWidth = isStep ? data.barWidth ?? data.durationMinutes * (data.pixelsPerMinute ?? PIXELS_PER_MINUTE) : undefined;
  // Moving a port within a card need not change its measured dimensions.
  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, barWidth, data.startInset, data.barOffset, data.captionAbove, data.captionWidth, data.label, updateNodeInternals]);

  function openMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition({ top: event.clientY, left: event.clientX });
  }

  function editNode() {
    setMenuPosition(null);
    data.onRequestEdit(id);
  }

  const editButton = (
    <button type="button" className="recipe-node__edit nodrag nopan nokey"
      aria-label={`Edit ${data.editLabel ?? data.label}`} title={`Edit ${names[type]}`}
      onClick={event => { event.stopPropagation(); editNode(); }}>
      <EditIcon />
    </button>
  );

  return (
    <>
      <div
        className={`recipe-node recipe-node--${type}${selected ? ' recipe-node--selected' : ''}${data.captionAbove ? ' recipe-node--caption-above' : ''}`}
        style={{
          '--bar-width': isStep ? `${barWidth}px` : undefined,
          '--bar-offset': `${data.barOffset ?? 0}px`,
          '--start-inset': `${data.startInset ?? 0}px`,
          '--caption-width': `${data.captionWidth ?? MIN_STEP_WIDTH}px`,
        }}
        onContextMenu={openMenu}
      >
        {isStep ? (
          <>
            <div className={`recipe-node__bar${barWidth < 18 ? ' recipe-node__bar--short' : ''}`}>
              <Handle type="target" position={Position.Left} />
              <Handle type="source" position={Position.Right} />
            </div>
            <div className="recipe-node__caption">
              {editButton}
              <strong>{data.done && <CheckCircleOutline className="recipe-node__done" titleAccess="Completed" />}{data.label}</strong>
              <div className="recipe-node__time">
                <b>{formatStepInterval({ data })}</b>
                {' · '}{minutes.format(data.durationMinutes)} min long
              </div>
            </div>
          </>
        ) : (
          <>
            {editButton}
            <strong>{data.label}</strong>
            {type === 'ingredient' && <Handle type="source" position={Position.Right} />}
            {type === 'finalDish' && (
              <>
                <Handle type="target" position={Position.Left} />
                {Number.isFinite(data.endMinute) && (
                  <div className="recipe-node__time"><CheckCircleOutline />Ready at {minutes.format(data.endMinute)} min</div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {menuPosition && (
        <Menu
          open
          className="nokey"
          onClose={() => setMenuPosition(null)}
          anchorReference="anchorPosition"
          anchorPosition={menuPosition}
        >
          <MenuItem onClick={editNode}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>Edit
          </MenuItem>
          <MenuItem onClick={() => { setMenuPosition(null); data.onDelete(id); }}>
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>Delete
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

RecipeNode.propTypes = {
  id: PropTypes.string.isRequired,
  type: PropTypes.oneOf(Object.keys(names)).isRequired,
  selected: PropTypes.bool,
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    editLabel: PropTypes.string,
    done: PropTypes.bool,
    durationMinutes: PropTypes.number,
    pixelsPerMinute: PropTypes.number,
    startInset: PropTypes.number,
    barWidth: PropTypes.number,
    barOffset: PropTypes.number,
    captionWidth: PropTypes.number,
    captionAbove: PropTypes.bool,
    startMinute: PropTypes.number,
    endMinute: PropTypes.number,
    onRequestEdit: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
  }).isRequired,
};
