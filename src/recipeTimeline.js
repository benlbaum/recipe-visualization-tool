export const PIXELS_PER_MINUTE = 44;
export const MIN_STEP_WIDTH = 210;

const COLUMN_GAP = 16;
export const timelineCards = {
  desktop: { minWidth: 170, maxWidth: MIN_STEP_WIDTH, rowGap: 20 },
  portrait: { minWidth: 158, maxWidth: 182, rowGap: 18 },
  landscape: { minWidth: 280, maxWidth: 312, rowGap: 10 },
};
const DURATION_SUFFIX = /\s*\((\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*min(?:ute)?s?\)\s*$/i;
const minutes = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 15 });

export function formatStepInterval({ data }) {
  return `${minutes.format(data.startMinute)}–${minutes.format(data.endMinute)} min`;
}

// Match references in Method and Timeline even when two parallel steps have
// exactly the same instruction, start, and finish.
export function getStepNames(nodes) {
  const matches = new Map();
  for (const node of nodes) {
    if (node.type !== 'step') continue;
    const name = `${node.data.label}, ${formatStepInterval(node)}`;
    if (!matches.has(name)) matches.set(name, []);
    matches.get(name).push(node.id);
  }
  const names = new Map();
  for (const [name, ids] of matches) {
    ids.forEach((id, index) => names.set(id, ids.length > 1 ? `${name} (${index + 1} of ${ids.length})` : name));
  }
  return names;
}

export function getStepDescription(data) {
  return (data.label ?? '').replace(DURATION_SUFFIX, '');
}

export function getStepDuration(data) {
  const minutes = Number(data.durationMinutes);
  if (Number.isFinite(minutes) && minutes > 0) return minutes;

  // Older exports stored minutes only in the label. Allow one minute
  // for a step whose label was edited to remove its duration.
  const fromLabel = Number(data.label?.match(DURATION_SUFFIX)?.[1]);
  return Number.isFinite(fromLabel) && fromLabel > 0 ? fromLabel : 1;
}

function scheduleSteps(nodes, edges, pixelsPerMinute) {
  const steps = new Map();
  for (const node of nodes) {
    if (node.type === 'step') {
      steps.set(node.id, {
        durationMinutes: getStepDuration(node.data),
        startMinute: 0,
        remaining: 0,
        successors: [],
      });
    }
  }

  // Ingredients are available at minute zero. Only a step-to-step
  // connection can delay the start of another step.
  for (const edge of edges) {
    const from = steps.get(edge.source);
    const to = steps.get(edge.target);
    if (from && to) {
      from.successors.push(to);
      to.remaining++;
    }
  }

  const ready = [...steps.values()].filter(step => step.remaining === 0);
  for (const step of ready) {
    // Keep equivalent decimal-minute paths aligned (for example, 0.1 + 0.2
    // and 0.3) while retaining precision for short steps.
    step.endMinute = Number((step.startMinute + step.durationMinutes).toPrecision(15));
    if (!Number.isFinite(step.endMinute * pixelsPerMinute)) {
      throw new Error('The recipe duration is too large to display.');
    }
    for (const next of step.successors) {
      next.startMinute = Math.max(next.startMinute, step.endMinute);
      next.remaining--;
      if (next.remaining === 0) ready.push(next);
    }
  }
  if (ready.length !== steps.size) {
    throw new Error('Step dependencies contain a cycle. Each step must finish before its dependents start.');
  }
  return steps;
}

function placeRows(boxes, edges, { minWidth, maxWidth, rowGap, stackSuccessors, allowLeftOverhang }) {
  const byId = new Map(boxes.map(box => [box.node.id, box]));
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source?.node.type !== 'step' || !target || target.node.type === 'ingredient') continue;
    // At a join, continue the branch that determines when cooking can resume.
    if (!target.parent || source.data.endMinute > target.parent.data.endMinute) target.parent = source;
    if (source.data.endMinute === (target.data.startMinute ?? target.data.endMinute)) {
      source.hasHandoff = true;
      target.receivesHandoff = true;
    }
  }
  for (const box of boxes) {
    if (box.node.type === 'finalDish') {
      const startInset = box.receivesHandoff ? 16 : 0;
      box.data = { ...box.data, startInset };
      box.left += startInset;
      box.right += startInset;
    }
    if (box.node.type !== 'step') continue;
    // Leave a small seam around an immediate handoff. Cap it on tiny bars so
    // even a short step retains a visible duration on the shared time scale.
    const inset = Math.min(16, box.span / 4);
    const startInset = box.receivesHandoff ? inset : 0;
    const endInset = box.hasHandoff ? inset : 0;
    const barWidth = box.span - startInset - endInset;
    const captionWidth = box.hasHandoff ? Math.max(minWidth, Math.min(maxWidth, barWidth)) : maxWidth;
    const barLeft = box.x + startInset;
    // In a stacked overview a short caption can extend back over earlier
    // minutes, keeping the next handoff and incoming parallel links visible.
    const endAligned = barLeft + barWidth - captionWidth;
    const captionLeft = stackSuccessors && (endAligned >= 0 || allowLeftOverhang) ? Math.min(barLeft, endAligned) : barLeft;
    const barOffset = barLeft - captionLeft;
    if (barOffset > 0) box.displayX = captionLeft;
    box.data = { ...box.data, startInset: barOffset > 0 ? 0 : startInset,
      barOffset, barWidth, captionWidth, captionAbove: false };
    box.left = captionLeft;
    box.right = Math.max(barLeft + barWidth, captionLeft + captionWidth);
  }
  // Reserve dragged rows first. A short bar's label can extend past its
  // finish time, so use the entire node footprint when sharing rows.
  const byPriority = [...boxes].sort((a, b) =>
    Number(Number.isFinite(b.preferredY)) - Number(Number.isFinite(a.preferredY)) || a.x - b.x
  );
  const placed = []; // sorted top to bottom
  for (const box of byPriority) {
    const pinned = Number.isFinite(box.preferredY);
    const branchTop = stackSuccessors ? box.parent?.y : box.parent?.floor;
    const floor = pinned ? box.preferredY : branchTop ?? 0;
    const preferred = pinned ? floor : box.parent?.y ?? floor;
    let top = floor;
    let firstGap;
    let canContinue = true;
    for (const other of placed) {
      if (box.left >= other.right + COLUMN_GAP || other.left >= box.right + COLUMN_GAP) continue;
      if (preferred < other.y + other.height + rowGap && other.y < preferred + box.height + rowGap) canContinue = false;
      if (firstGap === undefined && top + box.height + rowGap <= other.y) firstGap = top;
      top = Math.max(top, other.y + other.height + rowGap);
    }
    box.y = canContinue ? preferred : firstGap ?? top;
    box.floor = pinned || !box.parent ? box.y : floor;
    const below = placed.findIndex(other => other.y > box.y);
    placed.splice(below < 0 ? placed.length : below, 0, box);
  }
  // A short step's caption may extend beyond its finish minute. If the next
  // arrow descends there, hang the caption above the bar to clear the turn.
  for (const box of boxes) {
    const parent = box.parent;
    if (parent?.hasHandoff && box.y > parent.y && parent.right > box.x) {
      parent.data.captionAbove = true;
    }
  }
}

function positionRecipe(nodes, edges, steps, totalMinutes, pixelsPerMinute, cards) {
  const boxes = nodes.map(node => {
    const step = steps.get(node.id);
    let x = node.type === 'finalDish' ? totalMinutes * pixelsPerMinute : -cards.maxWidth - 90;
    let data = { ...node.data, captionWidth: cards.maxWidth };
    if (step) {
      x = step.startMinute * pixelsPerMinute;
      const { startMinute, endMinute, durationMinutes } = step;
      data = { ...data, startMinute, endMinute, durationMinutes };
    } else if (node.type === 'finalDish') {
      data = { ...data, endMinute: totalMinutes };
    }
    return { node, data, preferredY: data.preferredY, x, left: x, right: x + cards.maxWidth,
      span: step ? step.durationMinutes * pixelsPerMinute : 0, height: node.height || 100 };
  });

  placeRows(boxes, edges, cards);
  return boxes;
}

function positionedNodes(boxes) {
  return boxes.map(({ node, data, x, displayX, y }) => ({ ...node, data, position: { x: displayX ?? x, y } }));
}

function finishMinute(steps) {
  let total = 0;
  for (const step of steps.values()) total = Math.max(total, step.endMinute);
  return total;
}

export function layoutRecipe(nodes, edges, pixelsPerMinute = PIXELS_PER_MINUTE, cards = timelineCards.desktop) {
  const steps = scheduleSteps(nodes, edges, pixelsPerMinute);
  return positionedNodes(positionRecipe(nodes, edges, steps, finishMinute(steps), pixelsPerMinute, cards));
}

// Search the time-axis length in graph pixels. A shorter axis shares more
// columns and needs more rows. Score each arrangement at the uniform zoom
// that shows every card, keeping times and manually assigned rows intact.
export function fitRecipeLayout(nodes, edges, width, height, controlsInRuler) {
  if (!nodes.length || !width || !height) return null;
  const top = 18;
  const availableWidth = Math.max(1, width - 24);
  const availableHeight = Math.max(1, height - top - (controlsInRuler ? 10 : 56));
  const aspect = availableWidth / availableHeight;
  // Keep caption widths fixed during the search so measured text heights
  // remain valid across candidate layouts and after the final DOM reflow.
  const caption = Math.round(Math.max(168, Math.min(250, 160 + 24 * aspect)));
  const cards = { minWidth: caption, maxWidth: caption, rowGap: 14, stackSuccessors: true, allowLeftOverhang: aspect < 1 };
  const steps = scheduleSteps(nodes, edges, 0);
  const total = finishMinute(steps);
  let low = 0;
  let high = Math.min(1_000_000, Math.max(availableWidth,
    aspect * nodes.reduce((sum, node) => sum + (node.height || 100) + cards.rowGap, 0)));
  let span = Math.min(high, availableWidth);
  let best;
  for (let pass = 0; pass < 12; pass++) {
    const pixelsPerMinute = total ? Math.min(Number.MAX_VALUE, span / total) : PIXELS_PER_MINUTE;
    const boxes = positionRecipe(nodes, edges, steps, total, pixelsPerMinute, cards);
    let left = Infinity, right = -Infinity, upper = Infinity, lower = -Infinity;
    for (const box of boxes) {
      left = Math.min(left, box.displayX ?? box.x);
      right = Math.max(right, box.right);
      upper = Math.min(upper, box.y);
      lower = Math.max(lower, box.y + box.height);
    }
    const w = right - left;
    const h = lower - upper;
    const zoom = Math.min(1.25, availableWidth / w, availableHeight / h);
    const area = w * h * zoom * zoom;
    if (!best || zoom > best.zoom || (zoom === best.zoom && area > best.area)) {
      best = { boxes, zoom, area, pixelsPerMinute,
        x: (width - w * zoom) / 2 - left * zoom,
        y: top + (availableHeight - h * zoom) / 2 - upper * zoom };
    }
    if (!total || high - low < 1) break;
    if (w / h > aspect) high = span;
    else low = span;
    span = (low + high) / 2;
  }
  return { nodes: positionedNodes(best.boxes), pixelsPerMinute: best.pixelsPerMinute,
    viewport: { x: best.x, y: best.y, zoom: best.zoom } };
}
