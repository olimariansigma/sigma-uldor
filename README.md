# Wrecking Yard

A 3D demolition sandbox. Smash painted cinder-block buildings, feed the rubble to a tracked jaw crusher, and collect the coloured dust it makes. Mix the dust with water from the lake into cement and use it to fix the potholes in the street. There are 20 machines to spawn (14 excavators and 6 road and site machines) and cross-play multiplayer between PC and phones.

## Download

| Platform | File |
|---|---|
| Windows 10/11 (64-bit) | [`release/WreckingYard-3.1.0-Windows.exe`](release/WreckingYard-3.1.0-Windows.exe): portable, no install |
| Android 7.0+ | [`release/WreckingYard-3.1.0-Android.apk`](release/WreckingYard-3.1.0-Android.apk): installs over older versions, saves are kept |

The Windows exe is not code-signed, so SmartScreen may warn you the first time. Click **More info → Run anyway**. On Android, allow "install unknown apps" for your browser or file manager.

## What's in it

* **Cinder-block buildings.** Every hollow two-core block is its own physics object and has its own paint colour. Cut the bottom out of a wall and the structural solver brings down whatever is no longer supported. There are five buildings (Cinder Bungalow, Rainbow House, Block Warehouse, Pixel Tower, Colour Wall) on two plots, and you can rebuild them at any time.
* **Realistic crushing.** Blocks dropped in the hopper are crushed, and the material rides the conveyor in the block's own colour. It falls off the head drum and builds a layered stockpile: the oldest dust is at the bottom, the newest on top. The total kg and the colour mix are shown on screen.
* **Cement.** Put dust and water in the pan mixer. Each colour you pour in swirls around the tub, and the paddles blend them into one cement colour. The right ratio is about 1 L of water per 3 kg of dust.
* **Road repair.** Pour cement into the potholes, or load the paver and drive over them. Each patch takes the cement's colour and dries over time. Then roll it with the tandem roller to compact it to a perfect finish (⭐ on the HUD). The breaker excavator can make new potholes.
* **20 machines.** Spawn up to 20 at once. Every model is built from hundreds of parts: weathered paint with chipped edges and grime, bolts, hoses, grilles, lights, mirrors, ladders, handrails, a full cab interior with seat, joysticks and monitor, and working hydraulic cylinders.
  * Excavators:
    * TORVA TX330 (rotating sorting grapple)
    * KESTREL K35 mini on rubber tracks (zero tail, canopy, swing-post boom)
    * VANTOR HR450 high reach (shear, tilting cab, 15 m arm)
    * MERIDIAN MW180 on wheels (outriggers, dozer blade)
    * TORVA TX700 70 t (rock bucket, walkways)
    * BRUNO BX220 (hydraulic breaker)
    * HALDEN MH24 material handler (raised cab, orange-peel grab)
    * HALDEN WH75 wheeled log-claw excavator (black boom, blade, outriggers)
    * AQUAMOLE AMX amphibious with a water tank (it floats in the lake)
    * GRANITE GP300 (pulverizer)
    * GRANITE GX250 crusher bucket (turns blocks into dust inside the bucket)
    * LIMEWORKS LC200 (concrete skip)
    * ALPINA SX5 walking spider excavator
    * BROCKMAN DR160 remote demolition robot
  * Road and site machines:
    * TORVA CR64 tandem vibratory roller
    * VELOTA AP600 paver
    * TORVA WL950 wheel loader
    * TORVA DZ80 bulldozer with ripper
    * KESTREL TD6 tracked dumper with a slewing, tipping skip
    * VANTOR CC250 crawler crane with a wrecking ball
* **3D showroom.** The spawn menu shows a rendered picture of every machine. Tap one to inspect it on a turntable in full 3D (drag to turn, pinch or scroll to zoom), flip through all 20 with the arrows, then press **Spawn**.
* **Solid machines.** Arms, buckets, blades and the wrecking ball knock out any block they touch instead of passing through walls. Buckets scoop loose rubble, and machines can drive up onto building foundations.
* **Multiplayer.** Press **Online → Host a game** and share the 6-letter code. Friends on PC or phone type the code to join. Anyone can save the shared world to their own device.
* **Save slots.** There are five save slots plus an autosave. A save contains every block, machine, the dust pile, the mixer and the road.

## Controls

| | Keyboard / mouse | Touch |
|---|---|---|
| Move / look | WASD + mouse, Shift run, Space jump | left stick, drag to look |
| Hammer | Left click | 🔨 |
| Pick up / throw | Q or right click / G | ✋ / 🧱 |
| Use (drive, bucket, mixer, pothole) | E | context button |
| Machine | W S drive, A D steer, ← → swing, ↑ ↓ boom, R F arm, Z X curl / dump, Click/Space tool, C cab camera (the on-screen hint shows each machine's own controls) | drive stick, swing/boom stick, buttons |
| Menus | B spawn, M online, H help | top-right buttons |

## Building from source

Requirements: Node 18+. The APK build also needs JDK 17+ and Android build-tools 34 + platform 34.

```bash
npm install
npm run dev     # builds dist/ and serves http://localhost:8080
npm run exe     # Windows portable exe  -> build/
npm run apk     # Android APK (signed)  -> build/
npm run art     # re-render menu art (machine/building pictures, logo, title image) with Playwright
```

## Tech

* Three.js rendering. All textures are generated procedurally at startup.
* Rapier physics (WASM), including the heightfield terrain with the lake bowl.
* PeerJS (WebRTC) peer-to-peer multiplayer. The host simulates the world and clients mirror it.
* Web Audio synthesized sound.
* Electron for Windows and a native WebView shell for Android.

All machines and brands in the game are fictional. Fonts: Russo One and Rubik (SIL Open Font License, see `public/fonts`).
