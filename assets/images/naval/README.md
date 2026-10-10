# Naval game art

Original artwork created for this game with the built-in image_gen tool, then cropped and resized with Pillow. No Craftpix artwork is included. The relevant free pack was inspected, but its download requires account sign-in:
https://craftpix.net/freebies/free-top-down-military-boats-pixel-art/
https://craftpix.net/download/43968/

## Runtime assets

- `landing`, `destroyer`, `submarine`, `carrier`: transparent ship sprites, 320 pixels wide, all bows pointing right.
- `container`, `warehouse`, `tank`, `radar`, `lighthouse`, `crane`: transparent harbor props, up to 160×160 pixels.
- `water`, `concrete`: 128×128 repeating ground textures.

All runtime files are WebP; alpha channels are preserved. The ship and prop atlases were inspected before cropping. Props were individually cropped to their actual bounds because the generated objects did not perfectly respect the requested grid. The generated terrain is repeated as a small texture; perfect seamless edges are not guaranteed.

`assets/naval-art.js` loads the twelve images once. The harbor and props are drawn into the existing background canvas and refreshed when loading finishes. Preview cards use the same harbor renderer. Dynamic drawing adds ship headings, wakes, gentle bobbing, radar sweeps and navigation lights. Reduced-motion mode disables bobbing and light/radar motion; pauses stop the animation clock. Primitive fallbacks keep the game playable when an image is unavailable.

Open water occupies the first four columns of PORT. These cells are blocked for construction. The warehouse and lighthouse were moved onto the pier, and a crane was added. Enemy routes, health, damage and wave configuration are unchanged.

## Final prompt set

### Ships

Use case: stylized-concept. Asset type: production game sprite atlas, transparent background. Create ONE square 1024x1024 atlas with exactly FOUR isolated top-down military ship sprites in a precise 2 by 2 grid of equal 512x512 cells, no grid lines. Top left: small gray-green landing craft with open troop well and bow ramp. Top right: steel blue naval destroyer with two gun turrets and radar mast. Bottom left: dark slate submarine with conning tower and fins. Bottom right: large gray aircraft carrier with runway deck markings and tiny parked aircraft. All ships seen strictly orthographic from directly above, all bows point RIGHT, long horizontal hulls, no perspective/isometric, no water, no wakes, no scenery. Each ship centered within its own cell, fits within 420x260 pixels with generous transparent margin, no overlap or cropped parts. Cohesive hand-painted polished 2D strategy game art, clear silhouettes, moderately detailed readable at 60 pixels wide, steel materials, restrained cyan window accents and warm tiny lights, soft baked shading, no text, no logos, no flags. Background genuinely transparent.

### Props

Use case: stylized-concept. Asset type: production naval port prop sprite atlas with genuine transparent background. ONE landscape image 1536x1024, six isolated objects precisely arranged in a 3 column by 2 row grid of equal 512x512 cells, no grid lines. Top row left: rusty orange ribbed shipping container seen directly from above. Top row middle: steel blue corrugated warehouse roof with loading bay details. Top row right: circular pale gray fuel storage tank with pipe and small orange hazard detail. Bottom row left: compact concrete square radar installation with dish and cyan electronics. Bottom row middle: white-red lighthouse with circular concrete base seen directly above. Bottom row right: yellow industrial gantry dock crane with heavy steel base and long boom, seen directly from above. Every object centered within its own cell, fits inside 400x400px, generous fully transparent margin, no overlap, no shadows beyond cell bounds. Strict orthographic directly above top-down view suitable for a strategy game, cohesive polished hand-painted 2D art, realistic steel and concrete textures but readable small silhouettes, navy/slate palette with amber accents. No water, terrain, background, text, logos, flags, labels, grid, or UI.

### Props transparency edit

Use case: background-extraction. Edit target: the supplied naval port props atlas. Remove ONLY the entire colored gradient/background behind all six objects and make that area genuinely transparent with alpha. Keep the exact 1536x1024 canvas, same 3x2 grid positions, every object unchanged, sharp clean outer edges, all details, colors, structures, and proportions preserved. Preserve holes between crane structures as transparent. No other changes, no new objects, no checkerboard baked into pixels.

### Terrain

Use case: stylized-concept. Asset type: one production ground-material texture atlas for a top-down naval harbor strategy game. ONE landscape 1024x512 image split into exactly two equal square 512x512 texture panels without border or gutter. LEFT HALF: seamless dark navy teal seawater from directly overhead, small restrained blue ripples and delicate reflected light, uniformly subtle, no foam islands, no objects. RIGHT HALF: seamless weathered slate gray dock concrete from directly overhead, subtle square concrete paving seams, fine aggregate, light hairline cracks and restrained stains, no objects or painted symbols. Each half individually tileable with matched edges, flat orthographic uniform lighting, polished painterly realistic 2D strategy game art. Both textures low contrast to keep units legible, not photographic perspective, no horizon, no gradient, no large features, no text, no logos, no UI.
