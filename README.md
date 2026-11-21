# Mise

Mise is a local recipe planner. Lay out cooking steps on a minute-by-minute timeline, see what can cook in parallel, and gather ingredients with a checklist.

## Run the app

```sh
npm ci
npm run dev
```

For the Electron desktop app, run `npm run build` followed by `npm run electron`. On Windows, `npm run package` builds the installer and portable app in `release/`. The production build includes its fonts and example recipe photo for offline use.

## Plan a recipe

- Open the beer cheese dip example or choose **New recipe** to start your own.
- Use the camera beside the recipe title to choose a cover photo from your device. The photo travels with your recipe when you export it.
- Add ingredients individually or paste a list with one ingredient per line. In a step's editor, choose **Ingredients used** and **Start after** to describe its inputs. The timeline recalculates as you edit.
- Use **Timeline** to compare durations. Select a step to highlight its connections and read its inputs. Turn on **Ingredient links** to draw or inspect ingredient connections.
- Use **Method** to check off steps as you cook. **Ready now** shows unfinished steps whose prerequisites are complete. Tap a prerequisite to find it in the full schedule. In **Ingredients**, select **Still needed** to see what you have left to gather.
- To try the nine-minute stir-fry from Issue #9, open **Recipe box → Add example recipe → Veggie Stir Fry**.
- Choose **Expand cooking plan** for more reading space. You can still switch between the timeline, method and ingredients, and your place is kept when you reload the tab.
- **Recipe box** keeps recipes and checklist progress on this device. **Export** saves a shareable recipe JSON file. **Import** adds a recipe to your box and supports older exports.

## Verify changes

```sh
npm test
npm run lint
npm run build
```
