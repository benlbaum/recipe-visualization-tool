import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { RecipeDialog } from './RecipeDialogs.jsx';
import { prepareRecipePhoto } from './recipePhoto.js';
import { isWebsiteRecipe, timeLabel, valueText, websiteRecipeFile } from './websiteRecipe.js';
import './WebsiteImport.css';

async function requestImport(payload, signal) {
  let result;
  if (window.miseDesktop) {
    result = await window.miseDesktop.importWebsite(payload);
  } else {
    const response = await fetch('/api/import', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-Mise-Import': '1' }, body: JSON.stringify(payload) });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('The website importer is unavailable. Open Mise using its local server address.');
    }
    result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not import this page.');
  }
  if (result.error) throw new Error(result.error);
  return result;
}

function PublishedCard({ card, expanded = false }) {
  const raw = card.published;
  const facts = [['Yield', valueText(raw.recipeYield)], ['Prep', timeLabel(raw.prepTime)],
    ['Cook', timeLabel(raw.cookTime)], ['Total', timeLabel(raw.totalTime)], ['By', valueText(raw.author)],
    ['Cuisine', valueText(raw.recipeCuisine)], ['Category', valueText(raw.recipeCategory)]].filter(([, text]) => text);
  const nutrition = raw.nutrition && typeof raw.nutrition === 'object'
    ? Object.entries(raw.nutrition).filter(([key, val]) => !key.startsWith('@') && valueText(val)) : [];
  return <article className="published-card">
    <h3>{card.title}</h3>
    <a href={card.url} target="_blank" rel="noreferrer">{new URL(card.url).hostname} ↗</a>
    {card.description && <p>{card.description}</p>}
    {facts.length > 0 && <dl>{facts.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>}
    <details open={expanded || undefined}><summary>{card.ingredients.length} ingredients</summary>
      <ul>{card.ingredients.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
    <details open={expanded || undefined}><summary>{card.steps.length} instructions</summary>
      <ol>{card.steps.map((s, i) => <li key={i}>{s.section && card.steps[i - 1]?.section !== s.section &&
        <strong>{s.section} </strong>}{s.text}</li>)}</ol></details>
    {valueText(raw.recipeNotes ?? raw.notes) && <details><summary>Recipe notes</summary><p>{valueText(raw.recipeNotes ?? raw.notes)}</p></details>}
    {nutrition.length > 0 && <details><summary>Nutrition</summary><dl>{nutrition.map(([key, val]) =>
      <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{valueText(val)}</dd></div>)}</dl></details>}
  </article>;
}
PublishedCard.propTypes = { card: PropTypes.object.isRequired, expanded: PropTypes.bool };

export function PublishedRecipe({ card, onClose }) {
  return <RecipeDialog title="Published recipe" onClose={onClose}><div className="dialog-body">
    <PublishedCard card={card} expanded /><p className="field-hint">Your cooking plan starts in source order. Steps without a published duration start at 1 minute and can be edited.</p>
  </div></RecipeDialog>;
}
PublishedRecipe.propTypes = { card: PropTypes.object.isRequired, onClose: PropTypes.func.isRequired };

export default function WebsiteImport({ onClose, onFile, onImport }) {
  const [url, setUrl] = useState('');
  const [useHtml, setUseHtml] = useState(false);
  const [html, setHtml] = useState('');
  const [cards, setCards] = useState([]);
  const [choice, setChoice] = useState(0);
  const [photo, setPhoto] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const current = useRef(null);
  const card = cards[choice];
  useEffect(() => () => current.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const signal = controller.signal;
    setError('');
    setBusy(card ? 'Saving recipe…' : 'Reading recipe…');
    try {
      if (!card) {
        const { recipes } = await requestImport(useHtml ? { url: url.trim(), html } : { url: url.trim() }, signal);
        const readable = recipes.filter(isWebsiteRecipe);
        if (!readable.length) throw new Error('The page did not contain a complete recipe.');
        if (!signal.aborted) { setCards(readable); setChoice(0); }
      } else {
        const file = websiteRecipeFile(card);
        let notice = '';
        if (photo && card.image) {
          try {
            const result = await requestImport({ url: card.image, photo: true }, signal);
            if (signal.aborted) return;
            const [prefix, encoded] = result.photo.split(',');
            const data = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
            file.cover = await prepareRecipePhoto(new Blob([data], { type: prefix.slice(5, -7) }));
          } catch {
            notice = 'Recipe saved. The publisher’s cover photo was unavailable.';
          }
        }
        if (!signal.aborted) onImport(file, notice);
      }
    } catch (cause) {
      if (!signal.aborted) setError(cause.message || 'Could not read this recipe.');
    } finally {
      if (!signal.aborted) setBusy('');
    }
  }
  return <RecipeDialog title={card ? 'Review recipe' : 'Import recipe'} onClose={onClose}>
    <form className="recipe-form" onSubmit={submit}>
      <div className="dialog-body website-import">
        {!card ? <>
          <label className="field">Recipe website<input type="url" autoFocus required value={url} disabled={!!busy}
            placeholder="https://…" onChange={e => setUrl(e.target.value)} /></label>
          <button type="button" className="import-alternative" aria-expanded={useHtml} disabled={!!busy}
            onClick={() => setUseHtml(!useHtml)}>{useHtml ? 'Use website link only' : 'Use saved page HTML'}</button>
          {useHtml && <label className="field">Page HTML<textarea rows={4} required value={html}
            disabled={!!busy} onChange={e => setHtml(e.target.value)} /></label>}
        </> : <>
          {cards.length > 1 && <label className="field">Choose a recipe<select value={choice} disabled={!!busy}
            onChange={e => { setChoice(Number(e.target.value)); setError(''); setPhoto(true); }}>
            {cards.map((item, i) => <option key={i} value={i}>{item.title}</option>)}</select></label>}
          <PublishedCard card={card} />
          {card.image && <label className="import-photo"><input type="checkbox" checked={photo} disabled={!!busy}
            onChange={e => setPhoto(e.target.checked)} />Include recipe photo</label>}
          <p className="field-hint">The plan follows the published order. Steps without a published duration start at 1 minute.</p>
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {busy && <p role="status">{busy}</p>}
      </div>
      <footer className="dialog-actions">
        {card ? <button type="button" className="text-action" disabled={!!busy} onClick={() => { setCards([]); setError(''); }}>Back</button>
          : <button type="button" className="text-action" disabled={!!busy} onClick={onFile}>Open JSON file</button>}
        <button className="action primary" type="submit" disabled={!!busy}>{card ? 'Save recipe' : 'Read website'}</button>
      </footer>
    </form>
  </RecipeDialog>;
}
WebsiteImport.propTypes = { onClose: PropTypes.func.isRequired, onFile: PropTypes.func.isRequired, onImport: PropTypes.func.isRequired };
