# Marocto Racing v1.3

Two players on one Android screen, with an original native WebGL2 renderer. No Three.js, external car models or runtime CDN dependencies. Capacitor retains the existing `com.marocto.racing` application ID.

## Play and build

```bash
npm ci
npm run dev
```

Open `http://localhost:4173`. Select each player's car in the garage, then start a 1, 3 or 5 lap race. The three-second countdown precedes movement. The minimap dots identify players; small squares identify their next checkpoint. The ↺ button returns a car to its last validated checkpoint without awarding progress. Returning from the background requires Resume and clears held inputs.

| Player | Drive / brake / reverse | Steering | N₂O | Handbrake | Recover |
| --- | --- | --- | --- | --- | --- |
| P1 | W / S | A / D | Shift | Space | R |
| P2 | ↑ / ↓ | ← / → | Enter | Right Ctrl | Backspace |

Touch buttons work simultaneously for both players and retain a held action when a finger leaves its button. RU / UZ / EN cover menus, results, status and help. `InputManager.setGamepad(player, state)` is the reserved analog channel; physical controller discovery/mapping is future work.

```bash
npm run check
npm test
npm run test:browser
npm run android:prepare
```

On Windows, keep the checkout and caches on D: or E:. With Java 21 and Android SDK 35 available:

```powershell
npm run android:prepare
Set-Location android
.\gradlew.bat assembleDebug --no-daemon
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions generates the Android project, runs the same checks, and uploads **Marocto-Racing-v1.3-debug.apk** in **Marocto-Racing-APK**. Android version is 1.3.0, code 130, minimum SDK 23, target SDK 35. Sensor landscape permits both landscape orientations; browser UI also handles portrait. Android platform files remain generated rather than checked in, matching the original repository workflow.

Debug builds now cache their debug signing key across Actions runs. A previously installed debug APK may have a different signature because older runs generated a new key. Uninstalling that old build may be needed for the first v1.3 installation; production signing remains a separate release task.

## v1.3 systems

- `engine.js`: existing WebGL2 pipeline extended with immutable colored meshes, correct surface normals, reusable matrices, fog and independent chase camera state. Static track features are batched into chunks, distant chunks culled by distance. Render scale adapts from 1.0 to 0.55 and caps device pixel ratio at 1.5.
- `geometry.js` / `cars.js`: six original inspired-by silhouettes, lofted bodywork, sloped glass, roof lines, wheel arch contours, bumpers, lights, vents, trim, mirrors and wings. Four separate cylindrical wheels with visible spokes spin from signed longitudinal speed; front wheels follow the steering rack. These are unlicensed designs, not accurate manufacturer models.
- `track.js`: a closed, approximately **1,543 metre** Catmull-Rom circuit with explicitly stored world coordinates, sample arc lengths and local tangents. Asphalt, edge lines, alternating curbs, runoff, barriers, snowy patch, grass, start/finish gantry, pit buildings, grandstand and vegetation share this coordinate system. **24 finite checkpoint planes** must be crossed forward and in sequence before finish can award a lap. Neither race time nor distance awards laps.
- `physics.js`: fixed **120 Hz** planar dynamics with world velocity, local longitudinal/lateral velocity, steering angle, wheelbase, yaw inertia/rate, nonlinear front/rear slip-angle forces, friction budget, drag, rolling resistance, braking, reverse, N₂O and rear grip loss under handbrake. Asphalt, curbs, grass and snow use different grip/resistance. Continuous track-boundary projection with restitution/friction preserves glancing motion; oriented car rectangles exchange collision impulses and are separated before wall resolution.
- `input.js`: separate touch, keyboard and future gamepad channels, pointer capture, per-pointer accounting and cancellation/background cleanup. Gameplay consumes player actions rather than DOM keys.
- `game.js` / `ui.js`: race lifecycle, countdown, ordered checkpoint progress, winner/rematch, preview garage, minimap, responsive controls, translations and context loss handling.

## Verification

Simulation regression checks cover all six classes completing a full lap using real steering/throttle/braking dynamics, grip, inertia, handbrake, barriers, car contacts, reverse, N₂O, ordered gates, invalid finish shortcuts and checkpoint-preserving recovery.

Browser checks use Chromium with real WebGL2/SwiftShader and actual keyboard/CDP touch input: garage selection and six previews, language switching, start/countdown, independent split cameras, both keyboards, four simultaneous fingers, pointer capture/cancellation, a full dynamics lap/result/rematch, and 320×568, 393×852, 640×360 and 1280×720 layouts. The npm-bundled browser avoids a separate CI browser download. Test screenshots are uploaded by Actions. `?debug=1` enables access to the actual simulation for these tests; `MR.getDiagnostics()` provides a read-only snapshot on demand.

Desktop browser checks establish correctness, not an Android GPU FPS guarantee. Physical device thermal behavior and touch ergonomics still require device testing. Physics is a simplified planar model without suspension, wheel hop, drivetrain gears or mesh-based contact deformation.
