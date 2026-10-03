# MW2005 Models Phase 3 — Draw Capture Toolkit

This folder contains the capture-side interchange design used by Marocto Racing. It does **not** contain EA game assets.

## Goal

The Xbox 360 `nfsmw-nx` port already exposes the Direct3D-level points needed to observe real NFSMW geometry: vertex/index buffers, stream binding, vertex declarations and Draw* calls. Phase 3 defines a small raw draw-stream format and an offline assembler that turns selected draws into the Phase 2 `capture.json` format.

The public Marocto Racing repository never needs to contain proprietary car models. A user can capture/export geometry from a legally owned copy and place the generated `capture.json` beside the portable EXE.

## Raw draw stream v1

File header:

```json
{
  "format": "marocto-mw-draw-stream",
  "version": 1,
  "source": "nfsmw-nx",
  "axes": { "forward": "z", "up": "y" },
  "materials": [],
  "draws": []
}
```

Each `draws[]` item may contain:

- `frame`: frame number used for filtering;
- `role`: `body` or `wheel`;
- `tag`: optional capture-side label such as `player-car`;
- `shader`: optional shader identifier for filtering;
- `material`, `texture`, `color`;
- `positions`: XYZ floats;
- `normals`: optional XYZ floats;
- `uvs`: optional UV floats;
- `indices`: optional triangle indices. Without indices, positions must already be triangle-list data.

Phase 3 validates every index and finite numeric value before producing a game-readable model.

## Build a car capture

From the repository root:

```powershell
npm run mw:capture:build -- "D:\MW-Capture\raw-draws.json" "D:\MW-Capture\capture.json" --frame 120 --tag player-car
```

Useful inspection command:

```powershell
npm run mw:capture:build -- "D:\MW-Capture\raw-draws.json" --summary
```

Optional filters: `--frame`, `--tag`, `--shader`, `--min-triangles`.

The assembler merges draw calls that share a material, deduplicates identical position/normal/UV vertices, preserves triangle indices and keeps wheel geometry separate from body geometry.

## Put it in Marocto Racing

Example for the M3 GTR slot:

```text
Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json
```

Then restart the portable EXE. Load priority remains:

```text
capture.json -> body.obj/body.mtl/wheel.obj -> procedural fallback
```

## nfsmw-nx integration target

The capture hook should remain separate from Marocto Racing itself. On the `nfsmw-nx` side it needs to observe the already-known Direct3D state around `SetStreamSource`, `SetIndices`, `SetVertexDeclaration` and `Draw*`, decode the selected vertex streams/index buffer and write the raw draw-stream JSON above.

Do not blindly dump an entire race. Capture one controlled frame/vehicle selection and label the selected car draws. Scene, HUD, shadows and post-processing also produce Draw calls.

`nfsmw-nx` is GPL-3.0; any source patch directly linked into it should follow that project's license. The Marocto Racing offline JSON assembler is independent and does not link against `nfsmw-nx`.
