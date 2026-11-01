// convert a TTF/WOFF to three.js typeface JSON (same algorithm as TTFLoader)
import fs from 'fs';
// usage: npm i --no-save opentype.js@1 && node tools/font2json.mjs Font.woff out.typeface.json
import opentype from 'opentype.js';
const buf = fs.readFileSync(process.argv[2]);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const round = Math.round, scale = (100000) / ((font.unitsPerEm || 2048) * 72);
const glyphs = {};
const res = { glyphs, familyName: font.familyName || font.names.fullName.en, ascender: round(font.ascender * scale), descender: round(font.descender * scale),
  underlinePosition: font.tables.post.underlinePosition, underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { xMin: font.tables.head.xMin, xMax: font.tables.head.xMax, yMin: font.tables.head.yMin, yMax: font.tables.head.yMax },
  resolution: 1000, original_font_information: font.tables.name };
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,-·!?&:/';
for (const ch of chars) {
  const g = font.charToGlyph(ch);
  if (!g) continue;
  const token = { ha: round(g.advanceWidth * scale), x_min: round(g.xMin * scale), x_max: round(g.xMax * scale), o: '' };
  g.path.commands.forEach((c) => {
    if (c.type.toLowerCase() === 'c') c.type = 'b';
    token.o += c.type.toLowerCase() + ' ';
    if (c.x !== undefined && c.y !== undefined) token.o += round(c.x * scale) + ' ' + round(c.y * scale) + ' ';
    if (c.x1 !== undefined && c.y1 !== undefined) token.o += round(c.x1 * scale) + ' ' + round(c.y1 * scale) + ' ';
    if (c.x2 !== undefined && c.y2 !== undefined) token.o += round(c.x2 * scale) + ' ' + round(c.y2 * scale) + ' ';
  });
  glyphs[ch] = token;
}
fs.writeFileSync(process.argv[3], JSON.stringify(res));
console.log('glyphs', Object.keys(glyphs).length);
