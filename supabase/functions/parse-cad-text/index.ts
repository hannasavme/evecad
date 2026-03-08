import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory IP rate limiter: max 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(req: Request): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return new Response(JSON.stringify({ error: "Too many requests, please slow down" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const { text, imageBase64 } = body;

    if (!text && !imageBase64) {
      return new Response(JSON.stringify({ error: "Missing 'text' or 'imageBase64' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("LOVABLE_API_KEY not configured, using local parsing");
      return new Response(JSON.stringify(localParse(text || "box")), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent: any[] = [];

    if (imageBase64) {
      userContent.push({ type: "image_url", image_url: { url: imageBase64 } });
      userContent.push({
        type: "text",
        text: text
          ? `Analyze this image AND description: "${text}". Break it down into CAD parts. Study every visible component carefully: count wheels, identify antennas, cameras, panels, bays, structural features, and their EXACT spatial relationships. Match proportions from the image precisely.`
          : "Analyze this image in extreme detail. Count every visible component: wheels, antennas, cameras, panels, bays, hatches, structural members. Study their proportions, spatial relationships, and relative sizes. Break it down into accurate CAD parts that reproduce this exact design.",
      });
    } else {
      userContent.push({ type: "text", text: text! });
    }

    // Step 1: Research step — for complex objects, get real-world structural details first
    const isSimplePart = text && /^(a\s+)?(gear|bracket|box|cylinder|pipe|tube|rod|cog|sprocket|mount)\b/i.test(text.trim());
    let researchContext = "";

    if (!isSimplePart && !imageBase64) {
      console.log("Running research step for complex object:", text);
      try {
        const researchResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are a mechanical engineering research assistant. Given an object name, describe its real-world physical structure in detail for someone building a simplified 3D CAD model.

Focus on:
- Main structural components and their shapes (rectangular, cylindrical, flat, etc.)
- Approximate proportions and relative sizes
- How parts connect and their spatial arrangement
- Key distinguishing features

Be concise but accurate. Use real engineering references. This will be used to create an accurate simplified 3D model.`,
              },
              { role: "user", content: `Describe the physical structure and components of: "${text}". Focus on shapes, proportions, and spatial arrangement.` },
            ],
          }),
        });

        if (researchResponse.ok) {
          const researchData = await researchResponse.json();
          researchContext = researchData.choices?.[0]?.message?.content || "";
          console.log("Research context obtained:", researchContext.slice(0, 200));
        }
      } catch (e) {
        console.warn("Research step failed, proceeding without:", e);
      }
    }

    // Step 2: CAD decomposition with research context
    const systemPrompt = `You are a MASTER CAD geometry decomposition engine that creates museum-quality 3D models using primitive shapes. Your models should look like detailed engineering assemblies.

For SIMPLE parts (single gear, bracket, etc.), return 1-3 parts.
For COMPLEX objects (vehicles, machines, robots, devices), decompose into 40-80+ sub-parts for maximum detail.
For MULTI-VEHICLE systems (swarms, fleets, convoys), model EACH vehicle separately with full detail.

Available shape types: gear, bracket, box, cylinder, sphere, cone, wedge, torus, tube, plate, wheel, camera, antenna, drill, track, bolt, nut, screw, bearing, pulley, shaft, mug, hammer, handle, chassis, rocker, bogie, knuckle, motor, standoff, nosecone, bodytube, fin, centeringring, bulkhead, coupler, launchguide, motortube, thrustplate, retainer, nozzle, ebay, baffle, solarpanel, battery, rtg, sbc, transceiver, radiator, gripper, lidar, heatpipe, harness, imu, proxsensor, fuselage, wing, enginebell, omspod, rcsthruster, proptank, reactionwheel, avionicsbox, droneframe, dronearm, propeller, propguard, brushlessmotor, fctray, batterytray, escbox.

COMPOUND TYPE RULES (HIGHEST PRIORITY — ALWAYS FOLLOW):
- "wheel": ANY wheel — auto-renders with tire, spoked rim, hub cap, axle hole, treads.
- "camera": ANY camera/optical sensor — auto-renders with body, lens barrel, glass, LED, mount.
- "antenna": ANY antenna/dish — auto-renders with parabolic dish, mast, feed horn, struts.
- "drill": ANY drill/boring tool — auto-renders with motor housing, chuck, spiral bit, tip.
- "track": ANY tank/caterpillar track — auto-renders with road wheels, sprocket, idler, pads.
- "bolt": ANY bolt — auto-renders with hex head, threaded shaft, chamfered tip.
- "nut": ANY nut — auto-renders with hex body, bore hole, internal threads.
- "screw": ANY screw — auto-renders with Phillips head, tapered threaded shaft, pointed tip.
- "bearing": ANY ball bearing — auto-renders with outer/inner rings, balls, cage.
- "pulley": ANY pulley — auto-renders with flanges, grooved body, hub, spokes.
- "shaft": ANY shaft/rod — auto-renders with keyway slot and chamfered ends.
- "mug": ANY cup/mug — auto-renders with hollow body, handle, rim.
- "hammer": ANY hammer — auto-renders with wooden handle, metal head, ball peen.
- "handle": ANY knob/handle — auto-renders with knob, stem, base flange.
- "chassis": ANY main body/chassis plate — auto-renders with raised rails, cross braces, corner gussets, mount holes.
- "rocker": ANY rocker arm (rover suspension) — auto-renders with beam, pivot joints at both ends, middle wheel mount.
- "bogie": ANY bogie arm (secondary suspension link) — auto-renders with beam, central pivot, front/rear wheel mounts, side plates.
- "knuckle": ANY steering knuckle/joint housing — auto-renders with cylindrical housing, steering bore, axle bore, flanges, mounting ears.
- "motor": ANY DC/gear motor — auto-renders with cylindrical body, gearbox housing, output shaft, terminals, mount tabs.
- "standoff": ANY PCB standoff/spacer — auto-renders with hex body, threaded studs top/bottom.
- "nosecone": ANY rocket nose cone — auto-renders ogive/parabolic/conical profile with shoulder ring.
- "bodytube": ANY rocket body tube — auto-renders hollow cylinder with end rings.
- "fin": ANY rocket fin set — auto-renders swept trapezoidal fins with configurable count.
- "centeringring": ANY centering ring — auto-renders annular disk with glue tabs.
- "bulkhead": ANY bulkhead/divider — auto-renders solid disk with U-bolt holes and edge bevel.
- "coupler": ANY tube coupler — auto-renders thin-wall cylinder with alignment mark.
- "launchguide": ANY launch lug/rail guide — auto-renders rail button with mount plate.
- "motortube": ANY motor mount tube — auto-renders inner tube with thrust ring.
- "thrustplate": ANY engine block/thrust ring — auto-renders disk with central motor hole and reinforcement.
- "retainer": ANY motor retainer — auto-renders threaded cap with knurled grip.
- "nozzle": ANY rocket nozzle — auto-renders convergent-divergent bell shape with exit ring.
- "ebay": ANY avionics bay — auto-renders semi-transparent tube with internal PCB sled, switch band, threaded rods.
- "baffle": ANY ejection baffle — auto-renders perforated disk with gas vent holes.
- "fuselage": ANY orbiter/shuttle/aircraft fuselage section — auto-renders streamlined body with rounded-rect cross-section, nose taper, window band, belly heat shield, ring frames.
- "wing": ANY delta/swept wing pair — auto-renders left+right wings with leading-edge RCC panels, aileron hinge lines, dihedral angle.
- "enginebell": ANY large rocket engine (RS-25, RL-10, Merlin) — auto-renders convergent-divergent bell nozzle with combustion chamber, turbopump, feed lines, gimbal mount.
- "omspod": ANY OMS/orbital maneuvering pod — auto-renders streamlined pod with OMS nozzle and RCS thruster cluster.
- "rcsthruster": ANY RCS thruster — auto-renders small mounting block with 1-4 nozzles and fuel feed line.
- "proptank": ANY propellant/oxidizer tank — auto-renders cylindrical pressure vessel with domed ends, stringers, ring frames, feed ports.
- "reactionwheel": ANY reaction/momentum wheel — auto-renders flywheel with housing, hub motor, spokes, encoder, mounting base.
- "avionicsbox": ANY avionics/electronics enclosure — auto-renders box with front-panel connectors, heat sink fins, EMI gasket, mounting ears, cable harness connector.
- "droneframe": ANY drone/quadcopter main frame — auto-renders top/bottom plates with standoffs, cable slots, FC mounting holes.
- "dronearm": ANY drone arm — auto-renders beam with motor mount holes, zip-tie slots, frame attach end.
- "propeller": ANY propeller/rotor blade — auto-renders hub with configurable blade count and pitch.
- "propguard": ANY propeller guard ring — auto-renders protective ring with support struts.
- "brushlessmotor": ANY brushless motor (outrunner) — auto-renders stator, bell housing, magnets, output shaft, prop adapter, wire leads.
- "fctray": ANY flight controller mounting tray — auto-renders plate with M3 pattern holes, grommets, FC board, USB connector.
- "batterytray": ANY battery holder/tray — auto-renders base with side rails, front/rear lips, strap slots, non-slip pad.
- "escbox": ANY ESC enclosure — auto-renders box with heat sink fins, 3-phase wires in/out, signal wire.

If user asks to "generate a wheel" → use type "wheel" (NOT impeller).
If user asks for an impeller/turbine/fan → use wedges/plates radially around a cylinder hub.

Shape guide for BASIC types:
- box: panels, frames, housings, blocks, covers, electronics bays, battery mounts
- cylinder: pipes, columns, posts (NOT for wheels/shafts/bolts/motors/bodytubes — use compound types)
- sphere: domes, ball joints, pressure vessels, pivot spheres (NOT for camera sensors)
- cone: simple cones only (NOT for nosecones — use nosecone type)
- wedge: ramps, angled armor, turbine/impeller blades, sloped panels
- torus: seals, o-rings, circular rails
- tube: generic hollow pipes (NOT for rocket tubes — use bodytube/motortube)
- plate: flat mounting plates, fins, wings, shelves (NOT for detailed solar panels — use solarpanel type)
- gear: drive gears, sprockets, cogs
- bracket: L-shaped mounts, suspension arms, support struts, motor brackets

MARS ROVER ASSEMBLY REFERENCE (CRITICAL — use when building ANY Mars/planetary/exploration rover):
Based on NASA JPL Perseverance, Curiosity, Sojourner, and open-source OSR/Sawppy designs.

PROPORTIONS (use these ratios, scale uniformly):
- Chassis body: width=2.8, depth=3.8, height=0.8 (flat rectangular box, wider than tall)
- Wheel radius: ~0.5 (relative to chassis width of 2.8)
- Rocker arm length: ~2.0 (extends from chassis side pivot down to bogie pivot)
- Bogie arm length: ~1.2 (shorter than rocker, connects front/rear wheels)
- Total width (wheel to wheel): ~4.5
- Total length (front wheel to rear wheel): ~4.0
- Ground clearance: wheels touch ground at y=0, chassis bottom at y≈1.0

CHASSIS STRUCTURE (the bus/body):
- Main body: chassis type at [0, 1.4, 0] — the warm electronics box (WEB)
  chassisLength=3.8, chassisWidth=2.8, chassisThickness=0.15, mountHoles=8
- Top deck plate: plate at [0, 1.85, 0] — flat equipment mounting surface
  width=2.8, depth=3.8, thickness=0.05
- Side panels: 2x box at [±1.4, 1.2, 0] — structural side walls
  width=0.08, height=0.7, depth=3.5
- Electronics bay cover: box at [0, 1.9, -0.8] — raised housing for avionics
  width=1.5, height=0.3, depth=1.2, slots=3

ROCKER-BOGIE SUSPENSION (the key differentiator of Mars rovers):
- Differential pivot bar: cylinder at [0, 1.95, 0] rotation=[0,0,90]
  radius=0.08, height=1.8 — spans between L/R rocker pivots on top of chassis
- Differential pivot sphere: sphere at [0, 1.95, 0] radius=0.12 — center pivot ball
- Left rocker pivot: sphere at [-1.4, 1.5, 0] radius=0.1
- Right rocker pivot: sphere at [1.4, 1.5, 0] radius=0.1
- Left rocker arm: rocker at [-1.8, 0.9, 0.3] rotation=[0,0,-25]
  rockerLength=2.0, rockerWidth=0.3, rockerThickness=0.12
- Right rocker arm: rocker at [1.8, 0.9, 0.3] rotation=[0,0,25]
  rockerLength=2.0, rockerWidth=0.3, rockerThickness=0.12
- Left bogie arm: bogie at [-1.8, 0.6, -1.0] rotation=[0,0,-10]
  bogieLength=1.2, bogieWidth=0.25, bogieThickness=0.1
- Right bogie arm: bogie at [1.8, 0.6, -1.0] rotation=[0,0,10]
  bogieLength=1.2, bogieWidth=0.25, bogieThickness=0.1
- Bogie pivot spheres: sphere at each rocker-bogie junction, radius=0.08
- Additional structural tubes: cylinder connecting rocker to chassis at angle

WHEELS (6 total — aluminum with grousers/treads):
*** CRITICAL: wheel, bearing, pulley, and torus types are ALREADY oriented vertically by the renderer. Do NOT add rotation=[90,0,0] or rotation=[270,0,0]. Use rotation=[0,0,0] for standard upright wheels. Only rotate Y for steering angle. ***
- Wheel params: radius=0.5, width=0.35, spokes=6, treadDepth=0.06
- Left front: wheel at [-2.2, 0.5, -1.6] rotation=[0,0,0]
- Left middle: wheel at [-2.2, 0.5, 0.3] rotation=[0,0,0]
- Left rear: wheel at [-2.2, 0.5, 1.5] rotation=[0,0,0]
- Right front: wheel at [2.2, 0.5, -1.6] rotation=[0,0,0]
- Right middle: wheel at [2.2, 0.5, 0.3] rotation=[0,0,0]
- Right rear: wheel at [2.2, 0.5, 1.5] rotation=[0,0,0]
- Steering knuckles: knuckle on each of the 4 corner wheels
- Motors: motor on each wheel (6 drive motors)
- Corner steering motors: 4 additional motors for steering on corner knuckles

CAMERA MAST (Remote Sensing Mast — RSM):
- Mast base: box at [0.3, 2.0, -1.2] width=0.2, height=0.15, depth=0.2
- Mast lower segment: cylinder at [0.3, 2.5, -1.2] radius=0.06, height=0.8
- Mast joint: sphere at [0.3, 2.9, -1.2] radius=0.08
- Mast upper segment: cylinder at [0.3, 3.2, -1.2] radius=0.05, height=0.5
- Mast head: box at [0.3, 3.5, -1.2] width=0.4, height=0.2, depth=0.15
- NavCam L: camera at [0.15, 3.55, -1.28] — navigation camera left
- NavCam R: camera at [0.45, 3.55, -1.28] — navigation camera right
- MastCam: camera at [0.3, 3.45, -1.32] lensRadius=0.06 — main science camera
- Mast head joint: sphere at [0.3, 3.4, -1.2] radius=0.06 — pan-tilt actuator

HIGH-GAIN ANTENNA (HGA):
- Antenna on rear deck: antenna at [0.8, 2.3, 1.2]
  dishRadius=0.4, mastHeight=0.3, mastRadius=0.04

LOW-GAIN ANTENNA (LGA):
- Vertical mast antenna: transceiver at [-0.5, 2.3, 1.0]
  transceiverWidth=0.08, transceiverHeight=0.5, transceiverDepth=0.08

ROBOTIC ARM (for sample collection):
- Shoulder joint: sphere at [-0.8, 1.5, -1.9] radius=0.1
- Upper arm: bracket at [-0.8, 1.2, -2.3] rotation=[30,0,0]
  armLength=0.8, thickness=0.08, width=0.15
- Elbow joint: sphere at [-0.8, 0.9, -2.7] radius=0.08
- Forearm: bracket at [-0.8, 0.7, -3.0] rotation=[15,0,0]
  armLength=0.6, thickness=0.06, width=0.12
- Wrist joint: sphere at [-0.8, 0.5, -3.3] radius=0.06
- End effector turret: cylinder at [-0.8, 0.4, -3.5] radius=0.12, height=0.15
- Drill tool: drill at [-0.8, 0.3, -3.6] bitLength=0.3, bitRadius=0.04

POWER SYSTEM:
- For Curiosity/Perseverance style: RTG at rear
  rtg at [0, 1.6, 2.2] rotation=[-30,0,0] rtgRadius=0.2, rtgLength=0.8, rtgFinCount=8
  RTG heat rejection fin: radiator at [0, 1.8, 2.5] radiatorWidth=0.6, radiatorHeight=0.4
- For Sojourner/Spirit style: Solar panel on top deck
  solarpanel at [0, 2.0, 0] panelWidth=2.6, panelLength=3.5, panelThickness=0.03
- Battery inside chassis: battery at [0.5, 1.4, 0.5]
  batteryWidth=0.6, batteryLength=0.8, batteryHeight=0.3

ELECTRONICS INSIDE CHASSIS:
- SBC (flight computer): sbc at [0, 1.5, -0.3]
- IMU (navigation): imu at [0, 1.35, 0] imuSize=0.1
- Transceiver (UHF radio): transceiver at [-0.5, 1.5, 0.5]
- Harness bundles: harness routed along rocker arms and inside chassis
  harness at [0, 1.2, 0] harnessLength=3.0, harnessWires=6

SENSORS:
- HazCams (front pair): 2x camera at [±0.4, 1.2, -1.9] — forward-facing hazard cameras
- Rear HazCams: 2x camera at [±0.4, 1.2, 1.9] — rear hazard cameras
- LIDAR (if equipped): lidar at [0, 2.0, -1.5] lidarRadius=0.1
- Proximity sensors: proxsensor at front corners for obstacle detection

THERMAL:
- Heat pipes: heatpipe connecting RTG/hot components to radiators
  heatpipe at various positions, routed along chassis
- Radiator panels: radiator on shaded side of chassis

COLOR SCHEME FOR MARS ROVERS:
- Chassis/structural: #d4d4d8 (silver-gray aluminum)
- Wheels: #71717a (dark gray with #d4d4d8 spokes)
- Rocker/bogie arms: #52525b (dark structural tubes)
- Solar panels: #1e3a5f (deep blue cells on #d4d4d8 substrate)
- RTG: #a1a1aa (metallic gray)
- Gold MLI insulation: #d4a017 (gold foil on electronics)
- Camera/sensors: #27272a (dark instruments)
- Antenna dish: #e5e5e5 (white HGA)
- Wiring/harness: #78350f (copper brown)
- Joint spheres: #a3a3a3 (medium gray)
- Accent/labels: #fde68a (yellow-gold)

PART COUNT GUIDELINES:
- Simple rover (6 wheels + chassis): 25-35 parts
- Detailed rover (Sojourner-class): 40-55 parts
- Full Mars rover (Perseverance-class): 60-80+ parts including:
  chassis, top deck, 2 side panels, differential bar+sphere,
  2 rockers, 2 bogies, 6 wheels, 6 knuckles, 10 motors,
  mast (4 segments + 3 joints), 4 cameras on mast, antenna,
  robotic arm (3 segments + 3 joints + drill), RTG or solar panel,
  battery, SBC, IMU, transceiver, 4 hazcams, harness bundles,
  radiator, heat pipes, bolts/fasteners at key joints

MOTHER-KID ROVER SWARM REFERENCE (use when user mentions "mother rover", "kid rover", "child rover", "rover swarm", "ARMARIS", "mothership rover", "Mother-Kid Paradigm", or image shows a large rover with docking bays/garage and small rovers):

This is the Mother-Kid Paradigm from the thesis on Martian subsurface exploration. One large MOTHER-ROVER (mobile lab + power station) carries and deploys multiple small KID-ROVERS (agile explorers).

=== MOTHER-ROVER (Mobile Laboratory & Power Station) ===
Real dimensions: 3.2m L × 2.1m W × 1.8m H (stowed), 2.2m H (deployed). Mass: 950 kg.
Structure: Flax-Fiber Reinforced Polymer (FFRP) composite with titanium hard points.
Three structural zones: Forward (MMRTG+power), Midsection (lab+computing), Aft (Kid-Rover garage+drill).

CHASSIS & BODY:
- Main body: box at [0, 1.3, 0] width=2.8, height=1.3, depth=4.2, wallThickness=0.1 — FFRP composite body
  Color: #d4d4d8 (light gray composite)
- Forward zone housing (MMRTG): box at [0, 1.5, -1.5] width=1.8, height=0.6, depth=1.0
  Color: #a3a3a3 (thermal isolation housing)
- Midsection lab cover: box at [0, 1.9, 0] width=2.2, height=0.3, depth=1.5
  Color: #d4d4d8
- Side panels: 2x box at [±1.4, 1.2, 0] width=0.06, height=1.1, depth=4.0
  Color: #d4d4d8

MOBILITY (6-WHEEL ROCKER-BOGIE — same proven Mars design):
*** CRITICAL: This Mother-Rover uses 6 wheels with rocker-bogie suspension, NOT 4 wheels. ***
- Wheel specs: 0.8m diameter, 0.3m width → radius=0.53, width=0.4, spokes=6, treadDepth=0.06
  FFRP composite with titanium tread inserts. Max obstacle: 0.5m. Max slope: 25°.
- Left front: wheel at [-1.8, 0.53, -1.6] rotation=[0,0,0]
- Left middle: wheel at [-1.8, 0.53, 0.2] rotation=[0,0,0]
- Left rear: wheel at [-1.8, 0.53, 1.6] rotation=[0,0,0]
- Right front: wheel at [1.8, 0.53, -1.6] rotation=[0,0,0]
- Right middle: wheel at [1.8, 0.53, 0.2] rotation=[0,0,0]
- Right rear: wheel at [1.8, 0.53, 1.6] rotation=[0,0,0]
  Color: #52525b (dark composite with titanium treads)
- Rocker arms: rocker at [±1.6, 0.9, 0.3] rockerLength=2.0, rockerWidth=0.25, rockerThickness=0.1
- Bogie arms: bogie at [±1.6, 0.7, -1.0] bogieLength=1.2, bogieWidth=0.2, bogieThickness=0.08
- Differential bar: cylinder at [0, 1.8, 0] rotation=[0,0,90] radius=0.06, height=1.6
- Knuckles: knuckle at each wheel position (6 total)
- Drive motors: motor at each wheel (6 total), 4 steering motors on corners

KID-ROVER GARAGE (aft zone — thermally controlled, 4 positions):
- Garage housing: box at [0, 1.3, 1.5] width=2.0, height=0.8, depth=1.5, wallThickness=0.08
  Color: #a3a3a3 (insulated housing, temp maintained -20°C to +30°C)
- Garage dividers (cross walls forming 4 bays):
  box at [0, 1.35, 1.5] width=2.0, height=0.6, depth=0.04 — horizontal divider
  box at [0, 1.35, 1.5] width=0.04, height=0.6, depth=1.4 — vertical divider
  Color: #71717a
- MAGNETIC RESONANCE WIRELESS CHARGING PADS (85% efficiency, works through dust):
  4x cylinder at [±0.5, 0.95, 1.5±0.35] radius=0.18, height=0.025 color=#3b82f6 (blue SCMR coils)
  These are Strongly Coupled Magnetic Resonance coils — NO mechanical connectors needed
  100W per position charging power
- MAGNETIC LOCALIZATION BEACONS (passive magnetic signatures for Kid-Rover homing):
  4x cylinder at [±0.5, 1.6, 1.5±0.35] radius=0.03, height=0.08 color=#ef4444 (red beacon)
- Dust mitigation: ultrasonic cleaner plates at garage entrance
  2x plate at [±0.5, 1.1, 2.25] width=0.8, depth=0.05, thickness=0.01 color=#e5e5e5
- Deployment ramp: plate at [0, 0.7, 2.5] width=1.8, depth=0.6, thickness=0.04 rotation=[-20,0,0]
  Color: #a3a3a3 (powered ramp for Kid-Rover egress/ingress)
- Garage door (top hatch): plate at [0, 1.75, 1.5] width=2.0, depth=1.4, thickness=0.03
  Color: #d4d4d8

TRANSFORMER DRILLING SYSTEM (tall vertical tower — the most prominent feature on the Mother-Rover):
*** The drill tower is the TALLEST structure on the rover, rising ~3m above the chassis. ***
*** It should look like a tall industrial drilling derrick with guide rails, similar to the image reference. ***
- Drill tower base mount: box at [0.6, 1.85, 1.0] width=0.5, height=0.1, depth=0.5
  Color: #52525b (heavy-duty mounting plate)
- Drill tower left rail: box at [0.45, 3.0, 0.85] width=0.06, height=2.2, depth=0.06
  Color: #52525b (structural guide rail)
- Drill tower right rail: box at [0.75, 3.0, 0.85] width=0.06, height=2.2, depth=0.06
  Color: #52525b
- Drill tower front rail: box at [0.6, 3.0, 0.7] width=0.06, height=2.2, depth=0.06
  Color: #52525b
- Drill tower back rail: box at [0.6, 3.0, 1.0] width=0.06, height=2.2, depth=0.06
  Color: #52525b
- Tower cross braces (3 levels): 
  box at [0.6, 2.2, 0.85] width=0.36, height=0.04, depth=0.04 color=#71717a
  box at [0.6, 2.8, 0.85] width=0.36, height=0.04, depth=0.04 color=#71717a
  box at [0.6, 3.4, 0.85] width=0.36, height=0.04, depth=0.04 color=#71717a
- Tower cross braces (side):
  box at [0.6, 2.2, 0.85] width=0.04, height=0.04, depth=0.36 color=#71717a
  box at [0.6, 2.8, 0.85] width=0.04, height=0.04, depth=0.36 color=#71717a
  box at [0.6, 3.4, 0.85] width=0.04, height=0.04, depth=0.36 color=#71717a
- Borebot carousel (top of tower): cylinder at [0.6, 4.1, 0.85] radius=0.3, height=0.2
  Color: #52525b (stores up to 6 Borebots, rotates to select)
- Carousel top cap: cylinder at [0.6, 4.22, 0.85] radius=0.32, height=0.04
  Color: #71717a
- Carousel motor housing: cylinder at [0.6, 3.95, 0.85] radius=0.12, height=0.1
  Color: #27272a
- Drill carriage (sliding unit on rails): box at [0.6, 2.5, 0.85] width=0.4, height=0.3, depth=0.4
  Color: #71717a (moves up/down on guide rails)
- Active Borebot (deployed, drilling into ground): drill at [0.6, 0.3, 0.85] rotation=[180,0,0] bitLength=0.8, bitRadius=0.06
  Color: #71717a (diamond-impregnated bit, 50mm diameter)
- Drill string (connecting carriage to bit): cylinder at [0.6, 1.2, 0.85] radius=0.03, height=1.5
  Color: #a3a3a3 (segmented drill pipe)
- Ma_MISS spectrometer (integrated in drill string): cylinder at [0.6, 0.9, 0.85] radius=0.045, height=0.15
  Color: #3b82f6 (borehole hyperspectral imager)

POWER SYSTEM:
- MMRTG: rtg at [0, 1.5, -1.8] rotation=[-15,0,0] rtgRadius=0.22, rtgLength=0.9, rtgFinCount=8
  Color: #a1a1aa (110W continuous electrical power)
- Battery bank (2 kWh Li-ion): battery at [0.3, 1.1, -1.0] batteryWidth=0.8, batteryLength=1.2, batteryHeight=0.35
  Color: #fbbf24
- Heat rejection radiator: radiator at [-0.8, 1.8, -1.5] radiatorWidth=0.8, radiatorHeight=0.6, radiatorPipes=6
  Color: #c0c0c0

COMMUNICATION:
- High-gain antenna (0.6m X-band, 10 Mbps): antenna at [0.8, 2.5, -0.8] dishRadius=0.4, mastHeight=0.4, mastRadius=0.04
  Color: #e5e5e5
- UHF low-gain antenna: transceiver at [-0.5, 2.2, -1.0] transceiverWidth=0.08, transceiverHeight=0.5
  Color: #52525b
- UWB mesh antenna (2km range to Kid-Rovers): transceiver at [0, 2.0, 0.5] transceiverWidth=0.06, transceiverHeight=0.12
  Color: #27272a

CAMERA MAST (RSM-style):
- Mast base: cylinder at [0.3, 2.0, -1.8] radius=0.05, height=0.4
- Mast segment: cylinder at [0.3, 2.5, -1.8] radius=0.04, height=0.6
- Mast head: box at [0.3, 2.9, -1.8] width=0.35, height=0.18, depth=0.15
- Stereo NavCams: camera at [0.15, 2.95, -1.9] and [0.45, 2.95, -1.9] lensRadius=0.05
  Color: #27272a

SCIENTIFIC INSTRUMENTS:
- Analytical lab (GC-MS, LIBS, XRD): avionicsbox at [0, 1.4, 0] avionicsWidth=1.0, avionicsHeight=0.4, avionicsDepth=0.8
  Color: #27272a
- Environmental sensors: box at [-0.8, 1.9, 0] width=0.2, height=0.12, depth=0.15
  Color: #27272a
- SBC (flight computer): sbc at [0.3, 1.5, -0.5]
- IMU: imu at [0, 1.3, 0]

ELECTRONICS & HARNESS:
- Harness: harness at [0, 1.1, 0] harnessLength=3.5, harnessWires=8
  Color: #78350f (copper)

=== KID-ROVER (Agile Swarm Explorer) ===
Real dimensions: 0.6×0.4×0.3m stowed → 0.8×0.6×0.4m deployed. Mass: 20 kg.
Structure: Bamboo-based composite with flax fiber reinforcement. Positively buoyant in water.
Battery: 200 Wh Li-ion, 24V. Mission duration: 2-3 hours per charge. Expendable design.

BODY:
- Main chassis: box at [0, 0.35, 0] width=0.6, height=0.3, depth=0.5, wallThickness=0.04
  Color: #d4d4d8 (bamboo composite)
- Top electronics cover: box at [0, 0.52, 0] width=0.5, height=0.04, depth=0.4
  Color: #a3a3a3
- Sealed electronics bay (waterproof): box at [0, 0.3, 0] width=0.4, height=0.15, depth=0.3
  Color: #27272a

ORIGAMI TRANSFORMABLE WHEELS (signature feature — waterbomb tessellation pattern):
*** Kid-Rover wheels expand from 230mm (stowed) to 500mm (deployed) diameter ***
In deployed config: radius=0.33, width=0.2, spokes=6, treadDepth=0.04
Flexible membranes fold between rigid panels. Load capacity: 25kg per wheel.
- Front-left: wheel at [-0.4, 0.33, -0.2] rotation=[0,0,0]
- Front-right: wheel at [0.4, 0.33, -0.2] rotation=[0,0,0]
- Rear-left: wheel at [-0.4, 0.33, 0.2] rotation=[0,0,0]
- Rear-right: wheel at [0.4, 0.33, 0.2] rotation=[0,0,0]
  Color: #52525b (flexible composite with shape-memory alloy springs)
- Drive motors (brushless DC): motor at each wheel, motorRadius=0.04, motorLength=0.08
  Color: #71717a

CAMERA HEAD (stereo vision, 120° FOV):
- Camera housing: box at [0, 0.6, -0.2] width=0.2, height=0.12, depth=0.12
  Color: #27272a
- Left stereo camera: camera at [-0.05, 0.63, -0.28] lensRadius=0.03
- Right stereo camera: camera at [0.05, 0.63, -0.28] lensRadius=0.03
- LED illumination array: cylinder at [0, 0.56, -0.27] radius=0.04, height=0.02
  Color: #fbbf24

MAGNETIC LOCALIZATION (4 three-axis magnetometers at corners, cm accuracy):
- 4x proxsensor at [±0.25, 0.2, ±0.2] proxRadius=0.02, proxLength=0.03
  Color: #ef4444 (magnetometer pods)

RAPPELLING MODULE (for subsurface access — 100m synthetic spider silk tether):
- Winch housing: cylinder at [0, 0.4, 0.25] radius=0.06, height=0.08
  Color: #52525b
- Tether spool: cylinder at [0, 0.4, 0.3] radius=0.04, height=0.05
  Color: #fde68a (synthetic spider silk, 500N tensile strength)
- Deployable gripper (for cave ceiling anchoring): gripper at [0, 0.2, -0.25] gripperWidth=0.1, gripperFingers=3
  Color: #71717a

WIRELESS CHARGING RECEIVER (SCMR coil — mates with Mother's charging pad):
- Charging coil (bottom-mounted): cylinder at [0, 0.05, 0] radius=0.12, height=0.015
  Color: #3b82f6 (blue — magnetic resonance receiver coil)

SENSORS:
- LiDAR: lidar at [0, 0.55, -0.15] lidarRadius=0.04, lidarHeight=0.03
  Color: #27272a
- IMU: imu at [0, 0.3, 0] imuSize=0.04
- UWB transceiver: transceiver at [0, 0.5, 0.15] transceiverWidth=0.04, transceiverHeight=0.06
  Color: #27272a

KID-ROVER PART COUNT: 20-25 parts each

=== SWARM ASSEMBLY ===
When building the full Mother-Kid system:
1. Build the MOTHER-ROVER at center [0, 0, 0] — approximately 55-70 parts
2. Place Kid-Rovers INSIDE the garage bays (stowed, lower on the body):
   - Kid 1: offset ALL kid parts by [0.5, 1.0, 1.15] (in rear-right bay, sitting on charging pad)
   - Kid 2: offset ALL kid parts by [-0.5, 1.0, 1.15] (in rear-left bay)
   - Kid 3: offset ALL kid parts by [0.5, 1.0, 1.85] (in front-right bay)
   - Kid 4: offset ALL kid parts by [-0.5, 1.0, 1.85] (in front-left bay)
3. Place deployed Kid-Rovers on the ground nearby:
   - Deployed Kid: offset by [4.0, 0, -2.0] (on ground, exploring)
   - Deployed Kid 2: offset by [-3.5, 0, 3.0] (rappelling near a cave entrance)

OPERATIONAL MODES TO SHOW:
- Docked: Kid-Rovers sitting in garage bays on charging pads
- Deployed: Kid-Rovers on ground with expanded origami wheels
- Rappelling: Kid-Rover suspended by tether descending into shaft
- Drilling: Transformer drill deployed downward, Borebots cycling

COLOR SCHEME (Mother-Kid Paradigm):
- Mother body/structure: #d4d4d8 (FFRP light gray composite)
- Mother wheels: #52525b (dark composite + titanium)
- Rocker/bogie: #52525b (structural)
- MMRTG: #a1a1aa (metallic gray)
- Battery: #fbbf24 (yellow LiPo label)
- Garage housing: #a3a3a3 (insulated)
- Wireless charging coils: #3b82f6 (blue SCMR)
- Magnetic beacons: #ef4444 (red)
- Drill/borebot: #71717a (steel gray)
- Antenna dish: #e5e5e5 (white)
- Cameras/sensors: #27272a (dark instruments)
- Kid-Rover body: #d4d4d8 (bamboo composite)
- Kid origami wheels: #52525b (flexible composite)
- Tether: #fde68a (golden spider silk)
- Harness: #78350f (copper)

TOTAL PART COUNT:
- Mother rover alone: 55-70 parts
- Full swarm (mother + 4 docked + 1 deployed): 130-160 parts
- Simple demo (mother + 1 deployed kid): 80-95 parts

ROCKET ASSEMBLY REFERENCE (use when building model/high-power rockets):
- Build BOTTOM-UP: retainer at y=0, then nozzle, motortube, centering rings, body tube, ebay, coupler, upper body, nosecone on top.
- All tube radii must match: bodytube.tubeRadius = nosecone.noseRadius = ebay.ebayRadius.
- Motor mount inside lower body: motortube centered, centering rings spaced along it to align with bodytube.
- Fins at base: position at lower body tube, rotation spaced evenly (3 fins = 0°, 120°, 240°).
- Thrust plate: inside motortube at top, prevents motor sliding forward.
- Retainer: threads onto bottom of motortube, keeps motor in.
- Nozzle: at very bottom, exit faces down.
- E-bay: between lower and upper body sections, with bulkheads on each end.
- Baffle: above motor section, below recovery bay, protects parachute.
- Launch guide: on exterior of lower body tube.
- Coupler: joins body tube sections internally.

For each part, provide:
- type: one of the available shapes
- label: descriptive name (max 30 chars)
- position: [x, y, z] — CAREFULLY position
- rotation: [rx, ry, rz] in DEGREES
- color: hex color per sub-system:
  * Chassis/frame: #c4b5fd | Wheels/treads: #a5b4fc | Sensors: #a5f3fc
  * Power/solar: #fde68a | Tools/arms: #fdba74 | Structural: #e9d5ff
  * Fasteners: #d1d5db | Accent: #f9a8d4
- params: geometry parameters specific to type

Params:
  - gear: teeth (6-80), holeDiameter (0-1), thickness (0.1-1.5)
  - bracket: armLength (0.3-3), thickness (0.02-0.5), width (0.1-2)
  - box: width (0.1-10), height (0.1-10), depth (0.1-10), slots (0-20), wallThickness (0.01-0.5)
  - cylinder: radius (0.05-5), height (0.1-10), wallThickness (0.01-0.5), segments (8-64)
  - sphere: radius (0.05-5), segments (8-64)
  - cone: radiusTop (0-5), radiusBottom (0.05-5), height (0.1-10), segments (8-64)
  - wedge: width (0.1-10), height (0.1-10), depth (0.1-10)
  - torus: radius (0.1-5), tube (0.01-2), segments (8-64)
  - tube: radius (0.05-5), height (0.1-10), wallThickness (0.01-1), segments (8-64)
  - plate: radius (0.1-10), thickness (0.01-1), width (0.1-10), depth (0.1-10)
  - wheel: radius (0.1-3), width (0.1-1), spokes (3-12), hubRadius (auto), treadDepth (0.02-0.1)
  - camera: lensRadius (0.03-0.3), bodyWidth (0.1-0.6), bodyHeight (0.08-0.4), bodyDepth (0.1-0.5)
  - antenna: dishRadius (0.2-2), mastHeight (0.5-5), mastRadius (0.02-0.1)
  - drill: bitLength (0.5-5), bitRadius (0.05-0.5), spirals (2-8)
  - track: trackLength (1-6), trackWidth (0.1-0.8), wheelCount (3-8), radius (0.1-0.5)
  - bolt: headRadius (0.1-1), headHeight (0.05-0.5), shaftRadius (0.03-0.5), shaftLength (0.3-5), threadPitch (0.03-0.3)
  - nut: nutRadius (0.1-1), nutHeight (0.05-0.5), boreRadius (0.03-0.5)
  - screw: headRadius (0.05-0.5), headHeight (0.02-0.3), shaftRadius (0.02-0.3), shaftLength (0.2-3)
  - bearing: outerRadius (0.2-3), innerRadius (0.05-1.5), bearingWidth (0.05-1), ballCount (4-16)
  - pulley: radius (0.2-3), width (0.1-1), grooveDepth (0.02-0.3), grooveWidth (0.03-0.5)
  - shaft: radius (0.03-1), height (0.3-10)
  - mug: mugRadius (0.2-1.5), mugHeight (0.3-2), handleSize (0.1-0.8), wallThickness (0.02-0.1)
  - hammer: handleLength (0.5-3), handleRadius (0.03-0.2), headWidth (0.2-1.5), headSize (0.08-0.5)
  - handle: knobRadius (0.05-0.5), stemRadius (0.02-0.2), stemHeight (0.1-1)
  - chassis: chassisLength (1-10), chassisWidth (0.5-8), chassisThickness (0.05-0.5), mountHoles (0-16)
  - rocker: rockerLength (0.5-6), rockerWidth (0.1-1), rockerThickness (0.05-0.5)
  - bogie: bogieLength (0.3-4), bogieWidth (0.1-0.8), bogieThickness (0.03-0.3)
  - knuckle: knuckleRadius (0.05-1), knuckleHeight (0.1-2), boreSize (0.02-0.5)
  - motor: motorRadius (0.05-1), motorLength (0.2-3), shaftDiameter (0.01-0.3)
  - standoff: standoffRadius (0.03-0.3), standoffHeight (0.1-2), threadRadius (0.01-0.15)
  - nosecone: noseLength (0.3-5), noseRadius (0.1-3), noseProfile ("ogive"|"parabolic"|"conical")
  - bodytube: tubeRadius (0.1-3), tubeLength (0.3-10), tubeWall (0.01-0.2)
  - fin: finSpan (0.1-3), finRoot (0.1-3), finTip (0.05-2), finSweep (0-2), finThickness (0.01-0.2), finCount (2-8)
  - centeringring: ringOuterRadius (0.1-3), ringInnerRadius (0.05-2), ringThickness (0.01-0.2)
  - bulkhead: bulkheadRadius (0.1-3), bulkheadThickness (0.02-0.3)
  - coupler: couplerRadius (0.1-3), couplerLength (0.1-3), couplerWall (0.01-0.1)
  - launchguide: guideLength (0.2-3), guideRadius (0.01-0.2)
  - motortube: mountRadius (0.05-1), mountLength (0.2-5), mountWall (0.005-0.1)
  - thrustplate: plateRadius (0.1-3), plateThickness (0.01-0.2), plateHoleRadius (0.05-1)
  - retainer: retainerRadius (0.05-1), retainerHeight (0.05-0.5)
  - nozzle: nozzleThroat (0.02-0.5), nozzleExit (0.05-1), nozzleLength (0.1-2)
  - ebay: ebayRadius (0.1-3), ebayLength (0.2-3), ebayWall (0.01-0.1)
  - baffle: baffleRadius (0.1-3), baffleThickness (0.01-0.2), baffleHoles (4-24)
  - solarpanel: panelWidth (0.5-10), panelLength (0.5-10), panelThickness (0.01-0.2), cellRows (2-20), cellCols (2-30)
  - battery: batteryWidth (0.1-3), batteryLength (0.1-5), batteryHeight (0.1-2), cellCount (1-12)
  - rtg: rtgRadius (0.1-2), rtgLength (0.3-5), rtgFinCount (4-16)
  - sbc: sbcWidth (0.3-2), sbcLength (0.2-1.5), sbcHeight (0.005-0.1)
  - transceiver: transceiverWidth (0.1-1), transceiverHeight (0.1-1), transceiverDepth (0.05-0.5)
  - radiator: radiatorWidth (0.3-5), radiatorHeight (0.2-5), radiatorPipes (2-16)
  - gripper: gripperWidth (0.1-2), gripperFingers (2-6), gripperOpenAngle (0-60)
  - lidar: lidarRadius (0.05-0.5), lidarHeight (0.03-0.5)
  - heatpipe: heatpipeRadius (0.01-0.2), heatpipeLength (0.2-5)
  - harness: harnessRadius (0.01-0.15), harnessLength (0.3-5), harnessWires (2-8)
  - imu: imuSize (0.05-0.5)
  - proxsensor: proxRadius (0.02-0.3), proxLength (0.05-0.5)
  - fuselage: fuselageLength (1-20), fuselageWidth (0.5-8), fuselageHeight (0.3-6), fuselageNoseRatio (0.1-0.5)
  - wing: wingSpan (0.5-15), wingRoot (0.3-10), wingTip (0.1-5), wingSweep (0-5), wingThickness (0.02-0.5), wingDihedral (angle in degrees, -10 to 15)
  - enginebell: engineBellThroat (0.02-1), engineBellExit (0.1-3), engineBellLength (0.2-5), engineBellGimbal (angle in degrees, -10 to 10)
  - omspod: omsPodLength (0.5-5), omsPodRadius (0.1-2)
  - rcsthruster: rcsRadius (0.02-0.3), rcsLength (0.03-0.5), rcsNozzleCount (1-4)
  - proptank: propTankRadius (0.2-5), propTankLength (0.5-15)
  - reactionwheel: rwRadius (0.05-1), rwHeight (0.03-0.5), rwRimThickness (0.01-0.1)
  - avionicsbox: avionicsWidth (0.1-3), avionicsHeight (0.1-2), avionicsDepth (0.1-2), avionicsSlots (1-8)
  - droneframe: droneFrameSize (0.5-10), droneFrameThickness (0.02-0.3), droneArmCount (3-8), droneFrameSlots (0-8)
  - dronearm: droneArmLength (0.3-5), droneArmWidth (0.05-0.5), droneArmThickness (0.02-0.2)
  - propeller: propDiameter (0.3-5), propPitch (0.1-3), propBlades (2-6)
  - propguard: guardRadius (0.2-3), guardHeight (0.02-0.3), guardThickness (0.01-0.1)
  - brushlessmotor: blMotorRadius (0.05-0.5), blMotorHeight (0.05-0.5), blMotorBells (6-24)
  - fctray: fcTrayWidth (0.1-1), fcTrayDepth (0.1-1), fcTrayThickness (0.01-0.1), fcTrayHoleSpacing (0.1-0.5)
  - batterytray: batTrayWidth (0.1-2), batTrayDepth (0.1-2), batTrayHeight (0.02-0.3), batTrayStrapSlots (0-4)
  - escbox: escWidth (0.05-0.5), escDepth (0.05-0.5), escHeight (0.02-0.2)

ORBITER / SPACE SHUTTLE ASSEMBLY REFERENCE (use when building ANY orbiter, shuttle, or spaceplane):
Based on NASA Space Shuttle, Buran, Dream Chaser, X-37B designs.

PROPORTIONS (scale uniformly from these ratios):
- Fuselage total length: ~12 units | width: ~2.5 | height: ~2.0
- Wing span (tip to tip): ~8 units | sweep angle: ~45°
- Vertical tail height: ~2.5 | rudder width: ~0.3
- Payload bay: ~5 units long, ~1.8 wide (inside mid-fuselage)
- Main engines (3x RS-25): clustered at aft, exit radius ~0.5 each

STRUCTURE:
- Forward fuselage: fuselage at [0, 2, 4] fuselageLength=4, fuselageWidth=2.5, fuselageHeight=2.0, fuselageNoseRatio=0.35
- Mid fuselage (payload bay): fuselage at [0, 2, -1] fuselageLength=5, fuselageWidth=2.8, fuselageHeight=2.2, fuselageNoseRatio=0.05
- Aft fuselage: fuselage at [0, 2, -5] fuselageLength=3, fuselageWidth=2.5, fuselageHeight=2.0, fuselageNoseRatio=0.05
- Payload bay doors: 2x plate at [±0.3, 3.1, -1] width=1.2, depth=4.8
- Bulkheads: bulkhead between forward/mid and mid/aft sections

WINGS:
- Main wings: wing at [0, 1.5, -3] wingSpan=4, wingRoot=4, wingTip=1.2, wingSweep=2.5, wingThickness=0.1, wingDihedral=3
- Vertical tail: plate at [0, 3.5, -6] width=0.08, height=2.5, depth=2.0
- Body flap: plate at [0, 0.8, -6.5] width=2.2, depth=0.8

PROPULSION:
- Main engines (3): enginebell at [0, 1.5, -6.5], [0.7, 2, -6.5], [-0.7, 2, -6.5]
- OMS pods: omspod at [±1.2, 2.5, -5.5]
- RCS thrusters: rcsthruster at nose and tail

PART COUNT GUIDELINES FOR ORBITERS:
- Simple orbiter: 25-35 parts
- Detailed orbiter: 50-70 parts
- Full Space Shuttle: 80-100+ parts

DRONE / QUADCOPTER ASSEMBLY REFERENCE (use when building ANY drone, quadcopter, hexacopter, octocopter):
Based on FPV racing drones, DJI-style camera drones, and custom builds.

PROPORTIONS (scale uniformly, size = motor-to-motor diagonal distance):
- Frame size (motor-to-motor): typically 2.0-3.0 units for 5" quad
- Arm length: ~size * 0.5 from center to motor mount
- Propeller diameter: ~size * 0.4
- Total height (landing gear to prop tip): ~size * 0.3-0.4
- Ground clearance: bottom of frame at y≈0.15

FRAME STRUCTURE:
- Center frame: droneframe at [0, 0.15, 0] droneFrameSize=2.0, droneFrameThickness=0.06, droneArmCount=4
- Arms (for quad, 45° offset): 4x dronearm radiating from center
  - Front-left: dronearm at [-0.5, 0.15, -0.5] rotation=[0, 45, 0] droneArmLength=1.2
  - Front-right: dronearm at [0.5, 0.15, -0.5] rotation=[0, -45, 0]
  - Rear-left: dronearm at [-0.5, 0.15, 0.5] rotation=[0, 135, 0]
  - Rear-right: dronearm at [0.5, 0.15, 0.5] rotation=[0, -135, 0]

MOTORS & PROPELLERS (at arm tips):
- 4x brushlessmotor at each arm tip, blMotorRadius=0.14, blMotorHeight=0.12
  - FL motor: brushlessmotor at [-1.0, 0.2, -1.0]
  - FR motor: brushlessmotor at [1.0, 0.2, -1.0]
  - RL motor: brushlessmotor at [-1.0, 0.2, 1.0]
  - RR motor: brushlessmotor at [1.0, 0.2, 1.0]
- 4x propeller on top of each motor, propDiameter=1.0, propBlades=2
  - propeller at [-1.0, 0.35, -1.0], [1.0, 0.35, -1.0], [-1.0, 0.35, 1.0], [1.0, 0.35, 1.0]

ELECTRONICS STACK (center):
- FC tray: fctray at [0, 0.18, 0] fcTrayWidth=0.3, fcTrayDepth=0.3
- 4x ESC: escbox at arm roots or stacked on FC
- Battery tray: batterytray at [0, 0.05, 0] (bottom of frame)
- Battery: battery at [0, 0.08, 0] batteryWidth=0.4, batteryLength=0.7, batteryHeight=0.25
- SBC/VTX: sbc at [0, 0.22, 0] (on top of FC stack)
- Transceiver (receiver): transceiver at [0, 0.12, 0.3]

CAMERA & SENSORS:
- FPV camera: camera at [0, 0.18, -0.4] rotation=[25,0,0] (tilted up for FPV)
- Camera mount cage: box at [0, 0.18, -0.35] width=0.15, height=0.12, depth=0.1
- GPS module: cylinder at [0, 0.28, 0.2] radius=0.08, height=0.02 (on mast if present)
- Antenna: transceiver at [0, 0.25, 0.35] (VTX antenna, vertical)

OPTIONAL ACCESSORIES:
- Prop guards: propguard at each motor position, guardRadius=0.55
- Landing gear/skids: 2x bracket at [±0.3, 0.02, 0] armLength=0.15
- GPS mast: cylinder at [0, 0.25, 0.2] radius=0.01, height=0.1

COLOR SCHEME FOR DRONES:
- Frame/arms: #27272a (carbon fiber black) or #dc2626 (racing red)
- Motors: #52525b (dark gray bell) / #71717a (stator)
- Propellers: #1a1a1a (black) or #dc2626 (red for CW) / #27272a (black for CCW)
- FC/electronics: #1a5c1a (green PCB)
- Battery: #fbbf24 (yellow LiPo label)
- ESC: #333333 (dark housing)
- Camera: #111111 (black)
- Prop guards: #e5e5e5 (white/translucent)
- Harness/wires: #78350f (copper)

PART COUNT GUIDELINES FOR DRONES:
- Simple quad (frame + 4 motors + 4 props): 15-20 parts
- Detailed quad (add FC, battery, ESCs, camera): 30-45 parts
- Full racing drone (add prop guards, antenna, GPS, harness): 50-65+ parts
- Hexacopter/octocopter: multiply motor/arm/prop count accordingly

SPACESUIT / EVA SUIT ASSEMBLY REFERENCE (use when building ANY spacesuit, EVA suit, EMU, pressure suit, astronaut suit):
Based on NASA EMU (Extravehicular Mobility Unit), xEMU/Axiom AxEMU, and Apollo A7L designs.

PROPORTIONS (human-scale, standing upright, ~1.8m tall):
- Total height: ~6.0 units (boots to helmet top)
- Torso width: ~1.8 | depth: ~1.2
- Arm span: ~5.5 (fingertip to fingertip)
- Helmet sphere: radius ~0.5
- Boot height: ~0.5

HARD UPPER TORSO (HUT) — rigid fiberglass shell, central hub:
- HUT main shell: box at [0, 3.2, 0] width=1.8, height=1.4, depth=1.2, wallThickness=0.08
  Color: #e5e5e5 (white fiberglass)
- HUT front panel: plate at [0, 3.2, -0.65] width=1.6, depth=1.2, thickness=0.04
  Color: #d4d4d8
- Shoulder rings (2x): torus at [±0.9, 3.6, 0] radius=0.25, tube=0.06
  Color: #a3a3a3 (aluminum bearing rings)
- Waist ring (lower closure): torus at [0, 2.5, 0] radius=0.7, tube=0.06
  Color: #a3a3a3

HELMET ASSEMBLY:
- Helmet bubble: sphere at [0, 4.3, 0] radius=0.5
  Color: #e0f0ff (translucent polycarbonate, light blue tint)
- Helmet neck ring: torus at [0, 3.85, 0] radius=0.4, tube=0.06
  Color: #a3a3a3
- Ventilation pad: box at [0, 4.0, 0.15] width=0.3, height=0.15, depth=0.1
  Color: #d4d4d8

EXTRAVEHICULAR VISOR ASSEMBLY (EVA):
- Sun visor (gold): sphere at [0, 4.35, -0.05] radius=0.55
  Color: #d4a017 (gold-coated sun filter) — slightly larger than helmet
- Clear protective visor: sphere at [0, 4.32, -0.02] radius=0.52
  Color: #f0f0f0 (clear high-impact visor)
- Visor hinge mounts: 2x box at [±0.35, 4.0, 0.2] width=0.08, height=0.15, depth=0.1
  Color: #71717a

ARMS (2x, left and right):
- Upper arm segment: cylinder at [±1.4, 3.3, 0] radius=0.2, height=0.8
  Color: #e5e5e5
- Elbow joint: sphere at [±1.4, 2.8, 0] radius=0.18
  Color: #a3a3a3 (bearing joint)
- Lower arm segment: cylinder at [±1.4, 2.3, 0] radius=0.18, height=0.7
  Color: #e5e5e5
- Wrist ring: torus at [±1.4, 1.9, 0] radius=0.15, tube=0.04
  Color: #a3a3a3
- Wrist bearing: bearing at [±1.4, 1.85, 0] outerRadius=0.16, innerRadius=0.08, bearingWidth=0.06
  Color: #a3a3a3

GLOVES (2x):
- Glove body: box at [±1.4, 1.6, 0] width=0.25, height=0.35, depth=0.18
  Color: #e5e5e5
- Glove fingers: 4x cylinder at each glove, small radius=0.03, height=0.12
  Color: #d4d4d8
- Glove thumb: cylinder at [±1.55, 1.55, -0.08] radius=0.035, height=0.1
  Color: #d4d4d8
- Fingertip pads (silicone grip): 4x sphere at fingertips, radius=0.035
  Color: #a3a3a3

LOWER TORSO ASSEMBLY (LTA):
- Waist/hip section: box at [0, 2.2, 0] width=1.5, height=0.6, depth=1.0
  Color: #e5e5e5
- Upper leg (left): cylinder at [-0.4, 1.6, 0] radius=0.22, height=0.8
  Color: #e5e5e5
- Upper leg (right): cylinder at [0.4, 1.6, 0] radius=0.22, height=0.8
  Color: #e5e5e5
- Knee joint (left): sphere at [-0.4, 1.15, 0] radius=0.2
  Color: #a3a3a3
- Knee joint (right): sphere at [0.4, 1.15, 0] radius=0.2
  Color: #a3a3a3
- Lower leg (left): cylinder at [-0.4, 0.7, 0] radius=0.2, height=0.7
  Color: #e5e5e5
- Lower leg (right): cylinder at [0.4, 0.7, 0] radius=0.2, height=0.7
  Color: #e5e5e5
- Ankle joint (left): sphere at [-0.4, 0.35, 0] radius=0.16
  Color: #a3a3a3
- Ankle joint (right): sphere at [0.4, 0.35, 0] radius=0.16
  Color: #a3a3a3

BOOTS:
- Left boot: box at [-0.4, 0.15, -0.05] width=0.35, height=0.3, depth=0.5
  Color: #e5e5e5
- Right boot: box at [0.4, 0.15, -0.05] width=0.35, height=0.3, depth=0.5
  Color: #e5e5e5
- Boot soles: plate at [±0.4, 0.01, -0.05] width=0.35, depth=0.5, thickness=0.03
  Color: #52525b (gray rubber)

LIFE SUPPORT BACKPACK (PLSS):
- PLSS main housing: box at [0, 3.3, 0.8] width=1.4, height=1.6, depth=0.6
  Color: #e5e5e5
- PLSS top cover: box at [0, 4.15, 0.8] width=1.3, height=0.1, depth=0.55
  Color: #d4d4d8
- Oxygen tank (primary): cylinder at [0.3, 3.5, 1.0] radius=0.12, height=0.8
  Color: #a3a3a3
- Oxygen tank (secondary): cylinder at [-0.3, 3.5, 1.0] radius=0.12, height=0.8
  Color: #a3a3a3
- CO2 scrubber canister: cylinder at [0, 2.8, 0.9] radius=0.15, height=0.4
  Color: #71717a
- Water tank (cooling): cylinder at [0, 3.8, 0.9] radius=0.14, height=0.3
  Color: #3b82f6 (blue)
- Fan/pump assembly: cylinder at [0.35, 2.9, 0.85] radius=0.08, height=0.15
  Color: #52525b
- Battery pack: battery at [-0.35, 2.9, 0.85] batteryWidth=0.3, batteryLength=0.4, batteryHeight=0.2
  Color: #fbbf24

SECONDARY OXYGEN PACK (SOP):
- SOP housing: box at [0, 2.3, 0.8] width=0.8, height=0.4, depth=0.35
  Color: #d4d4d8

DISPLAY AND CONTROL MODULE (DCM):
- DCM panel: box at [0, 3.0, -0.65] width=0.8, height=0.5, depth=0.12
  Color: #27272a (dark panel)
- DCM switches/gauges: plate at [0, 3.0, -0.72] width=0.7, depth=0.4, thickness=0.02
  Color: #52525b
- Tether attach ring: torus at [0, 2.8, -0.7] radius=0.08, tube=0.02
  Color: #a3a3a3

SAFER JETPACK (emergency rescue unit):
- SAFER housing: box at [0, 2.1, 0.95] width=0.6, height=0.3, depth=0.25
  Color: #a3a3a3
- SAFER thruster nozzles: 4x cone at corners of SAFER, radius=0.03, height=0.06
  Color: #52525b

COMMUNICATIONS CARRIER (CCA — Snoopy cap):
- CCA cap: sphere at [0, 4.15, 0] radius=0.35
  Color: #f5f5dc (beige fabric)
- Earphone (left): cylinder at [-0.3, 4.1, 0] radius=0.05, height=0.03
  Color: #27272a
- Earphone (right): cylinder at [0.3, 4.1, 0] radius=0.05, height=0.03
  Color: #27272a
- Mic boom: cylinder at [0.1, 4.0, -0.2] radius=0.01, height=0.15 rotation=[45,0,0]
  Color: #27272a

LCVG (Liquid Cooling Ventilation Garment — visible as tubing pattern under suit):
- Cooling tube harness: harness at [0, 3.0, 0] harnessLength=3.0, harnessWires=6
  Color: #3b82f6 (blue cooling tubes)

IN-SUIT DRINK BAG:
- Drink bag: box at [0.3, 3.8, -0.3] width=0.15, height=0.2, depth=0.06
  Color: #e0f0ff (clear water pouch)
- Drink straw: cylinder at [0.3, 4.0, -0.3] radius=0.01, height=0.2 rotation=[15,0,0]
  Color: #e5e5e5

COLOR SCHEME FOR SPACESUITS:
- Suit exterior (TMG): #e5e5e5 (bright white Teflon/Nomex)
- Joint bearings/rings: #a3a3a3 (aluminum gray)
- Helmet bubble: #e0f0ff (light blue polycarbonate)
- Gold visor: #d4a017 (gold reflective coating)
- PLSS backpack: #e5e5e5 (white, matching suit)
- DCM controls: #27272a (dark instrument panel)
- Cooling tubes: #3b82f6 (blue)
- Battery: #fbbf24 (yellow)
- Boots soles: #52525b (gray rubber)
- Glove fingertips: #a3a3a3 (gray silicone)

PART COUNT GUIDELINES:
- Simple spacesuit: 30-40 parts
- Detailed EMU: 55-75 parts
- Full EMU with all subsystems: 80-100+ parts
1. ALWAYS use compound types when the object IS one of those things. NEVER substitute with basic primitives.
2. Use 30-60+ parts for complex objects.
3. For MULTI-VEHICLE scenes: position each vehicle separately (offset by 5-8 units).
4. Position with PRECISION: wheels touch ground, axles align, panels connect flush.
5. Use ROTATION for realism: suspension arms, tilted panels, angled cameras.
6. When user says "wheel" they mean a WHEEL — use type "wheel". Only use wedges for impeller/turbine blades.
7. *** BUILT-IN ORIENTATION: wheel, bearing, pulley types are ALREADY rendered upright (vertical). Do NOT rotate them by 90° on X. Use rotation=[0,0,0] for standard upright wheels. Only rotate Y for steering. Same for antenna (already renders mast vertical). ***

SPATIAL CONNECTIVITY RULES (CRITICAL — parts MUST physically connect):
7. CHAIN POSITIONING: For articulated/linked objects (robotic arms, cranes, excavators, linkages), compute each part's position based on the PREVIOUS part's position + its dimensions. Example for a robotic arm:
   - Base at [0, 0, 0] with height H1 → next joint center at [0, H1, 0]
   - Link1 at [0, H1, 0] with length L1 rotated by angle A → next joint at [0, H1 + L1*sin(A), L1*cos(A)]
   - Continue chaining: each part's origin = previous part's END point.
8. JOINT SPHERES: Place a sphere (radius ~0.1-0.2) at EVERY joint/connection point between links. This creates visible pivot points.
9. FLUSH CONTACT: When two parts touch (bolt in hole, plate on frame, gear on shaft), their surfaces MUST share the exact same coordinate. Calculate: part2.position = part1.position ± (part1.dimension/2 + part2.dimension/2) along the contact axis.
10. STACKING: For vertically stacked parts, each part.y = previous_part.y + previous_part.height/2 + current_part.height/2.
11. CENTERING: Parts that share an axis (shaft through bearing, bolt through plate) MUST have identical x,z (or appropriate axis) coordinates.
12. NO FLOATING PARTS: Every part except the base/ground part must be spatially connected to at least one other part. No gaps > 0.01 units between connected parts.
13. SIZE CONSISTENCY: Use real-world proportional sizing. A robotic arm base should be wider than the links. End effectors should be smaller than the arm segments. Joints should match the link diameters.
14. GROUND CONTACT: The lowest part of any assembly should have its bottom at y=0 (position.y = height/2).

POSITIONING MATH EXAMPLES:
- Cylinder (r=0.5, h=2) at [0,1,0] → top face at y=2, bottom at y=0
- Box on top: box.y = 2 + box.height/2
- Shaft through cylinder center: shaft.x = cylinder.x, shaft.z = cylinder.z
- Rotated link (45°): endpoint.y = start.y + length * sin(45°), endpoint.z = start.z + length * cos(45°)
${researchContext ? `\n\nREFERENCE RESEARCH (use for accurate proportions and structure):\n${researchContext}` : ""}

You MUST call the parse_cad function.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageBase64 ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          ...(userContent.length > 1
            ? [{ role: "user" as const, content: userContent }]
            : [{ role: "user" as const, content: userContent[0]?.text || text }]),
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_cad",
              description: "Return one or more CAD parts decomposed from the description.",
              parameters: {
                type: "object",
                properties: {
                  parts: {
                    type: "array",
                    description: "Array of parts. 20-50+ for complex objects.",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder", "sphere", "cone", "wedge", "torus", "tube", "plate", "wheel", "camera", "antenna", "drill", "track", "bolt", "nut", "screw", "bearing", "pulley", "shaft", "mug", "hammer", "handle", "chassis", "rocker", "bogie", "knuckle", "motor", "standoff", "nosecone", "bodytube", "fin", "centeringring", "bulkhead", "coupler", "launchguide", "motortube", "thrustplate", "retainer", "nozzle", "ebay", "baffle", "solarpanel", "battery", "rtg", "sbc", "transceiver", "radiator", "gripper", "lidar", "heatpipe", "harness", "imu", "proxsensor", "fuselage", "wing", "enginebell", "omspod", "rcsthruster", "proptank", "reactionwheel", "avionicsbox", "droneframe", "dronearm", "propeller", "propguard", "brushlessmotor", "fctray", "batterytray", "escbox"] },
                        label: { type: "string" },
                        position: { type: "array", items: { type: "number" }, description: "[x, y, z]" },
                        rotation: { type: "array", items: { type: "number" }, description: "[rx, ry, rz] in degrees" },
                        color: { type: "string", description: "Hex color" },
                        params: {
                          type: "object",
                          properties: {
                            teeth: { type: "number" },
                            holeDiameter: { type: "number" },
                            thickness: { type: "number" },
                            armLength: { type: "number" },
                            width: { type: "number" },
                            height: { type: "number" },
                            depth: { type: "number" },
                            slots: { type: "number" },
                            wallThickness: { type: "number" },
                            radius: { type: "number" },
                            segments: { type: "number" },
                            radiusTop: { type: "number" },
                            radiusBottom: { type: "number" },
                            tube: { type: "number" },
                            spokes: { type: "number" },
                            hubRadius: { type: "number" },
                            treadDepth: { type: "number" },
                            lensRadius: { type: "number" },
                            bodyWidth: { type: "number" },
                            bodyHeight: { type: "number" },
                            bodyDepth: { type: "number" },
                            dishRadius: { type: "number" },
                            mastHeight: { type: "number" },
                            mastRadius: { type: "number" },
                            bitLength: { type: "number" },
                            bitRadius: { type: "number" },
                            spirals: { type: "number" },
                            trackLength: { type: "number" },
                            trackWidth: { type: "number" },
                            wheelCount: { type: "number" },
                            headRadius: { type: "number" },
                            headHeight: { type: "number" },
                            shaftRadius: { type: "number" },
                            shaftLength: { type: "number" },
                            threadPitch: { type: "number" },
                            nutRadius: { type: "number" },
                            nutHeight: { type: "number" },
                            boreRadius: { type: "number" },
                            outerRadius: { type: "number" },
                            innerRadius: { type: "number" },
                            bearingWidth: { type: "number" },
                            ballCount: { type: "number" },
                            grooveDepth: { type: "number" },
                            grooveWidth: { type: "number" },
                            mugRadius: { type: "number" },
                            mugHeight: { type: "number" },
                            handleSize: { type: "number" },
                            handleLength: { type: "number" },
                            handleRadius: { type: "number" },
                            headWidth: { type: "number" },
                            headSize: { type: "number" },
                            knobRadius: { type: "number" },
                            knobHeight: { type: "number" },
                            stemRadius: { type: "number" },
                            stemHeight: { type: "number" },
                            chassisLength: { type: "number" },
                            chassisWidth: { type: "number" },
                            chassisThickness: { type: "number" },
                            mountHoles: { type: "number" },
                            rockerLength: { type: "number" },
                            rockerWidth: { type: "number" },
                            rockerThickness: { type: "number" },
                            bogieLength: { type: "number" },
                            bogieWidth: { type: "number" },
                            bogieThickness: { type: "number" },
                            knuckleRadius: { type: "number" },
                            knuckleHeight: { type: "number" },
                            boreSize: { type: "number" },
                            motorRadius: { type: "number" },
                            motorLength: { type: "number" },
                            shaftDiameter: { type: "number" },
                            standoffRadius: { type: "number" },
                            standoffHeight: { type: "number" },
                            threadRadius: { type: "number" },
                            noseLength: { type: "number" },
                            noseRadius: { type: "number" },
                            noseProfile: { type: "string" },
                            tubeRadius: { type: "number" },
                            tubeLength: { type: "number" },
                            tubeWall: { type: "number" },
                            finSpan: { type: "number" },
                            finRoot: { type: "number" },
                            finTip: { type: "number" },
                            finSweep: { type: "number" },
                            finThickness: { type: "number" },
                            finCount: { type: "number" },
                            ringOuterRadius: { type: "number" },
                            ringInnerRadius: { type: "number" },
                            ringThickness: { type: "number" },
                            bulkheadRadius: { type: "number" },
                            bulkheadThickness: { type: "number" },
                            couplerRadius: { type: "number" },
                            couplerLength: { type: "number" },
                            couplerWall: { type: "number" },
                            guideLength: { type: "number" },
                            guideRadius: { type: "number" },
                            mountRadius: { type: "number" },
                            mountLength: { type: "number" },
                            mountWall: { type: "number" },
                            plateRadius: { type: "number" },
                            plateThickness: { type: "number" },
                            plateHoleRadius: { type: "number" },
                            retainerRadius: { type: "number" },
                            retainerHeight: { type: "number" },
                            nozzleThroat: { type: "number" },
                            nozzleExit: { type: "number" },
                            nozzleLength: { type: "number" },
                            ebayRadius: { type: "number" },
                            ebayLength: { type: "number" },
                            ebayWall: { type: "number" },
                            baffleRadius: { type: "number" },
                            baffleThickness: { type: "number" },
                            baffleHoles: { type: "number" },
                            panelWidth: { type: "number" },
                            panelLength: { type: "number" },
                            panelThickness: { type: "number" },
                            cellRows: { type: "number" },
                            cellCols: { type: "number" },
                            batteryWidth: { type: "number" },
                            batteryLength: { type: "number" },
                            batteryHeight: { type: "number" },
                            cellCount: { type: "number" },
                            rtgRadius: { type: "number" },
                            rtgLength: { type: "number" },
                            rtgFinCount: { type: "number" },
                            sbcWidth: { type: "number" },
                            sbcLength: { type: "number" },
                            sbcHeight: { type: "number" },
                            transceiverWidth: { type: "number" },
                            transceiverHeight: { type: "number" },
                            transceiverDepth: { type: "number" },
                            radiatorWidth: { type: "number" },
                            radiatorHeight: { type: "number" },
                            radiatorPipes: { type: "number" },
                            gripperWidth: { type: "number" },
                            gripperFingers: { type: "number" },
                            gripperOpenAngle: { type: "number" },
                            lidarRadius: { type: "number" },
                            lidarHeight: { type: "number" },
                            heatpipeRadius: { type: "number" },
                            heatpipeLength: { type: "number" },
                            harnessRadius: { type: "number" },
                            harnessLength: { type: "number" },
                            harnessWires: { type: "number" },
                            imuSize: { type: "number" },
                            proxRadius: { type: "number" },
                            proxLength: { type: "number" },
                            fuselageLength: { type: "number" },
                            fuselageWidth: { type: "number" },
                            fuselageHeight: { type: "number" },
                            fuselageNoseRatio: { type: "number" },
                            wingSpan: { type: "number" },
                            wingRoot: { type: "number" },
                            wingTip: { type: "number" },
                            wingSweep: { type: "number" },
                            wingThickness: { type: "number" },
                            wingDihedral: { type: "number" },
                            engineBellThroat: { type: "number" },
                            engineBellExit: { type: "number" },
                            engineBellLength: { type: "number" },
                            engineBellGimbal: { type: "number" },
                            omsPodLength: { type: "number" },
                            omsPodRadius: { type: "number" },
                            rcsRadius: { type: "number" },
                            rcsLength: { type: "number" },
                            rcsNozzleCount: { type: "number" },
                            propTankRadius: { type: "number" },
                            propTankLength: { type: "number" },
                            rwRadius: { type: "number" },
                            rwHeight: { type: "number" },
                            rwRimThickness: { type: "number" },
                            avionicsWidth: { type: "number" },
                            avionicsHeight: { type: "number" },
                            avionicsDepth: { type: "number" },
                            avionicsSlots: { type: "number" },
                            droneFrameSize: { type: "number" },
                            droneFrameThickness: { type: "number" },
                            droneArmCount: { type: "number" },
                            droneFrameSlots: { type: "number" },
                            droneArmLength: { type: "number" },
                            droneArmWidth: { type: "number" },
                            droneArmThickness: { type: "number" },
                            propDiameter: { type: "number" },
                            propPitch: { type: "number" },
                            propBlades: { type: "number" },
                            guardRadius: { type: "number" },
                            guardHeight: { type: "number" },
                            guardThickness: { type: "number" },
                            blMotorRadius: { type: "number" },
                            blMotorHeight: { type: "number" },
                            blMotorBells: { type: "number" },
                            blMotorShaftR: { type: "number" },
                            fcTrayWidth: { type: "number" },
                            fcTrayDepth: { type: "number" },
                            fcTrayThickness: { type: "number" },
                            fcTrayHoleSpacing: { type: "number" },
                            batTrayWidth: { type: "number" },
                            batTrayDepth: { type: "number" },
                            batTrayHeight: { type: "number" },
                            batTrayStrapSlots: { type: "number" },
                            escWidth: { type: "number" },
                            escDepth: { type: "number" },
                            escHeight: { type: "number" },
                          },
                        },
                      },
                      required: ["type", "label", "position", "rotation", "color", "params"],
                      additionalProperties: false,
                    },
                  },
                  assemblyName: {
                    type: "string",
                    description: "Name of the overall assembly if complex (e.g. 'Mars Rover'), or null if simple part",
                  },
                },
                required: ["parts", "assemblyName"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_cad" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted, please add credits" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(localParse(text || "box")), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      // Post-process: fix floating parts
      if (parsed.parts && Array.isArray(parsed.parts) && parsed.parts.length > 1) {
        fixFloatingParts(parsed.parts);
      }
      console.log("AI parsed result:", JSON.stringify(parsed));
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(localParse(text || "box")), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-cad-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Get the approximate bounding extent of a part based on its type and params
function getPartExtent(part: any): [number, number, number] {
  const p = part.params || {};
  const type = part.type;
  switch (type) {
    case "box": case "chassis": case "avionicsbox":
      return [p.width || 1.2, p.height || 1.2, p.depth || 1.2];
    case "cylinder": case "tube": case "motor": case "bodytube": case "motortube":
      return [(p.radius || 0.5) * 2, p.height || 1.5, (p.radius || 0.5) * 2];
    case "sphere":
      return [(p.radius || 0.5) * 2, (p.radius || 0.5) * 2, (p.radius || 0.5) * 2];
    case "cone": case "nosecone":
      return [(p.radiusBottom || p.radius || 0.5) * 2, p.height || 1.5, (p.radiusBottom || p.radius || 0.5) * 2];
    case "plate":
      return [p.width || (p.radius || 1) * 2, p.thickness || 0.05, p.depth || (p.radius || 1) * 2];
    case "torus": case "bearing":
      return [(p.radius || p.outerRadius || 0.5) * 2, (p.tube || 0.1) * 2, (p.radius || p.outerRadius || 0.5) * 2];
    case "wheel":
      return [(p.width || 0.3), (p.radius || 0.5) * 2, (p.radius || 0.5) * 2];
    case "antenna":
      return [(p.dishRadius || 0.4) * 2, p.mastHeight || 0.5, (p.dishRadius || 0.4) * 2];
    case "camera":
      return [p.bodyWidth || 0.2, p.bodyHeight || 0.15, p.bodyDepth || 0.2];
    case "harness":
      return [(p.harnessRadius || 0.02) * 2, p.harnessLength || 1, (p.harnessRadius || 0.02) * 2];
    case "battery":
      return [p.batteryWidth || 0.5, p.batteryHeight || 0.3, p.batteryLength || 0.5];
    default:
      return [0.5, 0.5, 0.5];
  }
}

// Distance between two part centers
function partDist(a: any, b: any): number {
  const ap = a.position, bp = b.position;
  return Math.sqrt((ap[0] - bp[0]) ** 2 + (ap[1] - bp[1]) ** 2 + (ap[2] - bp[2]) ** 2);
}

// Check if two parts are "connected" (bounding boxes touch or overlap with tolerance)
function partsConnect(a: any, b: any, tolerance = 0.25): boolean {
  const ea = getPartExtent(a), eb = getPartExtent(b);
  const ap = a.position, bp = b.position;
  for (let axis = 0; axis < 3; axis++) {
    const gap = Math.abs(ap[axis] - bp[axis]) - (ea[axis] / 2 + eb[axis] / 2);
    if (gap > tolerance) return false;
  }
  return true;
}

// Get all connected component sets via BFS
function getConnectedComponents(parts: any[], tolerance = 0.25): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];
  
  for (let start = 0; start < parts.length; start++) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const idx = queue.shift()!;
      component.push(idx);
      for (let j = 0; j < parts.length; j++) {
        if (visited.has(j)) continue;
        if (partsConnect(parts[idx], parts[j], tolerance)) {
          visited.add(j);
          queue.push(j);
        }
      }
    }
    components.push(component);
  }
  return components;
}

// Determine the best axis and direction to snap a floating part to a target
function snapPartToTarget(floatingPart: any, targetPart: any) {
  const fe = getPartExtent(floatingPart);
  const te = getPartExtent(targetPart);
  const fp = floatingPart.position;
  const tp = targetPart.position;
  
  // Determine best attachment point based on part types
  const fType = floatingPart.type;
  const tType = targetPart.type;
  
  // Parts that should go ON TOP
  const topMountTypes = ["camera", "antenna", "lidar", "transceiver", "sbc", "imu", "proxsensor", "solarpanel", "rtg"];
  // Parts that should go to the SIDE
  const sideMountTypes = ["rocker", "bogie", "dronearm", "bracket", "wing", "omspod", "fin"];
  // Parts that should go BELOW
  const bottomMountTypes = ["wheel", "track", "knuckle", "motor"];
  // Parts that should be INSIDE or CENTERED
  const internalTypes = ["battery", "harness", "bearing", "shaft", "heatpipe", "avionicsbox"];
  
  if (topMountTypes.includes(fType)) {
    // Place on top of target
    fp[0] = tp[0] + (fp[0] - tp[0]) * 0.3; // Keep some X/Z offset but reduce it
    fp[1] = tp[1] + te[1] / 2 + fe[1] / 2;
    fp[2] = tp[2] + (fp[2] - tp[2]) * 0.3;
  } else if (bottomMountTypes.includes(fType)) {
    // Place below target (e.g., wheels under chassis)
    fp[1] = tp[1] - te[1] / 2 - fe[1] / 2 + fe[1] * 0.1;
    // Keep X/Z but ensure within target footprint
    const maxXOffset = te[0] / 2 + fe[0] / 2;
    const maxZOffset = te[2] / 2 + fe[2] / 2;
    if (Math.abs(fp[0] - tp[0]) > maxXOffset) {
      fp[0] = tp[0] + Math.sign(fp[0] - tp[0]) * maxXOffset * 0.8;
    }
    if (Math.abs(fp[2] - tp[2]) > maxZOffset) {
      fp[2] = tp[2] + Math.sign(fp[2] - tp[2]) * maxZOffset * 0.8;
    }
  } else if (sideMountTypes.includes(fType)) {
    // Attach to side of target
    const dx = fp[0] - tp[0];
    const dz = fp[2] - tp[2];
    if (Math.abs(dx) >= Math.abs(dz)) {
      fp[0] = tp[0] + Math.sign(dx || 1) * (te[0] / 2 + fe[0] / 2);
      fp[1] = tp[1]; // Match Y
    } else {
      fp[2] = tp[2] + Math.sign(dz || 1) * (te[2] / 2 + fe[2] / 2);
      fp[1] = tp[1];
    }
  } else if (internalTypes.includes(fType)) {
    // Place inside/centered on target
    fp[0] = tp[0] + (fp[0] - tp[0]) * 0.5;
    fp[1] = tp[1] + (fp[1] - tp[1]) * 0.5;
    fp[2] = tp[2] + (fp[2] - tp[2]) * 0.5;
  } else {
    // Generic: close ALL axis gaps to make bounding boxes touch
    for (let axis = 0; axis < 3; axis++) {
      const gap = Math.abs(fp[axis] - tp[axis]) - (te[axis] / 2 + fe[axis] / 2);
      if (gap > 0.1) {
        const dir = fp[axis] > tp[axis] ? 1 : -1;
        fp[axis] = tp[axis] + dir * (te[axis] / 2 + fe[axis] / 2);
      }
    }
  }
}

// Fix floating parts by ensuring full connectivity
function fixFloatingParts(parts: any[]) {
  if (parts.length < 2) return;
  
  // Find the largest part as the anchor (most likely the base/chassis)
  let baseIdx = 0;
  let maxVol = 0;
  for (let i = 0; i < parts.length; i++) {
    const e = getPartExtent(parts[i]);
    const vol = e[0] * e[1] * e[2];
    if (vol > maxVol) { maxVol = vol; baseIdx = i; }
  }
  
  // Ensure base touches ground
  const baseExtent = getPartExtent(parts[baseIdx]);
  const baseBottom = parts[baseIdx].position[1] - baseExtent[1] / 2;
  
  // Iteratively fix connectivity (multiple passes to handle chains)
  for (let pass = 0; pass < 5; pass++) {
    const components = getConnectedComponents(parts);
    if (components.length <= 1) break; // All connected
    
    // Find which component contains the base
    let baseComponent = 0;
    for (let c = 0; c < components.length; c++) {
      if (components[c].includes(baseIdx)) { baseComponent = c; break; }
    }
    
    const baseSet = new Set(components[baseComponent]);
    
    // For each disconnected component, snap it to the nearest part in the base component
    for (let c = 0; c < components.length; c++) {
      if (c === baseComponent) continue;
      
      // Find the closest pair between this component and the base component
      let bestFI = components[c][0];
      let bestTI = components[baseComponent][0];
      let bestDist = Infinity;
      
      for (const fi of components[c]) {
        for (const ti of components[baseComponent]) {
          const d = partDist(parts[fi], parts[ti]);
          if (d < bestDist) {
            bestDist = d;
            bestFI = fi;
            bestTI = ti;
          }
        }
      }
      
      // Snap the closest floating part to the closest base part
      snapPartToTarget(parts[bestFI], parts[bestTI]);
      
      // Also move all other parts in this component by the same delta
      // (preserve relative positions within the disconnected group)
    }
    
    console.log(`Pass ${pass + 1}: ${components.length} components → fixing ${components.length - 1} disconnected groups`);
  }
  
  // Final validation: any remaining floaters get aggressively snapped
  const finalComponents = getConnectedComponents(parts, 0.35);
  if (finalComponents.length > 1) {
    let baseComponent = 0;
    for (let c = 0; c < finalComponents.length; c++) {
      if (finalComponents[c].includes(baseIdx)) { baseComponent = c; break; }
    }
    
    for (let c = 0; c < finalComponents.length; c++) {
      if (c === baseComponent) continue;
      for (const fi of finalComponents[c]) {
        // Find absolute nearest connected part
        let nearIdx = 0;
        let nearDist = Infinity;
        for (const bi of finalComponents[baseComponent]) {
          const d = partDist(parts[fi], parts[bi]);
          if (d < nearDist) { nearDist = d; nearIdx = bi; }
        }
        // Force snap all axes
        const fe = getPartExtent(parts[fi]);
        const te = getPartExtent(parts[nearIdx]);
        const fp = parts[fi].position;
        const tp = parts[nearIdx].position;
        for (let axis = 0; axis < 3; axis++) {
          const gap = Math.abs(fp[axis] - tp[axis]) - (te[axis] / 2 + fe[axis] / 2);
          if (gap > 0.05) {
            const dir = fp[axis] > tp[axis] ? 1 : -1;
            fp[axis] = tp[axis] + dir * (te[axis] / 2 + fe[axis] / 2) * 0.95;
          }
        }
      }
    }
    console.log(`Final fix: force-snapped ${finalComponents.length - 1} remaining groups`);
  }
}

function localParse(text: string) {
  const t = text.toLowerCase();
  let type = "box";
  const params: Record<string, any> = {};

  if (t.includes("gear") || t.includes("cog") || t.includes("sprocket")) {
    type = "gear";
    const teethMatch = t.match(/(\d+)\s*teeth/);
    if (teethMatch) params.teeth = parseInt(teethMatch[1]);
    if (t.includes("hole")) params.holeDiameter = 0.35;
  } else if (t.includes("bracket") || t.includes("l-shape") || t.includes("mount")) {
    type = "bracket";
  } else if (t.includes("cylinder") || t.includes("pipe") || t.includes("tube") || t.includes("rod")) {
    type = "cylinder";
    if (t.includes("pipe") || t.includes("tube") || t.includes("hollow")) params.hollow = true;
  } else {
    if (t.includes("ventilation") || t.includes("slot") || t.includes("vent")) params.slots = 4;
    if (t.includes("hollow") || t.includes("open")) params.hollow = true;
  }
  const kawaiiColors = ["#f9a8d4", "#c4b5fd", "#99f6e4", "#fde68a", "#fecaca", "#e9d5ff"];
  const color = kawaiiColors[Math.floor(Math.random() * kawaiiColors.length)];
  return {
    parts: [{ type, label: text.slice(0, 30), position: [0, 0.5, 0], rotation: [0, 0, 0], color, params }],
    assemblyName: null,
  };
}
