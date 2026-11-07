# Pet Park

A calm 3D game for young children. You are a dog, a cat, a pig, a horse, a giraffe, a gorilla, a T. rex, a barosaurus, a fire truck, a school bus, a bulldozer or an excavator in a park. There are no goals, no score and no menus. Soft music plays.

**Play online:** https://cfyffe89.github.io/pet-park/

The game is also one file: `dist/pet-park.html`. Open it in Chrome, Firefox or Safari. It does not need a server or an internet connection.

## Controls

| Controller | Keyboard | Action |
|---|---|---|
| Left stick or D-pad | WASD or arrow keys | Move |
| A or X | Space | Hop |
| B, bumpers, triggers | E or Enter | Make a sound (bark, oink, roar, siren ...) |
| Y | Q or Tab | Become the next character |
| Right stick (not necessary) | J L I K | Turn the camera |
| | F | Full screen on/off |

Y goes round all twelve characters in this order: dog, cat, pig, horse, giraffe, gorilla, T. rex, barosaurus, fire truck, school bus, bulldozer, excavator, then the dog again. Each one makes its own sound when it appears. The controls are the same for all of them. The tall ones walk through the pond instead of swimming.

| Character | B button |
|---|---|
| Pig | Oink oink, ears flap |
| Horse | Neigh, head up |
| Giraffe | Soft hum, nod |
| Gorilla | Sits up and pats its chest |
| T. rex | Friendly roar, jaw opens, tiny arms wiggle |
| Barosaurus | Long deep call, neck stretches up |
| Fire truck | Wee-woo siren, lights flash, ladder lifts |
| School bus | Beep beep, stop sign swings out |
| Bulldozer | Engine goes brrm, blade lifts, smoke puff |
| Excavator | Beep beep beep and one big scoop |

The camera follows the animal without help. A child needs only the left stick.

Climbing is forgiving:

- Low steps (up to about a paw's height) need no hop. The animal walks up them.
- Push into a taller stump or step for about half a second and the animal scrambles up by itself. The hop button is faster, but never needed.
- A hop still works for a moment after the animal walks off an edge, and a hop pressed just before landing still happens.
- The animal can stand a little past an edge without falling off.

To change these, edit the numbers at `COYOTE`, `JUMP_BUFFER`, `AUTO_CLIMB` in `src/main.js` and `STEP_UP`, `GRACE` in `src/obstacles.js`. Set `AUTO_CLIMB` to 0 to make the hop button necessary.

The first button press starts the music (browsers block sound until a person presses something). A white paw shows until then.

## Things in the park

- Beach balls: run into them to push them. They roll down hills and float on the pond.
- Leaf piles under some trees: run or hop through them.
- Butterflies over the flower beds: they fly away when the animal comes near.
- Flowers and grass bend when the animal walks through them.
- A pond: the animal swims, or hops across the stepping stones.
- A climbing corner near the start: a flat rock, stumps like stairs, a wooden platform, a lookout with a yellow flag, a log and a row of hop-along stumps.
- Tree stumps, logs and flat rocks around the park to climb on.
- The animal sits after a few seconds without input.

## The city

At the edge of the park, a sandy path leads to a red gate with a car picture and a glowing doorway. Walk through it to go to the city. In the city, a green gate with a tree picture (in the corner by the parked cars) leads back to the park. No buttons or menus are needed.

- Roads with a bus and two cars that drive slowly around the loop. They stop and say "beep beep" if the animal stands in front of them.
- A construction site: a digger that scoops, a dump truck that tips its load, a cement mixer with a turning drum, a tall crane with toy blocks, and a sand pile to climb.
- Ramps to run up and hop off: a ramp park with small and big ramps, and one big ramp in the plaza.
- Parked cars and traffic cones: run into them to push them. Cars are heavy and roll slowly. Hop over the cones.

## Play on the TV

**Option 1: iPad with AirPlay to an Apple TV**

1. Pair a PS4 DualShock 4 with the iPad: hold **PS + Share** until the light bar flashes, then select it in iPad **Settings → Bluetooth**.
2. In Safari, open https://cfyffe89.github.io/pet-park/. Optional: **Share → Add to Home Screen** for a full-screen icon.
3. Tap the screen once to start the music.
4. Open Control Center → **Screen Mirroring** → select the Apple TV.

DualShock 4 buttons: Cross or Square = hop, Circle or shoulders = make a sound, Triangle = next character. To use the controller on the PS4 again, connect it to the PS4 with a USB cable and press PS.

The 8BitDo Ultimate 2C Wireless is not on 8BitDo's list of Apple-compatible controllers. Use it with a PC (2.4G dongle) or Steam Deck.

**Option 2: Steam Deck (docked to the TV)**

1. Copy `dist/pet-park.html` to the Deck, for example to `/home/deck/Games/pet-park.html`.
2. In Desktop Mode, install Google Chrome from the Discover store.
3. In Steam (Desktop Mode): **Games → Add a Non-Steam Game to My Library → Google Chrome**.
4. Open the new shortcut's **Properties**. Rename it to "Pet Park". At the end of **Launch Options**, add:
   `--kiosk --autoplay-policy=no-user-gesture-required "file:///home/deck/Games/pet-park.html"`
5. In **Controller settings** for the shortcut, select a **Gamepad** layout (not "Web Browser"). Chrome then sees the Deck controls and any connected controller as a gamepad.
6. Return to Gaming Mode and start "Pet Park".

Not yet tested on a Steam Deck. Steps 4 and 5 must be checked on the device.

**Option 3: a PC or laptop connected to the TV**

Open `dist/pet-park.html` in Chrome. Connect an Xbox or PlayStation controller. Press F for full screen.

## Develop

```
npm install
npm run build    # writes dist/pet-park.html
npm run dev      # rebuilds on every save
```

| File | What |
|---|---|
| `src/main.js` | Game loop, movement, buttons |
| `src/world.js` | Terrain, pond, trees, flowers, grass, sky |
| `src/animal.js` | Dog and cat models, and the animation for every character |
| `src/characters.js` | The other ten characters, their sizes and their sounds |
| `src/props.js` | Balls, leaves, butterflies, ripples |
| `src/city.js` | The city: roads, buildings, ramps, traffic, gates between park and city |
| `src/vehicles.js` | Car, bus, digger, dump truck, cement mixer, crane and cone models |
| `src/camera.js` | Follow camera |
| `src/input.js` | Controller and keyboard |
| `src/audio.js` | Generated music and sounds (no audio files) |

Everything is made in code: no models, textures or sound files. three.js 0.170 is bundled into the HTML file.

Test hook in the browser console: `__game.sim(2)` runs 2 seconds of game time.
