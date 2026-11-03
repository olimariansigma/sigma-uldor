---
name: "design"
description: "Use when making a visual design: poster, flyer, logo, banner, thumbnail, app or web mockup, social graphic, or any piece judged by how it looks."
---

# Design

The user works only from a phone, so every result must be viewable and downloadable on a phone. No desktop apps, no Termux.

## 1. Pin down the brief (ask only what's missing, max 2 questions)
- What it is and where it goes (Instagram post, Discord banner, YouTube thumbnail, printed A4 poster, app screen...)
- Size / aspect ratio (use the platform's standard size if they name a platform)
- Text that must appear, exactly
- Mood or style, colors, anything to avoid
If the user isn't around to answer, pick sensible defaults and say which ones you picked.

## 2. Pick the tool
- If the Artifact tool lists a Design type, make the design from that type (it gives an editable canvas and exports to PDF/image).
- Otherwise build it as a single self-contained HTML/SVG file, render it to PNG with Playwright at deviceScaleFactor 2, and send the PNG plus publish the HTML as an artifact.
- If the user asks for a specific file (PNG, SVG, PDF), deliver that file.

## 3. Design rules
- One clear focal point; strong hierarchy (headline > subhead > details).
- Max 2 fonts, 3-5 colors. Check text contrast is readable.
- Generous margins; align everything to a grid.
- Make text big enough to read on a phone screen at the final size.
- Use original shapes, illustrations and icons. Never copy known logos, characters, album covers or brand designs.

## 4. Check before sending
- Render it and actually look at the image: nothing cut off, no overlapping text, no typos, correct size.
- Fix problems, then send.

## 5. Deliver
- Send the result with one line of context.
- When the direction is open, offer 2-3 quick variations (different layout or color) instead of one.
- Offer one natural next step (e.g. other sizes for other platforms).