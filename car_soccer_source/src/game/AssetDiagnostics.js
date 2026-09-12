/**
 * AssetDiagnostics.js
 * Comprehensive validation and actionable error diagnostics for Car Soccer assets.
 * 
 * Provides:
 * 1. Pre-flight health checks for all required assets (3D models, collision meshes, audio, textures, bot models).
 * 2. Response validation to catch Vite SPA HTML fallbacks before they corrupt decoders or typed arrays.
 * 3. Rich, actionable diagnostic reporting so developers and users immediately know what's missing and how to fix it.
 */

export const ASSET_INVENTORY = [
  // 1. RocketSim Physics Arena Collision Meshes
  { path: "/assets/arena/collision/manifest.json", desc: "RocketSim collision manifest", category: "Physics", critical: true },
  { path: "/assets/arena/collision/mesh_0.cmf", desc: "RocketSim stadium collision mesh chunk 0", category: "Physics", critical: true },
  
  // 2. 3D Models & Geometry
  { path: "/assets/arena/stadium/stadium.glb", desc: "Stadium 3D architecture model", category: "3D Models", critical: true },
  { path: "/assets/ball/ball.gltf", desc: "Ball 3D model & materials", category: "3D Models", critical: true },
  { path: "/assets/game-car/model.gltf", desc: "Octane car 3D model", category: "3D Models", critical: true },
  { path: "/assets/flat-car/model.glb", desc: "Dominus/Flat car 3D model", category: "3D Models", critical: false },
  { path: "/assets/realistic-car/details.glb", desc: "Realistic car body details", category: "3D Models", critical: false },

  // 3. Visual Effects Textures
  { path: "/assets/golden-boost/plume.png", desc: "Boost plume particle texture", category: "Visual Effects", critical: false },
  { path: "/assets/golden-boost/turbulence.png", desc: "Boost turbulence particle texture", category: "Visual Effects", critical: false },
  { path: "/assets/golden-boost/sparks.png", desc: "Boost sparks particle texture", category: "Visual Effects", critical: false },
  
  // 4. Vehicle & Boost Audio
  { path: "/assets/audio/boost/start.wav", desc: "Boost ignition sound", category: "Audio", critical: false },
  { path: "/assets/audio/boost/loop.wav", desc: "Boost loop sound", category: "Audio", critical: false },
  { path: "/assets/audio/vehicle/supersonic-loop.wav", desc: "Supersonic loop audio", category: "Audio", critical: false },
  { path: "/assets/audio/vehicle/supersonic-enter-a.wav", desc: "Supersonic enter audio variant A", category: "Audio", critical: false },
  { path: "/assets/audio/events/reset.wav", desc: "Flip reset event sound", category: "Audio", critical: false },
  { path: "/assets/audio/engine/manifest.json", desc: "Dynamic car engine audio bank manifest", category: "Audio", critical: false },

  // 5. Bot AI System
  { path: "/assets/worker-iFqqV1m9.js", desc: "Bot ONNX WebWorker script", category: "Bot AI", critical: false },
  { path: "/assets/bot/policy.onnx", desc: "Default bot ONNX neural network policy", category: "Bot AI", critical: false }
];

/**
 * Validates a Fetch Response to ensure it didn't return an HTML fallback or HTTP error.
 */
export function validateAssetResponse(res, url, expectedType = "binary") {
  const contentType = res.headers.get("content-type") || "";
  const isHtml = contentType.toLowerCase().includes("text/html");
  const isMissingHeader = Boolean(res.headers.get("x-asset-missing"));

  if (!res.ok || isHtml || isMissingHeader) {
    let reason = `HTTP ${res.status} ${res.statusText || ""}`.trim();
    if (isHtml) {
      reason += " (Server returned text/html SPA fallback — file does not exist on disk)";
    }
    const error = new Error(`[Asset Missing] Failed to load "${url}": ${reason}`);
    error.assetUrl = url;
    error.status = res.status;
    error.isAssetError = true;
    error.isHtmlFallback = isHtml;
    return { ok: false, error, reason };
  }

  return { ok: true, error: null };
}

/**
 * Pre-flight probe of all key assets to detect missing files before the engine crashes.
 * @returns {Promise<{ missingCritical: Array, missingNonCritical: Array, totalChecked: number }>}
 */
export async function auditRequiredAssets() {
  const missingCritical = [];
  const missingNonCritical = [];

  await Promise.all(ASSET_INVENTORY.map(async (item) => {
    try {
      const res = await fetch(item.path, { 
        method: "GET", 
        headers: { "Range": "bytes=0-15" },
        cache: "no-store" 
      });
      const check = validateAssetResponse(res, item.path);
      if (!check.ok) {
        const entry = { ...item, reason: check.reason };
        if (item.critical) {
          missingCritical.push(entry);
        } else {
          missingNonCritical.push(entry);
        }
      }
    } catch (err) {
      const entry = { ...item, reason: err.message || "Network / Fetch error" };
      if (item.critical) {
        missingCritical.push(entry);
      } else {
        missingNonCritical.push(entry);
      }
    }
  }));

  return {
    missingCritical,
    missingNonCritical,
    totalChecked: ASSET_INVENTORY.length
  };
}

/**
 * Generates an actionable, styled HTML error message for missing assets.
 */
export function formatMissingAssetsHtml(missingList) {
  const grouped = {};
  for (const item of missingList) {
    const cat = item.category || "General";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  let html = `
  <div style="text-align:left;line-height:1.6;font-size:13px;max-width:620px;background:rgba(10,20,36,0.95);padding:18px;border-radius:10px;border:1px solid #3b82f6;box-shadow:0 12px 32px rgba(0,0,0,0.8);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:22px;">⚠️</span>
      <h3 style="color:#ef4444;font-weight:700;margin:0;font-size:16px;">缺少运行必需的游戏资产 (Missing Required Assets)</h3>
    </div>
    <p style="margin:0 0 10px 0;color:#e2e8f0;font-size:13px;">
      检测到本地开发环境的 <code>public/assets/</code> 缺少以下关键文件，请运行下载工具补全：
    </p>
  `;

  for (const [cat, items] of Object.entries(grouped)) {
    html += `
      <div style="margin-bottom:10px;">
        <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#1e293b;color:#38bdf8;margin-bottom:4px;">${cat}</span>
        <ul style="margin:4px 0 6px 20px;padding:0;color:#cbd5e1;font-size:12px;">
    `;
    for (const it of items) {
      html += `<li style="margin-bottom:3px;"><strong style="color:#f8fafc;">${it.desc}</strong>: <code style="color:#93c5fd;">${it.path}</code></li>`;
    }
    html += `</ul></div>`;
  }

  html += `
    <div style="margin-top:14px;padding:10px 12px;background:rgba(15,23,42,0.8);border-left:4px solid #0284c7;border-radius:4px;">
      <p style="margin:0 0 6px 0;color:#f1f5f9;font-weight:600;font-size:12px;">🛠️ 一键解决方式 (One-Command Fix):</p>
      <p style="margin:0 0 6px 0;color:#94a3b8;font-size:12px;">在终端中运行以下命令即可自动并行下载所有缺失素材（支持跳过已存在文件）：</p>
      <pre style="background:#090d16;color:#38bdf8;padding:8px 10px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;margin:4px 0;border:1px solid #1e293b;user-select:all;cursor:pointer;">python3 tools/parallel.py</pre>
      <p style="margin:6px 0 0 0;color:#64748b;font-size:11px;">下载完成后刷新浏览器页面即可正常运行 Free Play 与 Match 模式。</p>
    </div>
  </div>
  `;

  return html;
}
