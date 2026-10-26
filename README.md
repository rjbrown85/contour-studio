# Contour Studio

A small vector drawing app for iPad and desktop. A single canvas, warm dark colours, and a few useful tools. Inspired by VectorCraft's basic drawing workflow and the restrained interface of Vocal Exercises, with an original implementation.

**[Open Contour Studio](https://rjbrown85.github.io/contour-studio/)**

## Draw

Choose Draw for smooth freehand paths, Pencil for a more direct hand-drawn line, or Line, Curve, Box, Oval, and Text. Draw with a finger, Apple Pencil, or mouse. Select an object to move, resize, rotate, duplicate, or lock it. Curve control points appear when you select a curve. Eraser removes whole vector objects, with undo available. It does not cut a path into pieces.

**Colours** opens a colour wheel, brightness slider, common colours, HEX input, and a reusable project palette. Outline and fill can have different colours. Text supports five system font families, size, bold, italic, and letter spacing. **Size & align** offers exact dimensions, rounded box corners, page alignment, and moving an object to another layer.

**Layers** lets you add, rename, reorder, hide, lock, or delete layers. Hidden layers stay in project files and are omitted from SVG/PNG exports. Object and layer locks protect against drawing edits and erasing. Layer deletion is undoable, and layers containing locked objects cannot be deleted until those objects are unlocked.

Turn on **Snap shapes** to tidy roughly drawn lines, boxes, and ovals when you lift. **Hold to tidy** in More options does this after a short pause while drawing. Recognition is approximate and conservative. **Keep original stroke** restores a tidied stroke. These options are off by default.

Turn on **Grid** to show a canvas grid. More options offers 20, 40, or 80 unit spacing and **Snap to grid** for new shapes, positioning, resizing, and curve handles. The grid is a drawing guide and never appears in exported artwork.

Use two fingers to pan and pinch to zoom, or choose Pan for a single finger. The far-right scroll bar and arrows move the whole app page, independently of the artwork. The title and Export button stay at the top. Short windows scroll instead of clipping controls. **Fit page** shows the whole artboard, and **Fit width** gives a larger view with vertical scrolling when needed. **Detect Apple Pencil automatically** switches fingers to panning after the first pen contact during a visit. Nearby touch contacts are ignored while the pen is active and briefly after lifting, and pen contact cancels a pending finger stroke. Turn automatic detection off to draw with fingers again. **Pencil only** prevents finger drawing from the start. These are input filters, not hardware palm rejection. Strokes use fixed width without pressure sensitivity.

The canvas includes landscape, portrait, square, wide, and 13-inch iPad-shaped presets. Undo and redo include object edits, layer changes, and starting or opening a different drawing. The latest 60 changes are kept during the current visit. Version 1 project files migrate automatically.

## Take your work to a desktop

- **Export → Download SVG** creates ordinary vector shapes, paths, and editable text. Open the SVG in a desktop vector editor such as VectorCraft. Transparent background is the default.
- **Export → Share SVG** opens the device's file sharing sheet where supported, otherwise downloads the SVG. AirDrop and Save to Files are provided by the device, when available.
- **Drawing name → Save project** downloads a `.contour.json` file. Move it through Files, iCloud Drive, or another service, then use **Open project** in Contour Studio on the other device.
- **Download PNG** creates a raster image at up to twice the canvas dimensions, capped at 4096 pixels on its longest side.

Projects and SVGs serve different purposes. The app opens its own project files, not arbitrary SVG, PDF, or Illustrator files. It provides two control points for individual curves, but no general path-node editor, boolean operations, image tracing, or multi-object selection.

## iPad

Open the app in Safari or Chrome. For a standalone view, use Safari's Share menu and Add to Home Screen. The interface respects Home Screen safe areas, keeps the title and Export header visible, and uses the available browser height and adapts to landscape, portrait, and narrow Split View widths. Layout checks include 1376 × 1032 and 1032 × 1376, plus reduced heights for browser controls. All drawing uses Pointer Events and standard SVG, with no browser-specific file-system API required.

Browser checks cover simulated touch and pen events, tablet-sized layouts, and desktop pointer input. Physical iPad Safari/Chrome, Apple Pencil, and the native share sheet still need an on-device check. Simulation cannot verify Pencil latency or operating-system gestures.

## Storage and privacy

No account, analytics, backend, or cloud sync. The current drawing is saved in this browser's local storage. Safari and Chrome have separate storage. Save a project file for a durable backup, especially before clearing browser data or using private browsing. The app reports storage failures rather than claiming a successful save.

An offline cache stores the application files after the first successful online visit. It does not upload drawings. Online visits check for the latest page. Versioned application files prevent stale code from hiding newly published tools. Updates activate without clearing drawings or forcing an open canvas to reload. The service worker is disabled on localhost during development.

## Develop

No build step or runtime dependencies. Requires Node.js 22 or newer for the local server and checks.

```sh
npm start
```

Open `http://127.0.0.1:4173`. Source files are in `app/`. The drawing model, SVG export, input validation, coordinate transforms, and history live in `app/core.js`. The interface and pointer handling are in `app/app.js`.

```sh
npm test
```

For integration checks, start the server and open `http://127.0.0.1:4173/checks/browser.html`. These use a separate test storage key and cover drawing, object transforms, history, pinch cancellation, Pencil-only input, pointer cancellation, text, autosave restoration, SVG/PNG output, and responsive layout. The expanded checks also cover layers, locks, erasing, curve controls, colours, shape recognition, grids, page scrolling, safe areas, and pen-versus-touch handling. Synthetic pointer capture is stubbed in the test frame. Physical pointer input should also be checked in the app.

## Publish

In repository Settings → Pages, select **GitHub Actions** as the source. The included workflow runs the model checks, then publishes `app/` on pushes to `main`. It can also be run manually. Increment the cache version and the matching asset version in `app/sw.js`, `app/index.html`, and the `core.js` import in `app/app.js` whenever application assets change.

## References

- [VectorCraft](https://github.com/storytold/vectorcraft), workflow inspiration only. No VectorCraft code or artwork is bundled.
- [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [MDN Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)

The source is published for Ryan Brown's project. No additional application source license is granted.
