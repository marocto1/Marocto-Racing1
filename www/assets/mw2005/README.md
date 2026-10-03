# MW2005 model import slots

This directory intentionally contains no proprietary EA game assets.

Marocto Racing can load car geometry exported from a legally owned copy of Need for Speed: Most Wanted (2005) after conversion to OBJ/MTL plus browser-readable textures (PNG/JPG/WebP).

Expected folders:

- `bmwm3gtr/`
- `skyline/` (Carbon-family fallback for the R34 slot)
- `supra/`
- `rx7/`
- `lancerevo8/`
- `911turbo/`

Each folder may contain:

- `body.obj` — required to replace the procedural body
- `body.mtl` — optional material colors and `map_Kd` textures
- `wheel.obj` — optional separate wheel model; when absent the existing procedural wheel remains
- textures referenced by `body.mtl`

The loader automatically scales a body to the current Marocto Racing physics dimensions, keeps the existing Phase 7 wheelbase/physics, and falls back to the procedural model when a file is absent or invalid.

Do not commit game assets here unless you have redistribution rights. For personal builds the converted files can be placed here before running `npm run pc:build`.
