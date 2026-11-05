# Pet Park

A calm 3D game for young children. You are a dog or a cat in a park. There are no goals, no score and no menus. Soft music plays.

**Play online:** https://cfyffe89.github.io/pet-park/

The game is also one file: `dist/pet-park.html`. Open it in Chrome, Firefox or Safari. It does not need a server or an internet connection.

## Controls

| Controller | Keyboard | Action |
|---|---|---|
| Left stick or D-pad | WASD or arrow keys | Move |
| A or X | Space | Hop |
| B, bumpers, triggers | E or Enter | Bark or meow |
| Y | Q or Tab | Change dog ↔ cat |
| Right stick (not necessary) | J L I K | Turn the camera |
| | F | Full screen on/off |

The camera follows the animal without help. A child needs only the left stick.

The first button press starts the music (browsers block sound until a person presses something). A white paw shows until then.

## Things in the park

- Beach balls: run into them to push them. They roll down hills and float on the pond.
- Leaf piles under some trees: run or hop through them.
- Butterflies over the flower beds: they fly away when the animal comes near.
- Flowers and grass bend when the animal walks through them.
- A pond: the animal swims.
- The animal sits after a few seconds without input.

## Play on the TV

**Option 1: iPad with AirPlay to an Apple TV**

1. Pair a PS4 DualShock 4 with the iPad: hold **PS + Share** until the light bar flashes, then select it in iPad **Settings → Bluetooth**.
2. In Safari, open https://cfyffe89.github.io/pet-park/. Optional: **Share → Add to Home Screen** for a full-screen icon.
3. Tap the screen once to start the music.
4. Open Control Center → **Screen Mirroring** → select the Apple TV.

DualShock 4 buttons: Cross or Square = hop, Circle or shoulders = bark or meow, Triangle = change animal. To use the controller on the PS4 again, connect it to the PS4 with a USB cable and press PS.

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
| `src/animal.js` | Dog and cat models and animation |
| `src/props.js` | Balls, leaves, butterflies, ripples |
| `src/camera.js` | Follow camera |
| `src/input.js` | Controller and keyboard |
| `src/audio.js` | Generated music and sounds (no audio files) |

Everything is made in code: no models, textures or sound files. three.js 0.170 is bundled into the HTML file.

Test hook in the browser console: `__game.sim(2)` runs 2 seconds of game time.
