# Canvas Paint Studio

A responsive browser paint app built with React, Vite, Tailwind CSS, Lucide React, and the HTML canvas API.

## Run locally

```bash
npm install
npm run dev
```

## Drawing tools

- Brush and white-background eraser
- Rectangle, ellipse, and line tools with live previews
- Flood fill and color picker
- Adjustable 1–50 px strokes and custom or preset colors
- Undo/redo with keyboard shortcuts: `Ctrl/⌘ Z`, `Ctrl/⌘ Y`, and `Ctrl/⌘ Shift Z`
- Debounced local autosave with automatic restore
- Confirmed clear and high-resolution PNG export
- Persistent light and dark themes in a scroll-free, viewport-fitted workspace

Artwork stays in the browser's local storage. The canvas renders at device pixel ratio (capped at 2×) and exports at its full backing resolution.