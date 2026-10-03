# Marocto Racing — MW2005 Models Phase 4 capture kit

This folder contains a **development-only capture bridge** for the public `StevensND/nfsmw-nx` port. It does **not** contain EA game assets and cannot produce a car model by itself. The hook only exports geometry that a legally owned copy of Need for Speed: Most Wanted (2005), Xbox 360 edition, causes the renderer to draw.

## What Phase 4 captures

The current Phase 4 hook is intentionally conservative:

- it runs after `nfsmw-nx` has decoded the Xenos index buffer and vertex fetch addresses;
- it captures triangle-list geometry only;
- it exports **position + triangle indices**;
- it records the VS/PS numbers, source vertex-buffer address and frame number for later filtering;
- normals and UVs are not exported yet — Marocto Racing can generate face normals, and UV/material reconstruction is planned for the next model phase;
- only one triggered frame is captured, so normal play is not constantly dumping data.

The output is already the raw format understood by Marocto Racing Models Phase 3:

`marocto-mw-draw-stream` v1 → `scripts/mw-draw-capture-build.mjs` → `capture.json`.

## Install into an nfsmw-nx checkout

From PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\apply_to_nfsmw_nx.ps1 -NfsmwNxRoot "D:\nfsmw-nx"
```

The installer is guarded by exact anchors. It:

1. copies `nfsmw_marocto_capture.h/.cpp` into `app/src`;
2. adds `src/nfsmw_marocto_capture.cpp` to `app/CMakeLists.txt`;
3. includes the bridge from `nfsmw_nativo_dibujos.cpp`;
4. inserts the capture block immediately after nfsmw-nx resolves the draw's vertex sources and indices.

If the upstream source changes and an expected anchor is missing, the installer stops instead of guessing.

## Capture a car

1. Build and run the patched **PC** version of `nfsmw-nx` normally with your own compatible game files.
2. Enter a garage / car-selection view and leave the desired car on screen. Start with the BMW M3 GTR.
3. Run:

```cmd
CAPTURE_MW_CAR.cmd "D:\path\to\folder\containing\nfsmw.exe"
```

4. Keep the game rendering for another frame.
5. The hook writes:

```text
<exe folder>\marocto_capture\raw-draws.json
```

## Convert the captured frame for Marocto Racing

From the Marocto Racing checkout:

```powershell
node scripts\mw-draw-capture-build.mjs `
  "D:\path\to\nfsmw\marocto_capture\raw-draws.json" `
  "D:\Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json"
```

To inspect what was captured before building:

```powershell
node scripts\mw-draw-capture-build.mjs "...\raw-draws.json" --summary
```

You can then filter by a discovered shader/tag if the frame also contains garage scenery:

```powershell
node scripts\mw-draw-capture-build.mjs "...\raw-draws.json" "...\capture.json" --shader "vs123_ps456"
```

The Marocto Racing PC build loads `capture.json` automatically on the next launch.

## Why the hook is inserted here

`nfsmw-nx` already does the hard Xbox 360 work before this point: it resolves vertex fetch constants, byte order, index width, restart/offset handling and guest-memory ranges. The capture bridge reuses that decoded state rather than implementing a second Xenos parser. This keeps the capture path small and reduces the chance of exporting corrupt geometry.

## Current limitation

Until this patch is run against a real compatible MW2005 game image, we can test the capture bridge and the Marocto conversion pipeline, but we cannot truthfully claim that the resulting public Marocto build already contains the original BMW M3 GTR mesh. The actual EA geometry remains outside this repository.
