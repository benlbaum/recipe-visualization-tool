# Mise

Mise is a local recipe planner. Lay out cooking steps on a minute-by-minute timeline, see what can cook in parallel, and gather ingredients with a checklist.

## Run the app

```sh
npm ci
npm run dev
```

For the Electron desktop app, run `npm run build` followed by `npm run electron`. On Windows, `npm run package` builds the installer and portable app in `release/`. The production build includes its fonts and example recipe photo for offline use.

## Import from a recipe website

Choose **Import**, paste the recipe page URL, and select **Read website**. Review the ingredients and instructions, then choose **Save recipe**. Pages with several published recipe cards offer a recipe selector. **Published recipe** reopens the source link, original directions, yield, author, times, notes and nutrition when supplied. An available JPEG, PNG or WebP cover is resized and saved on the device. JSON import and export still work.

The importer reads Schema.org Recipe JSON-LD and microdata, follows document-local references, and recognizes visible ingredient and direction lists on simpler pages. For a site that blocks automated access, try its print link or **Use saved page HTML**. Pages that require sign-in or JavaScript and provide no readable recipe in the returned HTML may need that fallback.

The cooking plan starts in published order. Step durations supplied by the publisher are used directly. Other steps have a marked one-minute planning estimate that you can edit. The source card retains the publisher’s whole-recipe times and recipe data.

## Run the website on a home network

The host needs Node.js and Python 3.12 or later. Phones and other computers only need a browser.

```sh
npm ci
npm run build
python website/serve.py
```

This serves the app and importer together at **http://127.0.0.1:8767/**. For a phone, pass the host computer’s Wi-Fi or Ethernet IPv4 address and subnet prefix. For example, on a home network with a 255.255.255.0 subnet mask:

```sh
python website/serve.py --lan 192.168.1.20/24 --port 8767
```

Open the printed address on a device connected to the same LAN. The server binds to that interface and accepts peers on the specified subnet. The host firewall must allow inbound TCP on that port. Each browser keeps its own recipe box. Stop the foreground server with Ctrl+C.

For frontend development, run the loopback Python server alongside `npm run dev`. Vite forwards imports to it. The Electron app runs the same importer directly using `python` on Windows or `python3` on macOS and Linux.

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
python -m unittest discover -s website/tests -v
```

Run `npm run test:ui` for the phone walkthrough. It builds Mise and tests the stir-fry with touch input in Electron’s Chromium at 568×320 and 390×844. On headless Linux, run it under a display server such as Xvfb.
