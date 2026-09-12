# 120Hz WebRTC Telemetry Architecture & Design Document
**Project:** Car Soccer Desktop (Tauri + WebRTC)  
**Target Output Rate:** 120 Hz  
**Protocol:** WebRTC DataChannel (RTCDataChannel)  
**Payload Format:** JSON (`Event: "UpdateState"`)

---

## 1. Executive Summary & Objective

This document outlines the architectural blueprint and technical feasibility analysis for exporting real-time vehicle and match telemetry from **Car Soccer** running within a **Tauri desktop application wrapper** to external consumers (e.g., AI coaching overlays, tournament broadcasters, machine-learning data pipelines, or external bots) via **WebRTC DataChannels** operating at **120 Hz**.

Every physics tick (~8.33 ms interval at 120Hz), the engine serializes the complete match and player state into a standardized JSON payload and broadcasts it across active WebRTC data channels with sub-frame transmission latency.

---

## 2. Telemetry Packet Specification

The output stream strictly adheres to the following JSON schema emitted every tick:

```json
{
  "Event": "UpdateState",
  "MatchGuid": "a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6",
  "Players": [
    {
      "Name": "Player 1",
      "PrimaryId": "steam:76561198000000001",
      "TeamNum": 0,
      "bHasCar": true,
      "Speed": 1410.5,
      "Boost": 82.4,
      "bBoosting": false,
      "bOnGround": true,
      "bOnWall": false,
      "bPowersliding": false,
      "bDemolished": false,
      "Attacker": null,
      "bSupersonic": false
    },
    {
      "Name": "Player 2",
      "PrimaryId": "steam:76561198000000002",
      "TeamNum": 1,
      "bHasCar": true,
      "Speed": 2240.2,
      "Boost": 100.0,
      "bBoosting": true,
      "bOnGround": false,
      "bOnWall": false,
      "bPowersliding": false,
      "bDemolished": false,
      "Attacker": null,
      "bSupersonic": true
    }
  ],
  "Game": {
    "Teams": [
      { "TeamNum": 0, "Score": 1 },
      { "TeamNum": 1, "Score": 0 }
    ],
    "TimeSeconds": 248.5,
    "bOvertime": false,
    "Ball": {
      "Location": { "X": 0.0, "Y": 120.4, "Z": 92.5 },
      "Rotation": { "Pitch": 0.0, "Yaw": 45.0, "Roll": 0.0 },
      "Velocity": { "X": 350.2, "Y": 1200.5, "Z": -150.0 },
      "AngularVelocity": { "X": 0.05, "Y": -1.2, "Z": 0.8 }
    },
    "bHasTarget": true,
    "Target": {
      "TeamNum": 0,
      "Location": { "X": 0.0, "Y": -5120.0, "Z": 321.0 }
    }
  }
}
```

---

## 3. High-Level System Architecture

```
+-----------------------------------------------------------------------------------+
|                            Tauri Desktop Application                             |
|                                                                                   |
|  +---------------------------+             +-----------------------------------+  |
|  |    RocketSim WASM Core    |             |        WebRTC Telemetry Hub       |  |
|  |  - 120 Hz Physics Step    |             |  - RTCDataChannel Pool (ordered:  |  |
|  |  - State Buffer (F32)     |             |    false, maxRetransmits: 0)      |  |
|  +-------------+-------------+             +-----------------+-----------------+  |
|                | Memory View                                 ^                    |
|                v                                             | Raw JSON Packets   |
|  +---------------------------+             +-----------------+-----------------+  |
|  | State Extraction &        +------------>| High-Efficiency Serializer        |  |
|  | Derivation Engine         |             |  - Scratch buffer recycling       |  |
|  +---------------------------+             +-----------------------------------+  |
+--------------------------------------------------------------|--------------------+
                                                               | WebRTC PeerConnection
                                                               | (UDP / SCTP DataChannel)
                                                               v
                                             +-----------------------------------+
                                             |       External Telemetry Sink     |
                                             |   (Broadcaster / AI Coach / ML)   |
                                             +-----------------------------------+
```

### 3.1 Pipeline Stages
1. **Physics Tick Extraction (8.33ms interval)**: RocketSim outputs state into the shared `stateView` (`Float32Array`).
2. **Field Mapping & Geometric Derivation**: Directly extract known offsets; compute wall-normal thresholds for `bOnWall`, powerslide flags from controls, and speed magnitudes.
3. **Serialization**: High-speed JSON string generation using pre-formatted string builders avoiding heap allocation thrashing.
4. **DataChannel Transmission**: Broadcast over WebRTC data channels configured with `{ ordered: false, maxRetransmits: 0 }` for minimal latency.

---

## 4. Field-by-Field Feasibility & Derivation Analysis

| Field | Source / Origin | Status | Mathematical Derivation & Feasibility Note |
|---|---|---|---|
| `Event` | Static | Feasible | Fixed constant string `"UpdateState"`. |
| `MatchGuid` | Engine Match Session | Feasible | Generated via `crypto.randomUUID()` when a match or training session initiates; persists until reset. |
| `Players[].Name` | Engine State | Feasible | `"Player 1"` (Blue) and `"Player 2"` (Orange) or custom profile name. |
| `Players[].PrimaryId` | Account / Virtual ID | Feasible | Deterministic virtual ID (e.g. `steam:76561198...` or `local:car0`). |
| `Players[].TeamNum` | RocketSim Car Config | Feasible | Team index `0` (Blue) or `1` (Orange). |
| `Players[].bHasCar` | RocketSim Car State | Feasible | `s.currState[on + ye.DEMOED] !== 1 && isSpawned`. |
| `Players[].Speed` | RocketSim Velocity | Feasible | Euclidean norm `Math.hypot(vx, vy, vz)` in uu/s. |
| `Players[].Boost` | RocketSim Boost Tank | Feasible | `s.currState[on + ye.BOOST]` normalized to `0–100`. |
| `Players[].bBoosting` | RocketSim Control / State | Feasible | `s.currState[on + ye.IS_BOOSTING] === 1`. |
| `Players[].bOnGround` | RocketSim Raycast / Contact | Feasible | `s.currState[on + ye.ON_GROUND] === 1 && groundNormal.z > 0.7`. |
| `Players[].bOnWall` | Derived Contact Normal | Feasible | Derived from `s.currState[on + ye.ON_GROUND] === 1` AND wall normal `Math.abs(groundNormal.z) < 0.3` (vertical surface normal). |
| `Players[].bPowersliding`| Control Inputs | Feasible | `controls.handbrake === 1 && bOnGround`. |
| `Players[].bDemolished` | RocketSim Car State | Feasible | `s.currState[on + ye.DEMOED] === 1`. |
| `Players[].Attacker` | Demolition Event Tracker | Feasible | Tracked via collision impulse buffer when a supersonic car impacts another car. Returns attacker PrimaryId or `null`. |
| `Players[].bSupersonic` | RocketSim Car State | Feasible | `s.currState[on + ye.SUPERSONIC] === 1` (speed >= 2200 uu/s). |
| `Game.Teams` | Scoreboard State | Feasible | Array of team objects `{ TeamNum, Score }`. |
| `Game.TimeSeconds` | Match Clock | Feasible | Floating-point match elapsed/remaining time. |
| `Game.bOvertime` | Match Clock State | Feasible | Boolean flag when score is tied at 0 seconds. |
| `Game.Ball` | RocketSim Ball State | Feasible | 3D vectors for `Location`, `Rotation` (Euler angles from matrix), `Velocity`, and `AngularVelocity`. |
| `Game.bHasTarget` | Objective Tracker | Feasible | Boolean flag indicating whether a defensive/offensive target or target goal is currently designated. |
| `Game.Target` | Arena Coordinates | Feasible | Coordinates of the designated goal or ball target `{ TeamNum, Location }`. |

---

## 5. WebRTC DataChannel Technical Constraints & Throughput Analysis

### 5.1 Bandwidth Budget at 120 Hz
- Single uncompressed JSON payload size: ~**1.1 KB** (~1,120 bytes)
- Target tick rate: **120 Hz**
- Raw bandwidth: `1,120 bytes * 120 = 134.4 KB/s` (~**1.08 Mbps**)
- This is well within standard WebRTC SCTP data channel throughput capabilities on local/LAN networks.

### 5.2 SCTP Configuration for Real-Time Telemetry
To achieve true low latency without head-of-line blocking:
```javascript
const telemetryChannel = peerConnection.createDataChannel("telemetry", {
  ordered: false,          // Out-of-order delivery allowed: newer ticks supersede older ones
  maxRetransmits: 0        // Unreliable UDP-like transmission: do NOT retransmit lost ticks
});
```
By setting `ordered: false` and `maxRetransmits: 0`, packet loss will never stall incoming ticks, guaranteeing that the receiver always ingests the **latest available 120Hz frame** with zero queuing latency.

---

## 6. Tauri Desktop Integration Path

1. **Direct WebRTC inside Tauri WebView**:
   Because Tauri's frontend environment is a standards-compliant WebView (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux), the standard Web Audio, WebGL, and **WebRTC (`RTCPeerConnection`) APIs are fully supported natively**.
2. **Local Signaling Server**:
   A lightweight embedded WebSocket or HTTP loopback server (running on `127.0.0.1:8765` within Tauri's Rust core) coordinates the SDP offer/answer handshake with external applications.
3. **Buffer Management & Garbage Collection Guard**:
   At 120 Hz, creating 120 garbage-collected JSON objects per second could trigger GC pauses. A reusable string buffer / serializer minimizes allocations to guarantee sub-millisecond serialization overhead.

---

## 7. Uncertainties, Assumptions & Mitigations

1. **Assumption:** Telemetry consumers run on the same machine or local LAN.  
   *Mitigation:* Local host ICE candidates (`127.0.0.1` / host candidates) connect instantaneously without STUN/TURN traversal.
2. **Uncertainty:** Third-party bot frameworks expecting binary FlatBuffers vs JSON.  
   *Mitigation:* JSON fulfills the explicit specification; an optional binary Protobuf/FlatBuffers toggle can be supported in future revisions if packet size must be reduced below 200 bytes.
3. **Edge Case:** Window blur / background tab throttling.  
   *Mitigation:* In desktop Tauri, background execution throttling is disabled via native window configuration (`app.disable_throttling = true`).
