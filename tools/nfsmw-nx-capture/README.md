# Marocto Racing — MW2005 Models Phase 8 capture kit

Development-only capture bridge for the public `StevensND/nfsmw-nx` port. The kit contains no EA game assets. Geometry, materials, texture pixels and cubemap faces are produced only when the patched renderer is run with the user's own compatible MW2005 Xbox 360 game files.

## What Phase 8 adds

Phase 8 keeps the tested Phase 5-7 geometry and full-material pipeline, then replaces the procedural environment-reflection fallback with real six-face Xenos cubemap capture when the material actually binds a cube sampler.

- positions, triangle indices, NORMAL0 and TEXCOORD0 UVs;
- stable `materialKey` from VS/PS plus sampler fetch state;
- original sampler names from the 2005 D3D constant table;
- 2D texture capture and RGBA8/DXT1/DXT3/DXT5 decode from Phase 6/7;
- six cubemap faces in Xenos/D3D order: `+X, -X, +Y, -Y, +Z, -Z`;
- cubemap face stride from ReX/Xenia `GetGuestTextureLayout`, rather than a guessed byte offset;
- Xenos tiled/linear addressing, endian transform and output swizzle for each face;
- each captured face exported to its own PNG;
- `maps.environmentCube` emitted only when all six faces are present;
- incomplete cubemaps deliberately fall back to the Phase 7 reflection path;
- WebGL2 samples the six captured faces explicitly and applies roughness through generated mip levels;
- cubemap face textures use clamp-to-edge to reduce seams.

The material graph still supports albedo, detail, normal, emissive, specular, mask, rubber, shadow and optional 2D environment maps, plus paint/glass/light/rubber/metal/wheel/detail surface classification.

## Install into nfsmw-nx

Use the Phase 8 wrapper from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\apply_phase8_cubemaps_to_nfsmw_nx.ps1 -NfsmwNxRoot "D:\nfsmw-nx"
```

The wrapper first refreshes the tested Phase 7 patch, then adds a separate cubemap-only capture hook. This keeps the already verified geometry and 2D texture path isolated from the new code.

## Capture the car

1. Build and run the patched PC nfsmw-nx with your compatible game files.
2. Open a clean garage/car-selection view and leave the desired car visible. Start with the BMW M3 GTR.
3. Run:

```cmd
CAPTURE_MW_CAR.cmd "D:\path\to\folder\containing\nfsmw.exe"
```

4. Leave the game rendering for at least one more frame.
5. The hook writes:

```text
<exe folder>\marocto_capture\raw-draws.json
<exe folder>\marocto_capture\textures\*.rgba
```

Cubemap sidecars include face suffixes such as `_fpx_`, `_fnx_`, `_fpy_`, `_fny_`, `_fpz_` and `_fnz_`.

## Build the ready Marocto capture

```cmd
BUILD_CAPTURE.cmd "D:\nfsmw\marocto_capture\raw-draws.json" "D:\Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json"
```

The builder isolates the car, converts 2D and cubemap RGBA sidecars into PNG, classifies samplers/materials and writes a ready `capture.json`. A complete cube appears as:

```text
maps.environmentCube = [px, nx, py, ny, pz, nz]
```

The direct Node command remains available:

```powershell
node mw-draw-capture-build.mjs `
  "D:\nfsmw\marocto_capture\raw-draws.json" `
  "D:\Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json" `
  --auto-car
```

## Inspect / manual fallback

```powershell
node mw-draw-capture-build.mjs "D:\nfsmw\marocto_capture\raw-draws.json" --summary
```

The summary reports `cubeFaces` together with sampler roles/names, materials, shaders, source objects, triangles and UV/normal coverage. If automatic isolation chooses the wrong object, use `--object` or `--shader` just as in Phase 7.

## Fidelity note

The six-face memory stride uses the same ReX/Xenia guest texture-layout code used by nfsmw-nx. The runtime uses explicit D3D/Xenos-style face selection rather than relying on WebGL cubemap orientation conventions. A real user-side capture is still the final visual smoke test for whether an individual face needs a vertical orientation adjustment.

## Validation

Release CI compiles the C++23 bridge, emits one 2D texture plus six cubemap-face sidecars, converts all seven to PNG, verifies the complete `environmentCube` material graph, exercises the Phase 8 PowerShell patch installer, runs the complete Marocto Racing regression suite, builds the Windows `.exe`, packages the Phase 8 capture kit, and publishes them as a separate prerelease. Stable main and all previous model releases remain untouched.