# Marocto Racing — MW2005 Models Phase 7 capture kit

Development-only capture bridge for the public `StevensND/nfsmw-nx` port. The kit contains no EA game assets. Actual geometry and texture pixels are produced only when the patched renderer is run with the user's own compatible MW2005 Xbox 360 game files.

## What Phase 7 adds

Phase 7 keeps the Phase 5/6 one-frame geometry and texture pipeline and reconstructs a fuller material graph for each captured draw:

- positions, triangle indices, NORMAL0 and TEXCOORD0 UVs;
- stable `materialKey` from VS/PS plus sampler fetch state;
- original sampler names from the 2005 D3D constant table;
- sampler type and register, including metadata for cube/environment samplers;
- base-level 2D Xenos texture capture from guest memory;
- Xenos tiled and linear reads, endian transform and texture swizzle;
- RGBA8 / 8888 plus DXT1, DXT2/3 and DXT4/5 decoding and PNG conversion;
- roles such as albedo, detail, normal, emissive, specular, mask, rubber, shadow and environment;
- material surfaces such as paint, glass, light, rubber, metal, wheel and detail;
- generated roughness, reflectivity, opacity, emissive, normal strength and detail strength;
- automatic source-object body/wheel isolation with manual `--object` / `--shader` fallback.

Marocto Racing's Phase 7 WebGL2 path consumes those maps as a multi-map material with normal mapping, Fresnel-style reflection, emissive lighting and alpha-blended glass.

## Current cube-map limitation

Cube/environment sampler **identity and fetch metadata are captured**, but Phase 7 does not yet export all six cubemap faces to PNG. If a usable 2D environment map is not present, Marocto Racing uses the material's captured/derived reflectivity with a procedural sky reflection. A later phase can replace that fallback with the actual MW cubemap faces without changing the material format again.

Only the base mip of supported 2D textures is exported. Unsupported pixel formats are kept as sampler metadata rather than guessed.

## Install into nfsmw-nx

Use the Phase 7 wrapper from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\apply_phase7_materials_to_nfsmw_nx.ps1 -NfsmwNxRoot "D:\nfsmw-nx"
```

It first installs the tested Phase 6 geometry/texture bridge, then extends the public nfsmw-nx shader metadata parser so the original sampler constant-table names are preserved for the capture. The patch is anchor-guarded and does not bundle the game's shader library or assets.

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

Metadata-only sampler entries such as cube maps appear in `raw-draws.json` even when they have no `.rgba` sidecar.

## Build the ready Marocto capture

The release ZIP includes a one-command wrapper:

```cmd
BUILD_CAPTURE.cmd "D:\nfsmw\marocto_capture\raw-draws.json" "D:\Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json"
```

It runs automatic car isolation, converts captured RGBA sidecars into `textures/*.png`, classifies sampler roles and material surfaces, and writes the complete material graph into `capture.json`.

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

The summary includes sampler role/name counts alongside materials, shaders, source objects, triangles and UV/normal coverage. If automatic isolation chooses the wrong object, use the reported object or shader directly:

```powershell
node mw-draw-capture-build.mjs "...\raw-draws.json" "...\capture.json" --object 12345678
node mw-draw-capture-build.mjs "...\raw-draws.json" "...\capture.json" --shader "vs123_ps456"
```

## Validation

Release CI compiles the C++23 bridge, makes it emit a geometry draw, a real 2D RGBA texture and a metadata-only cube/environment sampler, converts the 2D sidecar to PNG through the production assembler, verifies the Phase 7 material graph, exercises the PowerShell nfsmw-nx patch installer, runs the complete Marocto Racing regression suite, and only then builds the separate Windows `.exe` and Phase 7 capture-kit ZIP.