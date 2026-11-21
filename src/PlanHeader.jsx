import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import AddIcon from '@mui/icons-material/Add';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import CloseFullscreenRounded from '@mui/icons-material/CloseFullscreenRounded';

export default function PlanHeader({ title, onAdd, expanded, onToggleExpanded }) {
  const expandButton = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    function escape(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.target.closest?.('[role="dialog"], [role="menu"]')) return;
      onToggleExpanded();
      expandButton.current?.focus({ preventScroll: true });
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [expanded, onToggleExpanded]);

  const label = expanded ? 'Exit expanded view' : 'Expand cooking plan';
  return (
    <header className={`plan-header${expanded ? ' plan-header--expanded' : ''}`}>
      <h2 title={expanded ? title : undefined}>{expanded ? title : 'Cooking plan'}</h2>
      <div className="plan-actions">
        <button type="button" ref={expandButton} className="text-action plan-expand"
          title={label} aria-label={label} aria-expanded={expanded} aria-controls="cooking-plan"
          onClick={onToggleExpanded}>
          {expanded ? <CloseFullscreenRounded /> : <OpenInFullRounded />}
          <span>{expanded ? 'Exit' : 'Expand'}</span>
        </button>
        <button type="button" className="action primary" onClick={onAdd}><AddIcon />Add step</button>
      </div>
    </header>
  );
}

PlanHeader.propTypes = { title: PropTypes.string.isRequired, onAdd: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired, onToggleExpanded: PropTypes.func.isRequired };
