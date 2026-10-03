# MW2005 Native Capture v1

This folder documents the interchange format used by Marocto Racing Models Phase 2.

The goal is to keep the public game free of proprietary EA assets while allowing a user to capture geometry from a legally owned copy of Need for Speed: Most Wanted (2005) and load it locally.

## Load order

For every car, Marocto Racing checks:

1. `Marocto-Racing-Data/Models/mw2005/<car>/capture.json`
2. `body.obj` + optional `body.mtl` / `wheel.obj`
3. the built-in procedural fallback

Supported car folder ids are `bmwm3gtr`, `skyline`, `supra`, `rx7`, `lancerevo8`, and `911turbo`.

## Capture JSON

Top-level fields:

- `format`: must be `marocto-mw-native-capture`
- `version`: currently `1`
- `source`: free text, for example `nfsmw-x360`
- `axes.forward` and `axes.up`: two distinct values from `x`, `y`, `z`
- `materials`: optional material table
- `body`: one or more indexed triangle meshes
- `wheel.meshes`: optional wheel geometry
- `metadata`: optional diagnostic information such as draw ids, shaders, source addresses, car name, or capture frame

Each mesh accepts `positions`, optional `normals`, optional `uvs`, optional `indices`, `material`, optional `color`, and optional `texture`. If normals are missing, Marocto Racing generates face normals. If indices are missing, vertices are treated as an already-expanded triangle list.

The loader validates finite values, index ranges, vertex counts, axes and format version before allocating WebGL buffers.

## Why this matches nfsmw-nx

`StevensND/nfsmw-nx` already hooks the original Xbox 360 Direct3D calls around vertex buffers, index buffers, stream sources, vertex declarations and the Draw* entry points. A future capture hook can serialize the resolved draw data into this format without copying the nfsmw-nx renderer into Marocto Racing.

No nfsmw-nx GPL source is copied into this project by this format. The capture bridge should be maintained as a separate tool/patch when implemented and tested against the user's own game files.

## Converter

For inspection or editing in Blender/other tools:

```powershell
npm run mw:capture:convert -- "D:\path\capture.json" "D:\path\converted-car"
```

This creates `body.obj`, `body.mtl`, and, when present, `wheel.obj` / `wheel.mtl`.
