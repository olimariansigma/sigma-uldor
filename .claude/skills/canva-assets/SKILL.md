---
name: "canva-assets"
description: "Use when a design, 3D model, game, website or other project needs image assets (illustrations, icons, backgrounds, textures, photos) — generate or edit them with Canva AI."
---

# Canva AI for assets

The user has Canva connected (tools named mcp__Canva__*). When any project needs image assets, use Canva AI to make them instead of drawing everything by hand in SVG or code. The user is phone-only, so Canva is also a good place for them to open and tweak results themselves.

## When to use it
- Illustrations, backgrounds, icons, stickers, photos-style images for posters, banners, thumbnails, mockups and websites
- Textures for 3D models or Minecraft resource packs (ask for flat, seamless, square textures)
- Cleaning up the user's own images: remove background, split an image into layers
- Whole quick designs when the user wants something done in Canva
Don't use it for simple shapes, text, charts or diagrams; code does those better.

## Loading the tools
Canva tools are deferred. Load the ones needed in ONE ToolSearch call, e.g.:
select:mcp__Canva__generate-image,mcp__Canva__get-generate-image-job,mcp__Canva__remove-background,mcp__Canva__upload-asset-from-url,mcp__Canva__get-assets
Add others as needed (generate-design, export-design, get-export-formats, separate-image-layers, list-brand-kits, create-design). Follow each tool's own description for parameters.

## Workflow
1. Write a specific prompt: subject, style (flat vector, pixel art, watercolor, photo, low-poly...), colors, composition, background (plain/transparent if it will be cut out), aspect ratio.
2. Generate with generate-image, then poll get-generate-image-job until it's done. Generate 2-4 options when the look is open.
3. Look at the results. Pick the best or regenerate with a sharper prompt.
4. Post-process if needed: remove-background for cutouts, separate-image-layers to edit parts.
5. If the user has a brand kit (list-brand-kits), use its colors and fonts.
6. Bring the asset into the project:
   - If it's going into a Canva design, keep it in Canva.
   - Otherwise get its URL/export and use it in the design, page or model. If the workspace can't download it (network blocked), say so in one line and either keep that part in Canva or ask the user to save and attach the image.
7. Check the final piece with the asset in place before sending.

## Rules
- Never prompt for known characters, logos, brands, celebrities/real people, or copies of existing artworks. Original content only.
- Tell the user in one line which assets came from Canva AI.
- Don't spend lots of generations: about 3 rounds max, then show the best and ask what to change.