import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import useMediaQuery from '@mui/material/useMediaQuery';
import ReactFlow, {
  BaseEdge, BezierEdge, getNodesBounds, MarkerType, Panel, useNodesInitialized,
  useReactFlow, useStore, useViewport,
} from 'reactflow';
import AddRounded from '@mui/icons-material/AddRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined';
import RecipeNode from './RecipeNode.jsx';
import { getStepNames, layoutRecipe, MIN_STEP_WIDTH, PIXELS_PER_MINUTE, timelineCards } from './recipeTimeline.js';
import 'reactflow/dist/style.css';
import './TimelineCanvas.css';

const nodeTypes = { ingredient: RecipeNode, step: RecipeNode, finalDish: RecipeNode };
function TimelineEdge(props) {
  const { sourceX, targetX, sourceY, targetY, id, markerStart, markerEnd, style, interactionWidth } = props;
  const gap = targetX - sourceX;
  const dy = targetY - sourceY;
  if (!props.data?.cookingLink) return <BezierEdge {...props} />;
  let path;
  if (gap >= MIN_STEP_WIDTH && Math.abs(dy) < 2) {
    // Lift long same-row links over any intermediate bars.
    path = `M ${sourceX} ${sourceY}
    C ${sourceX + 16} ${sourceY} ${sourceX + 16} ${sourceY - 18} ${sourceX + 34} ${sourceY - 18}
    L ${targetX - 34} ${targetY - 18}
    C ${targetX - 16} ${targetY - 18} ${targetX - 16} ${targetY} ${targetX} ${targetY}`;
  } else {
    // ReactFlow reports the outer edges of the 10px ports. On tiny bars
    // those edges can overlap even though the port centers are in time order.
    const overlap = Math.min(5, Math.max(0, -gap / 2));
    const start = sourceX - overlap;
    const end = targetX + overlap;
    const turn = end - Math.min(20, (end - start) / 2);
    const radius = Math.max(0, Math.min(10, end - turn, Math.abs(dy) / 2));
    const rise = Math.sign(dy) * radius;
    path = `M ${start} ${sourceY} H ${turn - radius}
      Q ${turn} ${sourceY} ${turn} ${sourceY + rise} V ${targetY - rise}
      Q ${turn} ${targetY} ${turn + radius} ${targetY} H ${end}`;
  }
  return <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd}
    label={props.label} labelX={(sourceX + targetX) / 2} labelY={sourceY}
    labelStyle={props.labelStyle} labelShowBg={props.labelShowBg} labelBgStyle={props.labelBgStyle}
    labelBgPadding={props.labelBgPadding} labelBgBorderRadius={props.labelBgBorderRadius}
    style={style} interactionWidth={interactionWidth} />;
}
TimelineEdge.propTypes = {
  id: PropTypes.string.isRequired, sourceX: PropTypes.number.isRequired, sourceY: PropTypes.number.isRequired,
  targetX: PropTypes.number.isRequired, targetY: PropTypes.number.isRequired,
  markerStart: PropTypes.string, markerEnd: PropTypes.string, label: PropTypes.node,
  style: PropTypes.object, interactionWidth: PropTypes.number,
  data: PropTypes.object, labelStyle: PropTypes.object, labelShowBg: PropTypes.bool,
  labelBgStyle: PropTypes.object, labelBgPadding: PropTypes.array, labelBgBorderRadius: PropTypes.number,
};
const edgeTypes = { custom: TimelineEdge, default: TimelineEdge };
const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11, color: '#67826f' },
};
const minZoom = 0.05;
const maxZoom = 3;

const formatMinute = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 15 });

function TimelineScale({ pixelsPerMinute, total }) {
  const { x, zoom } = useViewport();
  const width = useStore(state => state.width);
  const scale = zoom * pixelsPerMinute;
  const minimum = Math.max(1, 64 / scale);
  const magnitude = 10 ** Math.floor(Math.log10(minimum));
  const interval = [1, 2, 5, 10].find(value => value * magnitude >= minimum) * magnitude;
  const spacing = interval * scale;
  const first = Math.max(0, Math.ceil(-x / spacing));
  const last = Math.min(Math.floor((width - x) / spacing), Math.floor(total / interval));
  const count = Math.max(0, last - first + 1);
  const finish = x + total * scale;

  return (
    <div className="timeline-scale" aria-label="Elapsed cooking time in minutes">
      {Array.from({ length: count }, (_, index) => {
        const tick = first + index;
        const left = x + tick * spacing;
        if (tick && finish - left < 43) return null;
        return (
          <div className="timeline-scale__tick" key={tick} style={{ left }}>
            {(!total || tick || total * scale >= 43) ? <span>{tick * interval} min</span> : null}
          </div>
        );
      })}
      {total > 0 && finish >= 0 && finish <= width && (
        <div className="timeline-scale__tick timeline-scale__tick--finish" style={{ left: finish }}
          aria-label={`Recipe ready at ${formatMinute.format(total)} minutes`}>
          <span>{formatMinute.format(total)} min</span>
        </div>
      )}
    </div>
  );
}
TimelineScale.propTypes = { pixelsPerMinute: PropTypes.number.isRequired, total: PropTypes.number.isRequired };

function useChartScale(nodes, total, width, height, version, showIngredients, fitRequest, cards) {
  const [scale, setScale] = useState(PIXELS_PER_MINUTE);
  const lastFrame = useRef(null);
  useLayoutEffect(() => {
    const last = lastFrame.current;
    if (!width || !height || (last && last.version === version && last.showIngredients === showIngredients &&
      last.fitRequest === fitRequest && last.cards === cards &&
      Math.abs(width - last.width) < 96 && (last.hadSteps || !total))) return;
    // Allocate spare space to the time axis. Keep this scale while the cook edits
    // a recipe so changing a duration visibly changes its bar and dependents.
    const shown = showIngredients ? nodes : nodes.filter(node => node.type !== 'ingredient');
    let top = Infinity;
    let bottom = -Infinity;
    for (const node of shown) {
      top = Math.min(top, node.position.y);
      bottom = Math.max(bottom, node.position.y + (node.height || 100));
    }
    const overviewZoom = Math.max(0.86, Math.min(1.02, (height - 62) / Math.max(1, bottom - top)));
    const available = Math.max(240, (width - 56) / overviewZoom - cards.maxWidth - (showIngredients ? cards.maxWidth + 90 : 0));
    // Give a typical step room for its caption on a phone. The cook can pan
    // along the sequence at reading size or choose Fit all for the overview.
    const durations = shown.filter(node => node.type === 'step').map(node => node.data.durationMinutes).sort((a, b) => a - b);
    // A wider time scale lets short consecutive steps share a landscape row.
    const landscape = cards === timelineCards.landscape;
    const middle = Math.floor((durations.length - (landscape ? 1 : 0)) / 2);
    const typicalDuration = durations[middle] || 1;
    const readingScale = landscape || width < 600 ? cards.maxWidth / typicalDuration : 0;
    setScale(total ? Math.min(180, Math.max(readingScale, available / total)) : PIXELS_PER_MINUTE);
    lastFrame.current = { width, version, showIngredients, fitRequest, cards, hadSteps: total > 0 };
  }, [nodes, total, width, height, version, showIngredients, fitRequest, cards]);
  // Guard transient frames and edits far larger than the originally fitted
  // recipe. CSS and ReactFlow need finite, representable pixel coordinates.
  return total > 0 ? Math.min(scale, 1_000_000 / total) : scale;
}

function ViewportControls({ onFit }) {
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Panel position="bottom-left" className="timeline-controls">
      <button type="button" title="Zoom out" aria-label="Zoom out" disabled={zoom <= minZoom}
        onClick={() => zoomOut({ duration: 120 })}><RemoveRounded /></button>
      <span className="timeline-controls__percent" aria-label="Zoom level">{Math.round(zoom * 100)}%</span>
      <button type="button" title="Zoom in" aria-label="Zoom in" disabled={zoom >= maxZoom}
        onClick={() => zoomIn({ duration: 120 })}><AddRounded /></button>
      <button type="button" title="Fit visible recipe to view" aria-label="Fit visible recipe to view"
        className="timeline-controls__fit"
        onClick={onFit}>
        <FitScreenOutlined /> Fit all
      </button>
    </Panel>
  );
}
ViewportControls.propTypes = { onFit: PropTypes.func.isRequired };

function FrameRecipe({ version, showIngredients, pixelsPerMinute, fitRequest, widePhone }) {
  const { fitView, getNodes, setViewport } = useReactFlow();
  const initialized = useNodesInitialized();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const framed = useRef(null);

  useEffect(() => {
    if (!initialized || width <= 0 || height <= 0) return;
    const last = framed.current;
    if (last && last.version === version && last.showIngredients === showIngredients && last.scale === pixelsPerMinute
      && last.fitRequest === fitRequest && last.widePhone === widePhone
      && (!widePhone || Math.abs(last.screenHeight - window.innerHeight) < 32)
      && Math.abs(width - last.width) < 96) return;
    let frame;
    function fit() {
      const nodes = getNodes();
      if (!nodes.length) return;
      framed.current = { version, showIngredients, width, screenHeight: window.innerHeight, scale: pixelsPerMinute, fitRequest, widePhone };
      if (last && last.fitRequest !== fitRequest) {
        fitView({ padding: 0.18, minZoom, maxZoom: 1.25, duration: 160 });
        return;
      }
      const bounds = getNodesBounds(nodes);
      const padding = width < 600 ? 18 : 28;
      // On narrow screens keep text at reading size and allow the cook to pan.
      // The Fit control remains available for an overview of a large recipe.
      const top = widePhone ? 8 : 18;
      const bottom = widePhone ? 8 : 44;
      const heightZoom = (height - top - bottom) / bounds.height;
      const zoom = widePhone ? Math.max(0.7, Math.min(1, heightZoom)) :
        Math.max(width < 600 ? 0.9 : 0.86, Math.min(1.12, (width - 2 * padding) / bounds.width, heightZoom));
      setViewport({ x: padding - bounds.x * zoom, y: top - bounds.y * zoom, zoom });
    }
    // Wait for ReactFlow's ResizeObserver to measure bars at the new scale.
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(fit); });
    return () => cancelAnimationFrame(frame);
  }, [version, showIngredients, pixelsPerMinute, fitRequest, widePhone, initialized, width, height, fitView, getNodes, setViewport]);
  return null;
}

FrameRecipe.propTypes = {
  widePhone: PropTypes.bool.isRequired,
  version: PropTypes.number.isRequired,
  showIngredients: PropTypes.bool.isRequired,
  pixelsPerMinute: PropTypes.number.isRequired,
  fitRequest: PropTypes.number.isRequired,
};

export default function TimelineCanvas({
  nodes, edges, onNodesChange, onEdgesChange, onConnect, version, showIngredients, expanded,
}) {
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const [fitRequest, setFitRequest] = useState(0);
  const widePhone = useMediaQuery('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)', { noSsr: true });
  const tallPhone = useMediaQuery('(orientation: portrait) and (max-width: 760px) and (pointer: coarse)', { noSsr: true });
  const cards = widePhone ? timelineCards.landscape : tallPhone ? timelineCards.portrait : timelineCards.desktop;
  const total = nodes.reduce((end, node) => Math.max(end, node.data.endMinute ?? 0), 0);
  const pixelsPerMinute = useChartScale(nodes, total, width, height, version, showIngredients, fitRequest, cards);
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const shown = showIngredients ? nodes : nodes.filter(node => node.type !== 'ingredient');
    const stepNames = getStepNames(shown);
    const cookingNodes = new Set(shown.filter(node => node.type !== 'ingredient').map(node => node.id));
    const names = new Set();
    const repeated = new Set();
    for (const node of shown) {
      if (names.has(node.data.label)) repeated.add(node.data.label);
      names.add(node.data.label);
    }
    const references = new Map(shown.map(node => [node.id, stepNames.get(node.id) ?? node.data.label]));
    const selected = new Set(shown.filter(node => node.selected).map(node => node.id));
    const neighbors = new Set();
    const visibleEdges = edges.filter(edge => references.has(edge.source) && references.has(edge.target)).map(edge => {
      const linked = selected.has(edge.source) || selected.has(edge.target);
      if (linked || edge.selected) {
        neighbors.add(edge.source);
        neighbors.add(edge.target);
      }
      return {
        ...edge,
        data: { ...edge.data, cookingLink: stepNames.has(edge.source) && cookingNodes.has(edge.target) },
        ariaLabel: edge.ariaLabel === undefined ? `${references.get(edge.source)} leads to ${references.get(edge.target)}` : edge.ariaLabel,
        className: linked || edge.selected ? `${edge.className ?? ''} timeline-edge--linked` : edge.className,
      };
    });
    const visibleNodes = layoutRecipe(shown, visibleEdges, pixelsPerMinute, cards).map((node, index) => ({
      ...node,
      ariaLabel: node.ariaLabel ?? `${references.get(node.id)}${node.data.done ? ', completed' : ''}`,
      // A drag supplies live y coordinates until its row is saved on release.
      position: node.dragging ? { ...node.position, y: shown[index].position.y } : node.position,
      className: neighbors.has(node.id) ? `${node.className ?? ''} timeline-neighbor` : node.className,
      data: { ...node.data, pixelsPerMinute,
        editLabel: repeated.has(node.data.label) ? references.get(node.id) : node.data.label },
    }));
    return { visibleNodes, visibleEdges };
  }, [nodes, edges, showIngredients, pixelsPerMinute, cards]);

  function deleteSelection(event) {
    if (!['Backspace', 'Delete'].includes(event.key) || event.defaultPrevented || event.repeat ||
      event.target.closest('input, textarea, select, button, [contenteditable], .nokey')) return;
    const selected = visibleNodes.filter(node => node.selected);
    if (selected.length) {
      event.preventDefault();
      const focused = event.target.closest('.react-flow__node')?.dataset.id;
      const first = selected.find(node => node.id === focused) ?? selected[0];
      first.data.onDelete(first.id, selected.map(node => node.id));
      return;
    }
    const changes = visibleEdges.filter(edge => edge.selected).map(({ id }) => ({ id, type: 'remove' }));
    if (changes.length) {
      event.preventDefault();
      onEdgesChange(changes);
    }
  }

  return (
    <section className="timeline-canvas" aria-label="Cooking timeline" onKeyDown={deleteSelection}>
      <TimelineScale pixelsPerMinute={pixelsPerMinute} total={total} />
      <div className="timeline-canvas__plot">
        <ReactFlow nodes={visibleNodes} edges={visibleEdges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={defaultEdgeOptions}
          minZoom={minZoom} maxZoom={maxZoom} deleteKeyCode={null}>
          <FrameRecipe key={widePhone && expanded ? 'expanded' : 'normal'} version={version} showIngredients={showIngredients}
            pixelsPerMinute={pixelsPerMinute} fitRequest={fitRequest} widePhone={widePhone} />
        </ReactFlow>
      </div>
      <ViewportControls onFit={() => setFitRequest(request => request + 1)} />
    </section>
  );
}

TimelineCanvas.propTypes = {
  expanded: PropTypes.bool.isRequired,
  nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired,
  onNodesChange: PropTypes.func.isRequired,
  onEdgesChange: PropTypes.func.isRequired,
  onConnect: PropTypes.func.isRequired,
  version: PropTypes.number.isRequired,
  showIngredients: PropTypes.bool.isRequired,
};
