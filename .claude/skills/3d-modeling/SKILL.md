---
name: "3d-modeling"
description: "Use when the user wants a 3D model: objects for 3D printing (STL), game or web assets (GLB/OBJ), Minecraft models, or a 3D preview of an idea."
---

# 3D modeling

The user works only from a phone (no computer, no Termux). All modeling happens in Claude's cloud workspace with code; the user gets files plus a preview they can view and rotate on their phone.

## 1. Brief (ask only what's missing, max 2 questions)
- What the object is and what it's for: 3D printing, a game/web asset, Minecraft, or just to see it
- Real-world size in mm (for printing) or rough scale
- Key details, style (realistic, low-poly, blocky), colors
If the user isn't around, pick sensible defaults and say which.

## 2. Pick the approach
- Mechanical / printable parts (boxes, brackets, holders, cases): CadQuery or build123d (pip install). Make it parametric: put key dimensions as variables at the top.
- Simple shapes, low-poly, or combining primitives: trimesh + numpy.
- Organic or more artistic models: try Blender's Python module (pip install bpy; needs a matching Python version). If it won't install, fall back to trimesh and say so.
- Minecraft Java block/item models: write the model JSON (elements with from/to cubes on the 16x16x16 grid, faces, textures) plus any texture PNGs, and say where they go in the resource pack.
- Install with pip --break-system-packages. Check what's installed first.

## 3. Export the right format
- 3D printing: STL (also 3MF if asked). Watertight mesh, flat base, walls at least ~1.2 mm, avoid big overhangs over 45 degrees; mention if supports are needed.
- Games / web / AR: GLB (with colors/materials). OBJ if asked.
- Minecraft: .json model (+ textures), zipped if there are several files.

## 4. Check before sending
- Load the exported file back and verify: it opens, is watertight (for printing), and the bounding-box size matches the requested dimensions.
- Render preview PNGs from 2-3 angles and look at them; fix anything wrong.

## 5. Deliver
- Send the model file(s) and the preview images.
- Publish an artifact: one self-contained HTML page with a three.js (or model-viewer) viewer and the GLB embedded as base64, so the user can spin the model with a finger on their phone.
- Give the key dimensions in one line, and offer one next step (e.g. tweak a size, add a feature, export another format).