# Contour Studio

A small vector drawing app for iPad and desktop. A single canvas, warm dark colours, and a few useful tools. Inspired by VectorCraft's basic drawing workflow and the restrained interface of Vocal Exercises, with an original implementation.

**[Open Contour Studio](https://rjbrown85.github.io/contour-studio/)**

## Draw

Choose Draw, Line, Box, Oval, or Text. Draw with a finger, Apple Pencil, or mouse. Select an object to move it, drag its corner to resize, or drag the round handle to rotate. Duplicate, Delete, Back, and Front appear only when you select something. Back and Front move an object one step in the stacking order.

Ink, width, fill, and opacity apply to the selected object or your next mark. Freehand lines are smooth editable SVG paths. Fill applies to boxes and ovals. Text uses a portable system font, so its appearance may vary slightly in other editors.

Use two fingers to pan and pinch to zoom. Pan also works with a single finger. **Pencil only** in the options menu keeps finger touches from drawing. It is an input filter, not hardware palm rejection. Strokes use a fixed width, without pressure sensitivity.

The canvas has landscape, portrait, square, and wide presets. Undo and redo include object edits and starting or opening a different drawing. The latest 60 changes are kept during the current visit.

## Take your work to a desktop

- **Export → Download SVG** creates ordinary vector shapes, paths, and editable text. Open the SVG in a desktop vector editor such as VectorCraft. Transparent background is the default.
- **Export → Share SVG** opens the device's file sharing sheet where supported, otherwise downloads the SVG. AirDrop and Save to Files are provided by the device, when available.
- **Drawing name → Save project** downloads a `.contour.json` file. Move it through Files, iCloud Drive, or another service, then use **Open project** in Contour Studio on the other device.
- **Download PNG** creates a raster image at up to twice the canvas dimensions, capped at 4096 pixels on its longest side.

Projects and SVGs serve different purposes. This first version opens its own project files, not arbitrary SVG, PDF, or Illustrator files. It does not include node editing, Bézier handles, boolean operations, image tracing, or multi-object selection.

## iPad

Open the app in Safari or Chrome. For a standalone view, use Safari's Share menu and Add to Home Screen. The interface adapts to landscape, portrait, and narrow Split View widths. All drawing uses Pointer Events and standard SVG, with no browser-specific file-system API required.

Browser checks cover simulated touch and pen events, tablet-sized layouts, and desktop pointer input. Physical iPad Safari/Chrome, Apple Pencil, and the native share sheet still need an on-device check. Simulation cannot verify Pencil latency or operating-system gestures.

## Storage and privacy

No account, analytics, backend, or cloud sync. The current drawing is saved in this browser's local storage. Safari and Chrome have separate storage. Save a project file for a durable backup, especially before clearing browser data or using private browsing. The app reports storage failures rather than claiming a successful save.

An offline cache stores the application files after the first successful online visit. It does not upload drawings. A new cached version takes over after all existing app tabs are closed. The service worker is disabled on localhost during development.

## Develop

No build step or runtime dependencies. Requires Node.js 22 or newer for the local server and checks.

```sh
npm start
```

Open `http://127.0.0.1:4173`. Source files are in `app/`. The drawing model, SVG export, input validation, coordinate transforms, and history live in `app/core.js`. The interface and pointer handling are in `app/app.js`.

```sh
npm test
```

For integration checks, start the server and open `http://127.0.0.1:4173/checks/browser.html`. These use a separate test storage key and cover drawing, object transforms, history, pinch cancellation, Pencil-only input, pointer cancellation, text, autosave restoration, SVG/PNG output, and responsive layout. Synthetic pointer capture is stubbed in the test frame. Physical pointer input should also be checked in the app.

## Publish

In repository Settings → Pages, select **GitHub Actions** as the source. The included workflow runs the model checks, then publishes `app/` on pushes to `main`. It can also be run manually. Increment the cache version in `app/sw.js` whenever application assets change.

## References

- [VectorCraft](https://github.com/storytold/vectorcraft), workflow inspiration only. No VectorCraft code or artwork is bundled.
- [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [MDN Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)

The source is published for Ryan Brown's project. No additional application source license is granted.
