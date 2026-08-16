# Excalidraw diagrams

Fenced `excalidraw` blocks hold an Excalidraw scene and render in place, the same way `mermaid` blocks do.

## Request path

```excalidraw
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "browser",
      "type": "rectangle",
      "x": 40, "y": 40, "width": 200, "height": 90,
      "angle": 0, "seed": 1101,
      "strokeColor": "#1971c2", "backgroundColor": "#a5d8ff",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100,
      "roundness": { "type": 3 }
    },
    {
      "id": "browser-label",
      "type": "text",
      "x": 40, "y": 72, "width": 200, "height": 25,
      "angle": 0, "seed": 1102,
      "strokeColor": "#1971c2", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100,
      "text": "Browser", "fontSize": 20, "fontFamily": 1,
      "textAlign": "center", "verticalAlign": "middle",
      "containerId": "browser", "lineHeight": 1.25
    },
    {
      "id": "arrow-1",
      "type": "arrow",
      "x": 250, "y": 85, "width": 120, "height": 0,
      "angle": 0, "seed": 1103,
      "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100,
      "points": [[0, 0], [120, 0]],
      "startArrowhead": null, "endArrowhead": "arrow"
    },
    {
      "id": "server",
      "type": "rectangle",
      "x": 380, "y": 40, "width": 200, "height": 90,
      "angle": 0, "seed": 1104,
      "strokeColor": "#2f9e44", "backgroundColor": "#b2f2bb",
      "fillStyle": "hachure", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100,
      "roundness": { "type": 3 }
    },
    {
      "id": "server-label",
      "type": "text",
      "x": 380, "y": 72, "width": 200, "height": 25,
      "angle": 0, "seed": 1105,
      "strokeColor": "#2f9e44", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100,
      "text": "Bun server", "fontSize": 20, "fontFamily": 1,
      "textAlign": "center", "verticalAlign": "middle",
      "containerId": "server", "lineHeight": 1.25
    },
    {
      "id": "arrow-2",
      "type": "arrow",
      "x": 480, "y": 140, "width": 0, "height": 90,
      "angle": 0, "seed": 1106,
      "strokeColor": "#e03131", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "dashed",
      "roughness": 1, "opacity": 100,
      "points": [[0, 0], [0, 90]],
      "startArrowhead": null, "endArrowhead": "triangle"
    },
    {
      "id": "disk",
      "type": "ellipse",
      "x": 380, "y": 240, "width": 200, "height": 90,
      "angle": 0, "seed": 1107,
      "strokeColor": "#f08c00", "backgroundColor": "#ffec99",
      "fillStyle": "cross-hatch", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 2, "opacity": 100
    },
    {
      "id": "disk-label",
      "type": "text",
      "x": 380, "y": 272, "width": 200, "height": 25,
      "angle": 0, "seed": 1108,
      "strokeColor": "#f08c00", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100,
      "text": "/data mount", "fontSize": 20, "fontFamily": 1,
      "textAlign": "center", "verticalAlign": "middle",
      "containerId": "disk", "lineHeight": 1.25
    },
    {
      "id": "decision",
      "type": "diamond",
      "x": 60, "y": 220, "width": 180, "height": 130,
      "angle": 0, "seed": 1109,
      "strokeColor": "#9c36b5", "backgroundColor": "#eebefa",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100
    },
    {
      "id": "decision-label",
      "type": "text",
      "x": 60, "y": 272, "width": 180, "height": 25,
      "angle": 0, "seed": 1110,
      "strokeColor": "#9c36b5", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100,
      "text": "cached?", "fontSize": 20, "fontFamily": 1,
      "textAlign": "center", "verticalAlign": "middle",
      "containerId": "decision", "lineHeight": 1.25
    }
  ],
  "appState": { "viewBackgroundColor": "#ffffff" }
}
```

## Unreadable scenes

A block that is not a valid scene reports the problem instead of failing silently:

```excalidraw
{ "type": "excalidraw" }
```
