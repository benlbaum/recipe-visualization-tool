export function isWebsiteRecipe(card) {
  if (!card || typeof card.url !== 'string') return false;
  try {
    const url = new URL(card.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
  } catch { return false; }
  return Boolean(card && typeof card.title === 'string' && typeof card.url === 'string' &&
    /^https?:\/\//i.test(card.url) && Array.isArray(card.ingredients) && card.ingredients.length &&
    card.ingredients.every(text => typeof text === 'string') && Array.isArray(card.steps) && card.steps.length &&
    card.steps.every(s => s && typeof s.text === 'string' && typeof s.section === 'string') &&
    card.published && typeof card.published === 'object' && !Array.isArray(card.published) &&
    typeof card.description === 'string');
}

export function durationMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value);
  if (!match) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map(n => Number(n || 0));
  const total = days * 1440 + hours * 60 + minutes + seconds / 60;
  return total > 0 && Number.isFinite(total) ? total : null;
}

export function timeLabel(value) {
  const minutes = durationMinutes(value);
  if (minutes === null) return typeof value === 'string' ? value : '';
  const hrs = Math.floor(minutes / 60);
  const rest = Number((minutes % 60).toFixed(2));
  return [hrs && `${hrs} hr`, rest && `${rest} min`].filter(Boolean).join(' ');
}

export function valueText(value) {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value && typeof value === 'object' ? valueText(value.name ?? value.text ?? '') : '';
}

export function websiteRecipeFile(card) {
  if (!isWebsiteRecipe(card)) throw new Error('The page did not contain a complete recipe.');
  const ingredients = card.ingredients.map((label, i) => ({ id: 'ingredient-' + i, type: 'ingredient', data: { label } }));
  const steps = card.steps.map(({ text, section, duration }, i) => {
    const publishedMinutes = durationMinutes(duration);
    const minutes = publishedMinutes ?? 1;
    const label = section ? `${section} — ${text}` : text;
    return { id: 'step-' + i, type: 'step', data: { label: `${label} (${minutes} min)`, durationMinutes: minutes,
      ...(publishedMinutes === null && { durationEstimated: true }) } };
  });
  const dish = { id: 'final-dish', type: 'finalDish', data: { label: card.title, sourceRecipe: card } };
  return { nodes: [...ingredients, ...steps, dish],
    edges: steps.map((step, i) => ({ source: step.id, target: steps[i + 1]?.id ?? dish.id })) };
}
