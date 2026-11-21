// The timeline and the cooking checklist use the same step-to-step dependencies.
// An ingredient can be used before it has been checked off in the prep list.
export function getCookingSteps(nodes, edges, completedStepIds = []) {
  const completed = new Set(completedStepIds);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const steps = new Map();
  const seenInputs = new Map();
  for (const step of nodes) {
    if (step.type !== 'step') continue;
    steps.set(step.id, {
      step, ingredients: [], prerequisites: [], waitingOn: [], dependents: [], done: completed.has(step.id),
    });
    seenInputs.set(step.id, new Set());
  }
  for (const { source, target } of edges) {
    const entry = steps.get(target);
    const input = byId.get(source);
    if (!entry || !input || seenInputs.get(target).has(source)) continue;
    seenInputs.get(target).add(source);
    if (input.type === 'ingredient') entry.ingredients.push(input);
    if (input.type === 'step') {
      entry.prerequisites.push(input);
      steps.get(source).dependents.push(entry.step);
      if (!completed.has(source)) entry.waitingOn.push(input);
    }
  }
  return steps;
}

// Reopen downstream work whenever a prerequisite is no longer complete.
// A queue handles forks, joins and recipe files whose nodes are out of order.
export function validCompletedSteps(steps, candidates) {
  const completed = new Set(candidates.filter(id => steps.has(id)));
  const unfinished = [...steps.keys()].filter(id => !completed.has(id));
  for (const id of unfinished) {
    for (const child of steps.get(id).dependents) {
      if (completed.delete(child.id)) unfinished.push(child.id);
    }
  }
  return [...completed];
}

function sameStep(before, after) {
  if (!before || !after || before.step.data.label !== after.step.data.label ||
      before.step.data.durationMinutes !== after.step.data.durationMinutes ||
      before.prerequisites.length !== after.prerequisites.length ||
      before.ingredients.length !== after.ingredients.length) return false;

  const previousSteps = new Set(before.prerequisites.map(node => node.id));
  const previousIngredients = new Map(before.ingredients.map(node => [node.id, node.data.label]));
  return after.prerequisites.every(node => previousSteps.has(node.id)) &&
    after.ingredients.every(node => previousIngredients.get(node.id) === node.data.label);
}

export function reconcileCookingProgress(previous, next) {
  if (!previous.completedStepIds.length) return previous.completedStepIds;
  const before = getCookingSteps(previous.nodes, previous.edges);
  const after = getCookingSteps(next.nodes, next.edges);
  const unchanged = previous.completedStepIds.filter(id => sameStep(before.get(id), after.get(id)));
  return validCompletedSteps(after, unchanged);
}
