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
          ? `Analyze this image AND description: "${text}". Break it down into CAD parts.`
          : "Analyze this image. Break it down into CAD parts.",
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

Available shape types: gear, bracket, box, cylinder, sphere, cone, wedge, torus, tube, plate, wheel, camera, antenna, drill, track, bolt, nut, screw, bearing, pulley, shaft, mug, hammer, handle, chassis, rocker, bogie, knuckle, motor, standoff, nosecone, bodytube, fin, centeringring, bulkhead, coupler, launchguide, motortube, thrustplate, retainer, nozzle, ebay, baffle, solarpanel, battery, rtg, sbc, transceiver, radiator, gripper, lidar, heatpipe, harness, imu, proxsensor.

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
- Wheel params: radius=0.5, width=0.35, spokes=6, treadDepth=0.06
- Left front: wheel at [-2.2, 0.5, -1.6] — on left bogie front
- Left middle: wheel at [-2.2, 0.5, 0.3] — on left rocker middle
- Left rear: wheel at [-2.2, 0.5, 1.5] — on left bogie rear
- Right front: wheel at [2.2, 0.5, -1.6]
- Right middle: wheel at [2.2, 0.5, 0.3]
- Right rear: wheel at [2.2, 0.5, 1.5]
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

CRITICAL RULES:
1. ALWAYS use compound types when the object IS one of those things. NEVER substitute with basic primitives.
2. Use 30-60+ parts for complex objects.
3. For MULTI-VEHICLE scenes: position each vehicle separately (offset by 5-8 units).
4. Position with PRECISION: wheels touch ground, axles align, panels connect flush.
5. Use ROTATION for realism: suspension arms, tilted panels, angled cameras.
6. When user says "wheel" they mean a WHEEL — use type "wheel". Only use wedges for impeller/turbine blades.

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
                        type: { type: "string", enum: ["gear", "bracket", "box", "cylinder", "sphere", "cone", "wedge", "torus", "tube", "plate", "wheel", "camera", "antenna", "drill", "track", "bolt", "nut", "screw", "bearing", "pulley", "shaft", "mug", "hammer", "handle", "chassis", "rocker", "bogie", "knuckle", "motor", "standoff", "nosecone", "bodytube", "fin", "centeringring", "bulkhead", "coupler", "launchguide", "motortube", "thrustplate", "retainer", "nozzle", "ebay", "baffle", "solarpanel", "battery", "rtg", "sbc", "transceiver", "radiator", "gripper", "lidar", "heatpipe", "harness", "imu", "proxsensor"] },
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
