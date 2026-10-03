# Marocto Racing — MW2005 Models Phase 6 capture kit

Development-only capture bridge for the public `StevensND/nfsmw-nx` port. The kit contains no EA game assets. Actual geometry and texture pixels are produced only when the patched renderer is run with the user's own compatible MW2005 Xbox 360 game files.

## What Phase 6 captures

Phase 6 keeps the Phase 5 one-frame geometry pipeline and adds texture extraction from the same Xenos fetch state used by nfsmw-nx:

- positions, triangle indices, NORMAL0 and TEXCOORD0 UVs;
- stable material identity from VS/PS + sampler fetch constants;
- automatic source-object body/wheel isolation with manual `--object` / `--shader` fallback;
- base-level 2D texture address, width, height, format, tiled flag, endian and swizzle;
- Xenos tiled and linear texture reads from guest memory;
- RGBA8 / 8888 plus DXT1, DXT2/3 and DXT4/5 decoding, including the corresponding AS_16 aliases used by Xenos;
- automatic `.rgba` sidecars -> PNG conversion;
- automatic `materialKey -> textures/*.png` binding in `capture.json`.

Only the base mip is exported because Marocto Racing currently needs a display texture, not the original Xbox mip chain. Unsupported sampler dimensions or formats are skipped rather than guessed.

## Install into nfsmw-nx

From PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\apply_to_nfsmw_nx.ps1 -NfsmwNxRoot "D:\nfsmw-nx"
```

The installer is anchor-guarded. It copies the bridge, adds it to `app/CMakeLists.txt`, includes it from `nfsmw_nativo_dibujos.cpp`, and replaces older Marocto Phase 4/5/6 capture blocks in-place.

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

The raw RGBA files are temporary capture sidecars. They are converted to PNG by the builder.

## Build the ready Marocto capture

The release ZIP includes a one-command wrapper:

```cmd
BUILD_CAPTURE.cmd "D:\nfsmw\marocto_capture\raw-draws.json" "D:\Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json"
```

It runs automatic car isolation, converts captured RGBA sidecars into `textures/*.png`, and writes `capture.json` with those PNGs already attached to the matching materials. Marocto Racing's native-capture loader already understands these texture paths.

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

If automatic isolation chooses the wrong object, use the reported object or shader directly:

```powershell
node mw-draw-capture-build.mjs "...\raw-draws.json" "...\capture.json" --object 12345678
node mw-draw-capture-build.mjs "...\raw-draws.json" "...\capture.json" --shader "vs123_ps456"
```

## Texture fidelity

The Phase 6 patch follows nfsmw-nx's own fetch fields for guest address, dimensions, pitch, tiling and endian, and uses the same Xenos 32x32 tiled-address function already present in its native renderer. DXT blocks are decoded only after the fetch endian transform. Texture swizzle is applied to the final RGBA pixels.

Sampler slots that are not 2D or formats not explicitly supported are ignored. They remain represented by the Phase 5 material fallback rather than being decoded incorrectly.

## Validation

Release CI compiles the C++23 bridge, makes it emit a test draw and a real RGBA texture sidecar, converts that sidecar to PNG through the production assembler, validates material binding and PNG structure, exercises the PowerShell nfsmw-nx patch installer, runs the complete Marocto Racing regression suite, and only then builds the separate Windows `.exe` and Phase 6 capture-kit ZIP.