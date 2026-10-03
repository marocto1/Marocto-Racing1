# Marocto Racing — MW2005 Models Phase 5 capture kit

Development-only capture bridge for the public `StevensND/nfsmw-nx` port. It contains no EA game assets. Actual car geometry/material metadata only appears when the patched renderer is run with the user's own compatible MW2005 Xbox 360 game files.

## What Phase 5 captures

Phase 5 keeps the one-frame trigger from Phase 4 and adds the data needed for a useful car model:

- triangle-list positions and indices after nfsmw-nx has already decoded Xenos fetches/endian/index ranges;
- vertex normals when the original declaration exposes NORMAL0;
- TEXCOORD0 UVs from the exact nfsmw-nx/XenosRecomp semantic location 4;
- common float32, float16, SNORM16 and UNORM16 attribute formats;
- stable material identity from VS/PS plus the pixel-sampler fetch state;
- original source vertex-buffer address as `object`, used by automatic isolation;
- one triggered frame only, so normal play is not continuously dumped.

Texture **pixels are not copied yet**. Material boundaries and UVs are preserved now; a later texture-export phase can attach real texture images without rebuilding the mesh.

## Install into nfsmw-nx

From PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\apply_to_nfsmw_nx.ps1 -NfsmwNxRoot "D:\nfsmw-nx"
```

The installer is anchor-guarded. It copies the bridge, adds it to `app/CMakeLists.txt`, includes it from `nfsmw_nativo_dibujos.cpp`, and inserts capture after nfsmw-nx resolves vertex sources and indices. It can replace the older Marocto Phase 4 capture block in an already patched checkout.

## Capture the car

1. Build and run the patched **PC** nfsmw-nx with your compatible game files.
2. Open a clean garage/car-selection view and leave the desired car visible. Start with the BMW M3 GTR.
3. Run:

```cmd
CAPTURE_MW_CAR.cmd "D:\path\to\folder\containing\nfsmw.exe"
```

4. Leave the game rendering for at least one more frame.
5. The hook writes:

```text
<exe folder>\marocto_capture\raw-draws.json
```

## Inspect the frame

```powershell
node mw-draw-capture-build.mjs "D:\nfsmw\marocto_capture\raw-draws.json" --summary
```

The Phase 5 summary includes draw count, triangle count, UV/normal coverage, top materials, shaders and source `object` groups.

## Automatic car isolation

Try the automatic path first:

```powershell
node mw-draw-capture-build.mjs `
  "D:\nfsmw\marocto_capture\raw-draws.json" `
  "D:\Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json" `
  --auto-car
```

Phase 5 groups draws by their source vertex-buffer/object identity and scores their dimensions/triangle counts. Repeated compact geometry is treated as a wheel candidate; large garage/scenery meshes are rejected; car-like body groups are retained. The decision is recorded in `metadata.autoIsolation` inside `capture.json`.

This is intentionally conservative and cannot be guaranteed for every MW garage scene before it is tested against real game files.

## Manual fallback

If automatic isolation chooses the wrong object, inspect `--summary` and filter directly:

```powershell
node mw-draw-capture-build.mjs "...\raw-draws.json" "...\capture.json" --object 12345678
```

or by shader/tag:

```powershell
node mw-draw-capture-build.mjs "...\raw-draws.json" "...\capture.json" --shader "vs123_ps456"
```

Marocto Racing loads the resulting `capture.json` automatically on its next launch.

## Material behavior before texture export

Each distinct sampler/shader state gets a stable `mwmat_...` material ID. Until actual texture images are exported, the Phase 5 assembler gives these materials deterministic fallback colors so paint/glass/tire/light sections remain visually separate instead of becoming one grey mesh.

## Validation

The release CI compiles the C++23 capture bridge, makes it generate a real test `raw-draws.json` containing normals/UV/material identity, feeds that through the same Node assembler used for MW captures, runs the automatic isolation regressions, validates the PowerShell patch installer on Windows, runs the full racing regression suite, and only then builds the PC `.exe` and capture-kit ZIP.
