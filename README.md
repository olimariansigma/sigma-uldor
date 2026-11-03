# Wrecking Yard

A 3D demolition sandbox. Smash painted cinder-block buildings, feed the rubble to a tracked jaw crusher, and collect the coloured dust it makes. Mix the dust with water from the lake into cement and use it to fix the potholes in the street. Press the dust into new blocks and build your own house on the plot across the road. There are 36 machines to spawn (26 excavators, among them a backhoe loader, a scrap magnet, a block blaster and a rock saw, 7 road and site machines and 3 tipper trucks in three sizes), a truck intake line that compacts blocks into cubes for the crusher, and cross-play multiplayer between PC and phones.

## Download: the launcher

Get the launcher from the **[latest release](https://github.com/olimariansigma/sigma-uldor/releases/latest)**:

| Platform | File |
|---|---|
| Windows 10/11 (64-bit) | `WreckingYard-Launcher-Windows.zip` (about 110 MB): extract it anywhere and run `Wrecking Yard.exe`. The most reliable choice |
| Windows 10/11 (64-bit) | `WreckingYard-Launcher-Windows.exe` (about 75 MB): one-file portable version. If it says *Installer integrity check has failed*, the download is incomplete or was changed by antivirus or OneDrive: use the zip instead |
| Android 7.0+ | `WreckingYard-Launcher.apk` (about 0.25 MB): installs over the old Wrecking Yard app, saves are kept |

The launcher shows every published version of the game. **Check for updates** looks for a new one, and you can download, play or delete any version, old ones included. Saves are shared between versions. Each game version is a GitHub release with a `WreckingYard-game-<version>.zip` (the built game, about 80 MB); the launcher downloads it once and then plays offline.

Publishing a new version: push a tag `vX.Y.Z` (or run the **Release** workflow by hand); `.github/workflows/release.yml` builds the game zip and the Windows launcher and attaches them, plus the Android launcher APK from `launcher/android`.

The Windows exe is not code-signed, so SmartScreen may warn you the first time. Click **More info → Run anyway**. On Android, allow "install unknown apps" for your browser or file manager.

## What's in it

* **Brick press.** Next to the dust stockpile, built like the real thing: H-section steel frame, guided ram head on a big hydraulic cylinder, a ribbed mould on a vibration table, a feed drawer, walkway with ladder, a hydraulic power pack and a control cabinet whose beacon flashes while it presses. Switch on its feeder belt at the control panel and it pulls dust off the pile, or tip a loader or excavator bucket of dust into its hopper, or pour your bucket in. Every couple of seconds the ram presses a full-size block in the dust's colour and stacks it on the pallet. One block costs exactly the dust a crushed block gives back.
* **Build your own house.** Across the road there is a foundation slab with setting-out lines. Carry pressed blocks over (Q), take cement on the trowel and click to put a splash of mortar on the slab (one splash per click), then pick tool 4 (BUILD): a ghost block snaps to the grid on the surface you aim at, R turns it, click lays it. A block laid over mortar sticks and becomes part of the wall (it can be smashed, blasted and collapse like the houses you demolish); without mortar it is only stacked. Blocks set down on mortar by a machine stick too.
* **Road painting truck.** The LINEA LP20 has a spray bar behind the rear axle and eight colours (T / Y). Switch the sprayer on (Click / Space) and drive over a repaired pothole to paint the patch.
* **Street traffic.** Hatchbacks, saloons, vans and pickups drive both lanes of the street past the yard. Every pothole you haven't repaired gives them a jolt and a bang. They brake for players, machines and rubble on the road, overtake a blockage when the other lane is clear, and lean on the horn when they can't get by. Settings → Street traffic switches it off.
* **Rain and thunderstorms.** The weather changes by itself (or pick Always clear, Rainy or Stormy in Settings). Rain falls as streaks around you, the sky and fog turn grey, the yard, road and concrete get wet and shiny and dry off slowly afterwards, and you hear it. Storms add lightning flashes and rolling thunder that arrives after the flash. In multiplayer everyone shares the host's weather, and it is saved with the world.
* **Day and night.** The sun and moon cross the sky and the light, sky, fog and clouds follow them through golden hour into a starry night. After dusk the street lamps, house windows and four trailer light towers in the yard switch on, and the machine you drive gets real work lights (a head lamp when you walk). Settings → Day & night: off, 10, 20 or 40 minute days, plus a button to skip three hours. In multiplayer everyone shares the host's time, and the time of day is saved with the world.
* **Demolition charges.** Hotbar slot 3: stick up to 8 charges on wall blocks, then press E (BOOM on touch) and get clear. After a beeping three-second countdown they blow: blocks fly, big panels shatter, there's a fireball, sparks and a dust cloud in the blocks' own colours, and the shock wave shakes you. Works in multiplayer.
* **Horns, photo mode, fireworks.** Every machine has an air horn (N, or the horn button on touch) that everyone hears. P hides the HUD for screenshots; on foot it also frees the camera so you can fly around the site (WASD + mouse, Space / C up and down, Shift faster). Flatten a building and fireworks go up over its plot.
* **HD textures.** About 75 MB of high-resolution (2048 px) seamless textures with colour, normal and roughness maps: porous cinder blocks, cast concrete, the gravel yard, grass, asphalt, roof shingles, galvanised metal, wood and the crushed-dust pile. They load at 512, 1024 or 2048 px depending on the graphics setting (Low / Medium / High), and the game falls back to its built-in textures if they're missing. They're generated by `tools/gen_textures.py`.
* **Big cinder-block buildings.** Every hollow two-core block (1.2 m long, 4 kg in game weight) is its own physics object with its own paint colour. Houses are built three times bigger than before, on three large plots: by default a bungalow, a colour wall and a block warehouse. Cut the bottom out of a wall and the structural solver brings down whatever is no longer supported, Each block takes a few hits, and a block left hanging with nothing under it falls instead of floating. There are five buildings (Cinder Bungalow, Rainbow House, Block Warehouse, Pixel Tower, Colour Wall) and you can rebuild any of them on any plot.
* **Realistic crushing.** Blocks dropped in the hopper are crushed, and the material rides the conveyor in the block's own colour. It falls off the head drum and builds a layered stockpile: the oldest dust is at the bottom, the newest on top. The total kg and the colour mix are shown on screen, and the pile is as big as the blocks you crushed.
* **Cement.** The pan mixer stands in a small batching plant with a cement silo (caged ladder, roof railing, screw conveyor into the tub) and a water tank. Put dust in the pan mixer and add any amount of water (lake water or the hose button). Each colour swirls around the tub and the paddles blend it all into cement in a couple of seconds.
* **Cement trowel.** Take cement from the mixer onto your trowel (hotbar slot 2). Click the ground to lay cement tiles anywhere in the yard (they dry from dark to their final colour), or click a pothole to fill it. Tiles are saved and shared in multiplayer.
* **Road repair.** Pour cement into the potholes, or load the paver and drive over them. Each patch takes the cement's colour and dries over time. Then roll it with the tandem roller to compact it to a perfect finish (⭐ on the HUD). The breaker excavator can make new potholes.
* **Contracts and a career.** Press J (or tap the cash box top left) for the contract board: three paid jobs at a time, such as flattening the building on plot B, crushing 300 kg of rubble, fixing potholes to a perfect finish, a 40-block smash, breaking 30 blocks with a particular machine, pressing or laying blocks, mixing cement or painting patches. Finish one for cash, half again as a speed bonus if you beat its timer, and a new job goes up. Total earnings promote you from Rookie through Labourer, Operator, Foreman, Site Manager and Demolition Boss to Wrecking Legend. The career is saved on your device and counts in any world, solo or with a crew.
* **Destruction combos.** Bring a lot of blocks down within a few seconds and a big *💥 23 BLOCKS · BIG SMASH!* pops up. Your biggest smash is kept as a record.
* **Real machine sounds.** Engines, tracks, the hydraulic breaker, stones, footsteps and bucket clanks are real field recordings (a 5 t Volvo excavator's engine at idle and working, rubber tracks, a telehandler's diesel, a jackhammer on a mini excavator). Every running machine near you gets its own engine voice: idle crossfades into the working engine as you move the joysticks or drive, pitch follows the revs and the size of the machine, with a hydraulic pump whine and relief hiss on top, track clatter when it drives and a reverse beeper on trucks and loaders.
* **Breakable big pieces.** Roof, floor and door panels break into rubble chunks: hit them three times with the hammer, close a claw on them, push them with an arm or bucket, or drop them on the crusher hopper or in the truck intake. The chunks keep the panel's colour and weight.
* **Pothole repair like the real thing.** The hot mix goes in as a loose, steaming heap standing proud of the road. Each pass of the roller (or tamping with the hammer) presses it down until it is flush and smooth; the paver lays a pre-compacted mat.
* **Truck intake line.** Behind the crusher there's a ground-level tip funnel with a wheel-stop: back a truck up to it and tip. A walled belt carries the blocks into the BP-40 compactor, which presses every 5 blocks into a strapped cube (you can see the fragments of each block in it), and a cleated incline belt lifts the cubes into the crusher hopper, where they become dust in the blocks' own colours.
* **36 machines.** Spawn up to 20 at once. Every model is built from hundreds of parts: weathered paint with chipped edges and grime, bolts, hoses, grilles, lights, mirrors, ladders, handrails, a full cab interior with seat, joysticks and monitor, and working hydraulic cylinders. The loader, dozer, roller, paver, dumper and crane have shaped bodies (sloping hoods, curved mudguards, counterweights with tail lights, bucket teeth) and a glazed cab with a framed door. The tipper trucks have rounded, bevelled cabs with a raked windscreen, wind deflectors and wipers; the tracked dumper has a roll-over frame and a curved tub; the crane's lattice boom has proper chords, lacing and backstops. From the operator's seat, guard grids, wipers and window tint are left out so you can see what you're doing.
  * Excavators:
    * TORVA TX330 (rotating sorting grapple)
    * KESTREL K35 mini on rubber tracks (zero tail, canopy, swing-post boom)
    * VANTOR HR450 high reach (shear, tilting cab, 15 m arm)
    * MERIDIAN MW180 on wheels (outriggers, dozer blade)
    * TORVA TX700 70 t (rock bucket, walkways)
    * BRUNO BX220 (hydraulic breaker)
    * HALDEN MH24 material handler (raised cab, orange-peel grab)
    * HALDEN WH75 wheeled log-claw excavator (black boom, blade, outriggers)
    * HALDEN WH200 Big Claw: huge wheeled material handler with a raised cab and a giant claw that grabs a whole wall section at once
    * TORVA BG90 brick grabber: a magnetic rotating clamp. Close it near some blocks and it pulls up to four of them neatly into place between the jaws, however they lie, and they stay put however you swing or tilt it until you open the clamp. Its hydraulics are heavy and keep moving after you let go.
    * AQUAMOLE AMX amphibious with a water tank (it floats in the lake)
    * GRANITE GP300 (pulverizer)
    * GRANITE GX250 crusher bucket (turns blocks into dust inside the bucket)
    * LIMEWORKS LC200 (concrete skip)
    * ALPINA SX5 walking spider excavator
    * BROCKMAN DR160 remote demolition robot
  * Special excavators (Click switches each tool on and off):
    * BRAVO BL4 backhoe loader: a loader bucket on the front (T / Y raise and lower it, Click tips it; drive into rubble with it lowered to fill it) and a digging arm on the back with stabiliser legs that come down when you stop. Quick on the road
    * HALDEN MG40 scrap magnet: switch on and loose blocks fly up and stick to the plate (up to 10); it rips blocks out of walls too. Switch off to drop the lot
    * TORVA WB300 ball swinger: a 2 t wrecking ball on a chain under the arm. Whip the arm around to smash walls; Click lets the chain out or reels it in
    * VORTEX VX50 block blaster: the vacuum sucks loose blocks into the nozzle and stacks them in the cage on its back (up to 8); hold T or Y to fire them out at walls
    * GRINDA DC60 drum cutter: twin spinning drums grind wall blocks and rubble straight into dust, which counts as crushed
    * SAWTEK RS30 rock saw: a 2 m diamond blade cuts every block it passes through clean out of the wall
    * TORQUE AD20 auger drill: bores through walls and drills new potholes into the road
    * PLATO VP12 plate compactor: compacts filled potholes to a perfect finish, shakes walls loose and makes rubble hop
    * MERIDIAN FK18 fork handler: lock the pallet forks and up to 8 blocks snap into a neat stack on the tines
    * AQUAJET HJ40 water cannon: a remote hydrodemolition robot whose jet blasts blocks out of walls from 14 m away; aim it into the mixer to add water
  * Road and site machines:
    * TORVA CR64 tandem vibratory roller
    * VELOTA AP600 paver
    * TORVA WL950 wheel loader
    * TORVA DZ80 bulldozer with ripper
    * KESTREL TD6 tracked dumper with a slewing, tipping skip
    * VANTOR CC250 crawler crane with a wrecking ball
    * LINEA LP20 road painting truck
  * Tipper trucks, each in three sizes (pick the size in the showroom): Small 4x2, Medium 6x4, Big 8x4:
    * VELKA R410 XT (medium by default): white cab, heavy XT bumper with a skid plate, off-road tyres, half-pipe body
    * VELKA S650 V8 (big by default): metallic silver high-roof cab, chrome grille and roof light bar, polished rims, brushed aluminium half-pipe body
    * VELKA G370 (small by default): yellow cab with a square steel box body
    * Load them with any excavator or loader. Blocks ride along in the body (steering gets gentler at speed so the load doesn't slide out), then Z tips the body up on its front cylinder, the high-lift tailgate swings up and the load slides out the back. One R410 is parked in the yard by default.
* **3D showroom.** The spawn menu shows a rendered picture of every machine. Tap one to inspect it on a turntable in full 3D (drag to turn, pinch or scroll to zoom), flip through all 36 with the arrows, then press **Spawn**.
* **Solid machines.** Machines stop at walls instead of passing through them. Keep driving or pressing the arm, blade or bucket against a wall and the blocks it touches crack (they darken) and break loose; heavy machines and fast hits break them sooner. Arms and buckets can't sink into the ground.
* **Multiplayer.** Press **Online → Host a game** and share the 6-letter code. Friends on PC or phone type the code to join. Anyone can save the shared world to their own device. Snapshots are compact binary (a falling block costs 15 bytes), each player gets the blocks around them first, and a host with a slow link sends less instead of building up lag.
* **Menu and launcher exit.** The ☰ button in the game has Resume, New world and Main menu (back to the title screen). The launcher has an Exit button.
* **Save slots.** There are five save slots plus an autosave. A save contains every block, machine, the dust pile, the mixer and the road.

## Controls

| | Keyboard / mouse | Touch |
|---|---|---|
| Move / look | WASD + mouse, Shift run, Space jump | left stick, drag to look |
| Tools | 1 hammer, 2 cement trowel (mortar: one splash per click on the slab or a block), 3 demolition charges (E detonates), 4 build (R turns the block), Left click to use | hotbar at the bottom, big button to use (tap BUILD again to turn) |
| Pick up / throw | Q or right click / G | ✋ / 🧱 |
| Use (drive, bucket, mixer, pothole) | E | context button |
| Machine | W S drive, A D steer, ← → swing, ↑ ↓ boom, R F arm, Z X curl / dump (tip / lower on trucks), T Y rotate clamp (BG90) / paint colour (LP20), Click/Space tool, C cab camera, N horn (the on-screen hint shows each machine's own controls) | drive stick, swing/boom stick, buttons |
| Menus | B spawn, M online, H help, P photo mode (fly: WASD + mouse, Space / C, Shift) | top-right buttons |

## Building from source

Requirements: Node 18+. The APK build also needs JDK 17+ and Android build-tools 34 + platform 34.

```bash
npm install
# launchers: cd launcher/desktop && npm install && npm run dist   (Windows launcher -> launcher/desktop/out)
#            bash scripts/build-launcher-apk.sh                  (Android launcher -> launcher/android)
npm run dev     # builds dist/ and serves http://localhost:8080
npm run exe     # Windows portable exe  -> build/
npm run apk     # Android APK (signed)  -> build/
npm run art     # re-render menu art (machine/building pictures, logo, title image) with Playwright
python3 tools/gen_textures.py   # regenerate the HD texture pack in public/tex (numpy + Pillow)
```

## Tech

* Three.js rendering. All textures are generated procedurally at startup.
* Rapier physics (WASM), including the heightfield terrain with the lake bowl.
* PeerJS (WebRTC) peer-to-peer multiplayer. The host simulates the world and clients mirror it.
* Web Audio synthesized sound.
* Electron for Windows and a native WebView shell for Android.

Sound recordings: [BigSoundBank](https://bigsoundbank.com) (Joseph Sardin), released as CC0 / public domain; cut into loops and one-shots by `tools/make_sfx.py`.

All machines and brands in the game are fictional. Fonts: Russo One and Rubik (SIL Open Font License, see `public/fonts`).

## Website (free hosting on Vercel)

`npm run build:site` builds the website into `site-dist/`: the landing page (`site/index.html`) at `/` and the
browser game at `/play/`, using the 1024 px web texture pack in `site/tex` (about 15 MB in total). It is fully
static: no server code, no database, no API keys, so it fits the free Hobby plan.

To publish it: on vercel.com choose **Add New → Project**, import this GitHub repository and press **Deploy**.
`vercel.json` already holds the install command, build command and output folder. Every push then redeploys.

## Progression mode

PROGRESSION on the title screen starts a separate career: only the hammer and $150. Crushing pays $3 per kg,
every new block laid in your house pays $30, and house milestones (20 / 50 / 100 / 180 / 300 blocks) pay bonuses.
Spend it in the Shop (`B`) on tools, upgrades, machines and new buildings. No potholes in this mode. It saves
itself; Start over is in the menu. The help panel (`H`) has a step-by-step "how do I build a house?" Q&A.

## Accidents

Every few minutes (sandbox and progression) a light plane or a car crashes through a garden wall at one of four
sites outside the yard. Drive the yard pickup there following the GPS arrow and the red light beam, smash the wreck
and load it onto the tipper truck parked on site, then rebuild the hole with the delivered bricks and the free
mortar from the tub. Plane $6,000, car $3,500, +25% within 8 minutes. The menu can report one right away or hand
the current one over.
