export const PIXELS_PER_MINUTE = 44;
export const MIN_STEP_WIDTH = 210;

const NODE_GAP = 24;
const DURATION_SUFFIX = /\s*\((\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*min(?:ute)?s?\)\s*$/i;

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

function scheduleSteps(nodes, edges) {
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
    if (!Number.isFinite(step.endMinute * PIXELS_PER_MINUTE)) {
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

function placeRows(boxes) {
  // Reserve dragged rows first. A short bar's label can extend past its
  // finish time, so use the entire node footprint when sharing rows.
  const byPriority = [...boxes].sort((a, b) =>
    Number(Number.isFinite(b.preferredY)) - Number(Number.isFinite(a.preferredY)) || a.x - b.x
  );
  const placed = []; // sorted from top to bottom
  for (const box of byPriority) {
    let y = Number.isFinite(box.preferredY) ? box.preferredY : 0;
    for (const other of placed) {
      if (box.x >= other.right + NODE_GAP || other.x >= box.right + NODE_GAP) continue;
      if (y + box.height + NODE_GAP <= other.y) break;
      y = Math.max(y, other.y + other.height + NODE_GAP);
    }
    box.y = y;
    const below = placed.findIndex(other => other.y > y);
    placed.splice(below < 0 ? placed.length : below, 0, box);
  }
}

export function layoutRecipe(nodes, edges) {
  const steps = scheduleSteps(nodes, edges);
  let totalMinutes = 0;
  for (const step of steps.values()) {
    step.x = step.startMinute * PIXELS_PER_MINUTE;
    step.width = Math.max(MIN_STEP_WIDTH, step.durationMinutes * PIXELS_PER_MINUTE);
    totalMinutes = Math.max(totalMinutes, step.endMinute);
  }

  const boxes = nodes.map(node => {
    const step = steps.get(node.id);
    let x = node.type === 'finalDish' ? totalMinutes * PIXELS_PER_MINUTE : -300;
    let width = MIN_STEP_WIDTH;
    let data = node.data;
    if (step) {
      x = step.x;
      width = step.width;
      const { startMinute, endMinute, durationMinutes } = step;
      data = { ...data, startMinute, endMinute, durationMinutes };
    } else if (node.type === 'finalDish') {
      data = { ...data, endMinute: totalMinutes };
    }
    return { node, data, preferredY: data.preferredY, x, right: x + width, height: node.height || 100 };
  });

  placeRows(boxes);
  return boxes.map(({ node, data, x, y }) => ({ ...node, data, position: { x, y } }));
}
