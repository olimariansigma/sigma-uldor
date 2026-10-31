# Wrecking Yard

A 3D demolition game. Knock down a brick house piece by piece, haul the rubble to a tracked jaw crusher, and get paid for every piece it crushes. Spend the money on better hammers, more carrying strength, a faster crusher, a gravel sorter, and a demolition excavator with a grapple. Then move on to bigger jobs.

## Download

| Platform | File |
|---|---|
| Windows 10/11 (64-bit) | [`release/WreckingYard-1.0.0-Windows.exe`](release/WreckingYard-1.0.0-Windows.exe): portable, no install. Double-click to play. |
| Android 7.0+ | [`release/WreckingYard-1.0.0-Android.apk`](release/WreckingYard-1.0.0-Android.apk): allow "install unknown apps", then open the APK. |

The Windows exe is not code-signed, so SmartScreen may warn you the first time. Click **More info → Run anyway**.

## How to play

1. **Smash** the walls with your hammer. Bricks with nothing holding them up fall down, so cut low and let gravity help.
2. **Pick up** the rubble and **throw** it into the yellow hopper on the crusher. Throws aim themselves when you face the crusher. You can also climb the stairs to the platform.
3. Every crushed piece earns money. Furniture, windows, and steel are worth more than bricks.
4. Buy the **excavator** in the shop. Its grapple tears walls apart and carries a whole load of rubble to the hopper.
5. Clear 90 % of a building for the job bonus, then unlock the next site in **Shop → Jobs**.

| | Keyboard / mouse | Touch |
|---|---|---|
| Move / look | WASD + mouse, Shift to run, Space to jump | left stick, drag to look |
| Hammer | Left click | 🔨 |
| Pick up / throw | Q or right click / G | ✋ / 🧱 |
| Enter / exit excavator | E | ENTER / EXIT |
| Excavator | W S drive, A D steer, ← → swing, ↑ ↓ boom, R F arm, Z X curl, Click/Space grapple, C cab camera | drive stick, swing/boom stick, arm & curl buttons |
| Shop / help | B / H | 🛒 / ❔ |

Progress saves automatically.

## Jobs

* **Maple St. Bungalow**: single-storey red brick, gable roof, chimney, furnished rooms.
* **Oak Ave. Family House**: two storeys of buff brick, wooden upper floor, big chimney.
* **Dockside Warehouse**: concrete-block walls, roller doors, steel columns, tin roof, pallets and crates.

## Building from source

Requirements: Node 18+. The APK build also needs JDK 17+ and Android build-tools 34 + platform 34.

```bash
npm install
npm run dev     # builds dist/ and serves it on http://localhost:8080
npm run exe     # Windows portable exe  -> build/
npm run apk     # Android APK (signed)  -> build/
```

`scripts/build-apk.sh` builds the APK directly with `aapt2`, `javac`, `d8`, `zipalign` and `apksigner`, with no Gradle. Point `ANDROID_SDK`, `BUILD_TOOLS` and `ANDROID_JAR` at your SDK if it isn't in `/opt/android-sdk`.

## Tech

* **Three.js**: PBR rendering, soft shadows, sky and image-based lighting. Every texture (bricks, shingles, concrete, wood, grass, gravel, and so on) is generated procedurally at startup, so the game ships with no image assets.
* **Rapier** physics (WASM): each brick, roof panel, window, and piece of furniture is a separate rigid body once it breaks loose. A support graph decides what collapses when you knock out what's holding it up.
* Sound is synthesized with the Web Audio API.
* Electron wraps the Windows build and a native WebView wraps the Android build.

All machines and brands in the game (TORVA excavator, GRITLINE crusher) are fictional.
