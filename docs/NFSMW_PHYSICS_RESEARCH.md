# NFSMW 2005 physics research

This branch is an experiment. It does **not** claim that the original EA Black Box source code is present in `StevensND/nfsmw-nx`.

## What nfsmw-nx actually gives us

`nfsmw-nx` is a Nintendo Switch port of the Xbox 360 build of Need for Speed: Most Wanted (2005). ReXGlue reads the user's own Xbox 360 `default.xex` and generates C++ locally. The generated game C++ is not committed to that repository.

The useful part for handling research is `app/src/nfsmw_prueba_entrada.cpp`. Its test harness can:

- hand the player's car to the original NFSMW AI (`ForceAIControl`);
- trace the player car every frame;
- read heading, world position and velocity from the original game state;
- dump car interfaces and reachable memory for offline analysis.

Documented offsets in that port's current Xbox 360 build include:

- forward vector: car interface + `0x854`, `0x858`;
- position: + `0x884`, `0x888`, `0x88C`;
- velocity: + `0x894`, `0x898`, `0x89C`.

That provides a practical calibration route if a legally obtained compatible Xbox 360 game image / `default.xex` is available locally: run repeatable throttle, brake, steering, handbrake and nitrous tests, capture traces, then fit Marocto Racing's model to the measured response.

## Current experimental adapter

`www/physics-nfsmw.js` is a clean implementation for Marocto Racing that adds an arcade drivetrain and handling layer while keeping our WebGL2 engine and collision system:

- six-speed automatic gearbox and RPM state;
- broad torque curve and shift torque cut;
- speed-sensitive steering rack;
- nonlinear front/rear slip response;
- aerodynamic load contribution to grip;
- stability / traction assists;
- handbrake rear-grip reduction;
- surface grip integration;
- N2O integrated into drive force.

This is phase 1: a MW-style reconstruction scaffold, not a byte-for-byte copy of EA physics. Exact calibration needs traces generated from the user's own NFSMW Xbox 360 executable.
