import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
  ListItemIcon, Menu, MenuItem, TextField,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { MIN_STEP_WIDTH, PIXELS_PER_MINUTE } from './recipeTimeline.js';
import './RecipeNode.css';

const names = { ingredient: 'ingredient', step: 'step', finalDish: 'final dish' };
const minutes = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 15 });

export default function RecipeNode({ id, data, type, selected }) {
  const [menuPosition, setMenuPosition] = useState(null);
  const [draft, setDraft] = useState(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const isStep = type === 'step';
  const barWidth = isStep ? data.durationMinutes * PIXELS_PER_MINUTE : undefined;
  const lastBarWidth = useRef(barWidth);
  const duration = Number(draft?.duration);
  const canSave = draft?.label.trim() && (!isStep || (Number.isFinite(duration) && duration > 0));

  // A short bar can change length without changing the measured caption width.
  useLayoutEffect(() => {
    if (lastBarWidth.current !== barWidth) {
      lastBarWidth.current = barWidth;
      updateNodeInternals(id);
    }
  }, [id, barWidth, updateNodeInternals]);

  function openMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition({ top: event.clientY, left: event.clientX });
  }

  function editNode() {
    setMenuPosition(null);
    setDraft({ label: data.label, duration: data.durationMinutes });
  }

  function saveNode(event) {
    event.preventDefault();
    if (canSave) {
      data.onEdit(id, draft.label.trim(), isStep ? duration : undefined);
      setDraft(null);
    }
  }

  return (
    <>
      <div
        className={`recipe-node recipe-node--${type}${selected ? ' recipe-node--selected' : ''}`}
        style={{
          '--node-color': data.background,
          '--bar-width': isStep ? `${barWidth}px` : undefined,
          '--caption-width': `${MIN_STEP_WIDTH}px`,
        }}
        onContextMenu={openMenu}
      >
        {isStep ? (
          <>
            <div className="recipe-node__bar">
              <Handle type="target" position={Position.Left} />
              <Handle type="source" position={Position.Right} />
            </div>
            <div className="recipe-node__caption">
              <strong>{data.label}</strong>
              <div className="recipe-node__time">
                {minutes.format(data.startMinute)}–{minutes.format(data.endMinute)} min
                {' · '}{minutes.format(data.durationMinutes)} min long
              </div>
            </div>
          </>
        ) : (
          <>
            <strong>{data.label}</strong>
            {type === 'ingredient' && <Handle type="source" position={Position.Right} />}
            {type === 'finalDish' && (
              <>
                <Handle type="target" position={Position.Left} />
                {Number.isFinite(data.endMinute) && (
                  <div className="recipe-node__time">Ready at {minutes.format(data.endMinute)} min</div>
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
      {draft && (
        <Dialog
          open
          className="nokey"
          onClose={() => setDraft(null)}
          aria-labelledby={`edit-title-${id}`}
          fullWidth
          maxWidth="xs"
        >
          <form onSubmit={saveNode}>
            <DialogTitle id={`edit-title-${id}`}>Edit {names[type]}</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus required fullWidth margin="dense"
                label={isStep ? 'Step description' : 'Name'}
                value={draft.label}
                onChange={event => setDraft({ ...draft, label: event.target.value })}
              />
              {isStep && (
                <TextField
                  required fullWidth margin="dense" type="number" label="Duration (minutes)"
                  inputProps={{ min: 0, step: 'any' }}
                  value={draft.duration}
                  onChange={event => setDraft({ ...draft, duration: event.target.value })}
                />
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={!canSave}>Save</Button>
            </DialogActions>
          </form>
        </Dialog>
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
    background: PropTypes.string,
    durationMinutes: PropTypes.number,
    startMinute: PropTypes.number,
    endMinute: PropTypes.number,
    onEdit: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
  }).isRequired,
};
