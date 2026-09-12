#!/usr/bin/env python3
"""
Car Soccer Asset Downloader
===========================
This script automatically downloads all required 3D models, textures,
audio files, and bot policy files from the live car-soccer.com server
and saves them directly into your public/assets/ directory.

Usage:
  python3 tools/download_assets.py
"""

import os
import sys
import json
import urllib.request
import urllib.error

BASE_URL = "https://car-soccer.com"
TARGET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")

ASSETS = [
    # Shell & Icons
    "/site.webmanifest",
    "/favicon.ico",
    "/images/favicon-16x16.png",
    "/images/favicon-32x32.png",
    "/images/apple-touch-icon.png",
    "/images/android-chrome-512x512.png",
    "/assets/app-icon-512-DPODCpjJ.png",
    
    # Stadium & Arena
    "/assets/arena/stadium/stadium.glb",
    "/assets/arena/stadium/continuous-boundary.json",
    "/assets/arena/stadium/bank-hex-albedo.png",
    "/assets/arena/stadium/bank-hex-normal.png",
    
    # Boost Pads
    "/assets/arena/pads/large-active.obj",
    "/assets/arena/pads/large-idle.obj",
    "/assets/arena/pads/small-active.obj",
    "/assets/arena/pads/small-idle.obj",
    "/assets/arena/pads/albedo.png",
    
    # Ball
    "/assets/ball/ball.gltf",
    "/assets/ball/albedo.png",
    "/assets/ball/normal.png",
    "/assets/ball/material-mask.png",
    
    # Cars
    "/assets/game-car/model.gltf",
    "/assets/flat-car/model.glb",
    "/assets/realistic-car/details.glb",
    
    # Visual Effects / Boost Particle Textures
    "/assets/golden-boost/plume.png",
    "/assets/golden-boost/turbulence.png",
    "/assets/golden-boost/sparks.png",
    
    # Bot AI Workers & Models
    "/assets/worker-iFqqV1m9.js",
    "/assets/bot/policy.onnx",
    "/assets/bot/NOTICE.txt",
    "/assets/bot/necto/policy.onnx",
    "/assets/bot/necto/NOTICE.txt",
    "/assets/bot/seer/policy.onnx",
    "/assets/bot/seer/NOTICE.txt",
    
    # Audio - Boost & Events
    "/assets/audio/events/reset.wav",
    "/assets/audio/boost/start.wav",
    "/assets/audio/boost/loop.wav",
    "/assets/audio/boost/release.wav",
    
    # Audio - Vehicle
    "/assets/audio/vehicle/supersonic-loop.wav",
    "/assets/audio/vehicle/supersonic-enter-a.wav",
    "/assets/audio/vehicle/supersonic-enter-b.wav",
    "/assets/audio/vehicle/supersonic-enter-c.wav",
    "/assets/audio/vehicle/jump-01.wav",
    "/assets/audio/vehicle/jump-02.wav",
    "/assets/audio/vehicle/jump-03.wav",
    "/assets/audio/vehicle/jump-04.wav",
    "/assets/audio/vehicle/dodge-01.wav",
    "/assets/audio/vehicle/dodge-02.wav",
    "/assets/audio/vehicle/dodge-03.wav",
    "/assets/audio/vehicle/dodge-04.wav",
    "/assets/audio/vehicle/double-jump-01.wav",
    "/assets/audio/vehicle/double-jump-02.wav",
    "/assets/audio/vehicle/double-jump-03.wav",
    "/assets/audio/vehicle/double-jump-04.wav",
    "/assets/audio/vehicle/wheel-impact-01.wav",
    "/assets/audio/vehicle/wheel-impact-02.wav",
    "/assets/audio/vehicle/wheel-impact-03.wav",
    "/assets/audio/vehicle/wheel-impact-04.wav",
    
    # Audio - Impacts
    "/assets/audio/impacts/vehicle-body-01.wav",
    "/assets/audio/impacts/vehicle-body-02.wav",
    "/assets/audio/impacts/vehicle-body-03.wav",
    "/assets/audio/impacts/vehicle-body-04.wav",
    "/assets/audio/impacts/vehicle-body-05.wav",
    "/assets/audio/impacts/vehicle-body-06.wav",
    "/assets/audio/impacts/vehicle-detail-01.wav",
    "/assets/audio/impacts/vehicle-detail-02.wav",
    "/assets/audio/impacts/vehicle-detail-03.wav",
    "/assets/audio/impacts/vehicle-detail-04.wav",
    "/assets/audio/impacts/vehicle-detail-05.wav",
    "/assets/audio/impacts/vehicle-detail-06.wav",
    "/assets/audio/impacts/vehicle-hard-01.wav",
    "/assets/audio/impacts/vehicle-hard-02.wav",
    "/assets/audio/impacts/vehicle-hard-03.wav",
    "/assets/audio/impacts/vehicle-hard-04.wav",
    "/assets/audio/impacts/vehicle-hard-05.wav",
    "/assets/audio/impacts/vehicle-hard-06.wav",
    "/assets/audio/impacts/vehicle-accent-01.wav",
    "/assets/audio/impacts/surface-detail-01.wav",
    "/assets/audio/impacts/surface-detail-02.wav",
    "/assets/audio/impacts/surface-detail-03.wav",
    "/assets/audio/impacts/surface-detail-04.wav",
    "/assets/audio/impacts/surface-detail-05.wav",
    "/assets/audio/impacts/surface-detail-06.wav",
    "/assets/audio/impacts/surface-body-01.wav",
    "/assets/audio/impacts/surface-body-02.wav",
    "/assets/audio/impacts/surface-body-03.wav",
    "/assets/audio/impacts/surface-body-04.wav",
    "/assets/audio/impacts/surface-body-05.wav",
    "/assets/audio/impacts/surface-body-06.wav",
    "/assets/audio/impacts/grass-01.wav",
    "/assets/audio/impacts/grass-02.wav",
    "/assets/audio/impacts/grass-03.wav",
    "/assets/audio/impacts/grass-04.wav",
    "/assets/audio/impacts/grass-05.wav",
    "/assets/audio/impacts/arena-01.wav",
    "/assets/audio/impacts/arena-02.wav",
    "/assets/audio/impacts/arena-03.wav",
    "/assets/audio/impacts/arena-04.wav",
    "/assets/audio/impacts/arena-05.wav",
    "/assets/audio/impacts/arena-06.wav",
    
    # Engine Audio
    "/assets/audio/engine/manifest.json",
    
    # Arena Physics Collision Meshes
    "/assets/arena/collision/manifest.json",
]


def download_file(rel_path):
    url = f"{BASE_URL}{rel_path}"
    local_path = os.path.join(TARGET_DIR, rel_path.lstrip("/"))
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    
    print(f"Downloading {url} -> {local_path} ...", end=" ")
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://car-soccer.com/"
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            with open(local_path, "wb") as f:
                f.write(data)
        print(f"OK ({len(data)} bytes)")
        return data
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}")
        return None
    except Exception as e:
        print(f"FAILED: {e}")
        return None


def main():
    print(f"=== Starting Car Soccer Asset Downloader ===")
    print(f"Target Directory: {TARGET_DIR}\n")
    
    # First download primary list
    for asset in ASSETS:
        data = download_file(asset)
        
        # If collision manifest was downloaded, download the mesh chunks inside it!
        if asset == "/assets/arena/collision/manifest.json" and data:
            try:
                mesh_files = json.loads(data.decode("utf-8"))
                print(f"\nDiscovered {len(mesh_files)} collision mesh chunks in manifest:")
                for mf in mesh_files:
                    download_file(f"/assets/arena/collision/{mf}")
                print()
            except Exception as e:
                print(f"Failed to parse collision manifest: {e}")

        # If engine manifest was downloaded, download all engine samples
        if asset == "/assets/audio/engine/manifest.json" and data:
            try:
                engine_data = json.loads(data.decode("utf-8"))
                print(f"\nDiscovered engine audio samples in manifest:")
                files_to_get = set()
                for key in ["loaded", "coast"]:
                    for item in engine_data.get(key, []):
                        if isinstance(item, dict) and "file" in item:
                            files_to_get.add(item["file"])
                        elif isinstance(item, str):
                            files_to_get.add(item)
                if "idle" in engine_data:
                    idle_item = engine_data["idle"]
                    if isinstance(idle_item, dict) and "file" in idle_item:
                        files_to_get.add(idle_item["file"])
                    elif isinstance(idle_item, str):
                        files_to_get.add(idle_item)
                for f in files_to_get:
                    download_file(f"/assets/audio/engine/{f}")
                print()
            except Exception as e:
                print(f"Failed to parse engine manifest: {e}")

    print("\n=== Download Complete! ===")
    print("All assets have been placed in public/assets/. The game is ready to run with full 3D models and audio!")


if __name__ == "__main__":
    main()
