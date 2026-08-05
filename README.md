# Geometry Drawing Tools

Node.js CLI and browser tools that parse the custom geometry markup format, render an SVG diagram, and let you inspect elements interactively.

## Markup format

Each line starts with a shape type followed by key/value pairs:

- `line id=1 visible=1 x1=10 y1=20 x2=30 y2=40 color=#111111`
- `circle id=2 visible=1 cx=100 cy=120 r=40 color=#111111`
- `point id=3 visible=1 x=20 y=30 color=#111111`
- `label id=4 visible=1 type=angle x=200 y=200 r=48 ang1=0.1 ang2=1.2 text=63° size=16 color=#111111`

## Usage

Install and run:

```bash
npm run inspect
npm run draw
npm run serve
```

Open the interactive UI:

- Start server: `npm run serve`
- Open: `http://localhost:3000`
- Edit markup in the left panel
- Drag with `Draw Line` to add a line into markup
- Line start snaps to a nearby existing `point` automatically
- Line start also snaps to nearby existing `line` segments
- Line start also snaps to nearby circle perimeters
- If a snapped line endpoint lands on another line interior, that existing line is also split into rays
- Hold `Shift` while starting a line drag to temporarily disable snap
- Snap mode shortcuts: `A` = auto (all targets), `P` = point only, `L` = line only, `C` = circle perimeter only
- Line draw mode shortcut: `D` = toggle diameter mode (if line start snaps to a circle perimeter, endpoint is forced to the opposite perimeter through center; otherwise line draws normally)
- Line constraint shortcuts: `H` = toggle horizontal constraint, `V` = toggle vertical constraint
- While hovering near a snap target, a dashed guide circle is shown on the snap location
- Snap hover color: red for point targets, yellow for line/circle perimeter targets
- During line drag, the moving endpoint also snaps near points/lines/circle perimeters and shows the dashed snap guide
- Line drawing also appends separate `point` lines at line start and end
- If a new line crosses existing line segments, intersection `point` lines are auto-added
- When points exist on the new line, the line is written as split ray segments (for example `id=20.1`, `id=20.2`)
- Existing crossed lines are also split into ray segments at intersection points
- If a line crosses a circle perimeter, perimeter intersection `point` lines are auto-added
- Drag with `Draw Circle` from center to radius to add a circle into markup
- Circle drawing also appends a separate `point` line at the circle center
- Click `Inspect` then click any shape to read parsed properties in Inspector and jump to its markup line
- Save back to file or download SVG

Blank start canvas mode:

- Open: `http://localhost:3000/canvas`
- Starts empty (no markup preloaded)
- Use the top-bar `Load` and `Save` buttons for the same markup file workflow available inside Live Markup; Save asks for a filename and adds `.txt` when needed
- Set `Label Text Size` in Style from 8–120 px; it applies to the next label and immediately updates selected text or angle labels
- Open `/playback` from the first page to load multiple markup files as ordered steps, move through them manually or automatically, and optionally accumulate each file into the preceding geometry
- Canvas keeps a fixed `11:7` width-height ratio during resize
- Use `Line` and `Circle` tools to draw on a real HTML canvas
- Use `Angle Curve` to press on one snapped line, drag along a second intersecting line, and release to create a persistent measured angle arc; solid Vertices Lines are valid snap targets too
- Press `Q` before drawing to switch Angle Curve between automatic degree labels and plain arcs
- In `Move` mode, click geometry once to select it; on the next interaction, drag the selected geometry to reposition it
- When `Vertices Lines` is on, choose a Style color and click a dashed helper line in `Select` mode to make it solid; every solid helper line keeps the color active when it was selected
- Turning `Vertices Lines` on temporarily changes Style to the default orange; turning it off restores the Style color that was active before
- Double-click a solid Vertices Line in `Select` mode and confirm to convert it into permanent line markup while retaining its saved color
- Turn on `Keep Selected Lines` in Solver to keep solid selected helper lines visible when `Vertices Lines` is turned off while hiding the dashed unselected lines
- The top-bar `Calculator` legend supports full keyboard entry and evaluates arithmetic, powers, parentheses, square roots, degree-based trigonometry, logarithms, π, implicit multiplication, and the previous answer
- In `Select` mode, detected point dots are ignored; click each detected line or circle in a loaded background image to convert it into editable geometry
- Detected lines inside circles stay independently selectable, with endpoints snapped to nearby circle perimeters or intersecting lines
- Use `Delete` or `Backspace` to remove a selected background image
- Every new line auto-creates start/end `point` lines in markup
- New line crossings with existing lines auto-create intersection `point` lines
- Lines with internal points are output as multiple ray segments
- Existing intersected lines are rewritten as split ray segments too
- Line crossings with circle perimeters also create intersection points and split the new line at those points
- Every new circle auto-creates a center `point` line in markup
- Circle crossings with line segments also create perimeter intersection points and split crossed lines
- Circle-circle crossings also create perimeter intersection points
- AI Draw is available from the top-bar `AI Draw` legend and can be floated, dragged, resized, or docked
- AI Draw uses the OpenAI Responses API with validated structured markup, so invalid generations are rejected before the canvas changes
- GPT-5.6 Terra is the recommended fast default; GPT-5.6 Sol remains available for maximum accuracy and Luna for the fastest economical generation
- Markup is generated live in the top-bar `Live Markup` legend, where it can be edited, loaded, saved, floated, dragged, and resized

Custom output path:

```bash
node src/cli.js draw Markup.txt -o my-drawing.svg
```

Custom size:

```bash
node src/cli.js draw Markup.txt -o my-drawing.svg --width 1200 --height 900 --padding 60
```

Serve a specific markup file or port:

```bash
node src/cli.js serve Markup.txt --port 3000
```
