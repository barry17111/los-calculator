// LOS Calculator (Signalized) — simplified, educational estimates.
// No dependencies. Safe to run as a static site.

const $ = (id) => document.getElementById(id);

const state = {
  laneGroups: [],
};

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function fmt(x, digits=2){
  if (!isFinite(x)) return "—";
  return Number(x).toFixed(digits);
}

function losFromDelay(d){
  if (!isFinite(d)) return "—";
  if (d <= 10) return "A";
  if (d <= 20) return "B";
  if (d <= 35) return "C";
  if (d <= 55) return "D";
  if (d <= 80) return "E";
  return "F";
}
function losPill(letter){
  const cls = (letter || "").toLowerCase();
  return `<span class="pill ${cls}">${letter}</span>`;
}

// --- Adjustment factors (simple, transparent) ---
function laneWidthFactor(widthFt){
  // Very simplified: narrower lanes reduce saturation flow modestly
  if (widthFt >= 12) return 1.00;
  if (widthFt >= 11) return 0.95;
  return 0.90; // 10 ft
}

function heavyVehicleFactor(hvPct, ET){
  // Simple heavy vehicle adjustment:
  // f_hv = 1 / (1 + P_T*(E_T - 1))
  const PT = clamp(hvPct/100, 0, 0.9);
  const E = Math.max(1.0, ET);
  return 1 / (1 + PT*(E - 1));
}

function arrivalTypeFactor(arrivalType){
  // Simplified multiplier on delay (educational, not an HCM implementation)
  const map = {
    1: 1.30,
    2: 1.15,
    3: 1.00,
    4: 0.90,
    5: 0.80,
    6: 0.70,
  };
  return map[arrivalType] ?? 1.00;
}

// --- Core computations ---
function computeLaneGroup(lg, intersection){
  const C = intersection.C;
  const T = intersection.T;
  const k = intersection.k;

  // Inputs
  const v = Math.max(0, lg.v);
  const N = Math.max(1, lg.lanes);
  const g = Math.max(1e-6, lg.g);
  const phf = clamp(lg.phf, 0.50, 1.00);
  const mult = Math.max(0.0, lg.mult ?? 1.0);

  const s0 = Math.max(500, lg.s0); // per lane, veh/hr/ln
  const hvPct = clamp(lg.hvPct ?? 0, 0, 50);
  const ET = Math.max(1.0, lg.ET ?? 2.0);
  const laneWidth = Number(lg.laneWidth ?? 12);
  const L = Math.max(0, lg.L ?? 0);
  const at = Number(lg.arrivalType ?? 3);

  // Adjust demand to peak
  const vAdj = (v * mult) / phf;

  // Effective green (simple): treat entered g as effective green, but allow optional loss subtraction
  const gEff = Math.max(1e-6, g - L);
  const gC = clamp(gEff / C, 1e-6, 0.999999);

  // Saturation flow effective
  const fw = laneWidthFactor(laneWidth);
  const fhv = heavyVehicleFactor(hvPct, ET);

  const sEffTotal = s0 * N * fw * fhv; // veh/hr (lane-group total)
  const cap = sEffTotal * gC;          // veh/hr

  const X = cap > 0 ? (vAdj / cap) : Infinity;

  // Uniform delay (Webster-style)
  // d1 = 0.5*C*(1-g/C)^2 / (1 - min(1,X)*g/C)
  const denom = 1 - Math.min(1, X) * gC;
  const d1 = denom > 1e-6 ? (0.5 * C * (1 - gC) * (1 - gC) / denom) : Infinity;

  // Overflow / incremental delay (simplified HCM-inspired form)
  // d2 = 900*T * [ (X-1) + sqrt( (X-1)^2 + (16*k*X)/(cap*T) ) ]
  // with T in hours, cap in veh/hr
  let d2 = 0;
  if (isFinite(X) && cap > 1e-6){
    const term = (16 * k * X) / (cap * Math.max(1e-6, T));
    const inside = (X - 1) * (X - 1) + term;
    d2 = 900 * T * ((X - 1) + Math.sqrt(Math.max(0, inside)));
    d2 = Math.max(0, d2);
  } else {
    d2 = Infinity;
  }

  // Arrival type multiplier
  const fAT = arrivalTypeFactor(at);
  const delay = (d1 + d2) * fAT;

  const los = losFromDelay(delay);

  return {
    vAdj,
    gEff,
    sEffTotal,
    cap,
    X,
    d1,
    d2,
    delay,
    los,
    fAT,
    fw,
    fhv,
  };
}

function readIntersection(){
  const C = Number($("C").value);
  const T = Number($("T").value);
  const k = Number($("k").value);
  return {
    C: clamp(C, 30, 300),
    T: clamp(T, 0.25, 4),
    k: clamp(k, 0, 1.5),
  };
}

function readLaneGroupFromForm(){
  const intersectionDefaults = {
    s0: Number($("s0_default").value),
    phf: Number($("phf_default").value),
    L: Number($("L_default").value),
  };

  const label = $("label").value.trim() || `Lane Group ${state.laneGroups.length + 1}`;
  const v = Number($("v").value);
  const lanes = Number($("lanes").value);
  const g = Number($("g").value);

  // Advanced per-lane-group (optional)
  const phf = Number($("phf").value || intersectionDefaults.phf);
  const s0  = Number($("s0").value  || intersectionDefaults.s0);
  const hvPct = Number($("hvPct").value || 0);
  const ET = Number($("ET").value || 2.0);
  const laneWidth = Number($("laneWidth").value || 12);
  const L = Number($("L").value || intersectionDefaults.L);
  const arrivalType = Number($("arrivalType").value || 3);
  const mult = Number($("mult").value || 1.0);

  return {
    id: crypto.randomUUID(),
    label,
    v: isFinite(v) ? v : 0,
    lanes: isFinite(lanes) ? lanes : 1,
    g: isFinite(g) ? g : 1,
    phf: isFinite(phf) ? phf : 1,
    s0: isFinite(s0) ? s0 : 1900,
    hvPct: isFinite(hvPct) ? hvPct : 0,
    ET: isFinite(ET) ? ET : 2.0,
    laneWidth: isFinite(laneWidth) ? laneWidth : 12,
    L: isFinite(L) ? L : 0,
    arrivalType: isFinite(arrivalType) ? arrivalType : 3,
    mult: isFinite(mult) ? mult : 1.0,
  };
}

function clearLaneGroupForm(){
  $("label").value = "";
  $("v").value = 450;
  $("lanes").value = 1;
  $("g").value = 30;

  // Advanced
  $("phf").value = $("phf_default").value;
  $("s0").value  = $("s0_default").value;
  $("hvPct").value = 0;
  $("ET").value = 2.0;
  $("laneWidth").value = 12;
  $("L").value = $("L_default").value;
  $("arrivalType").value = 3;
  $("mult").value = 1.00;
}

function recomputeAndRender(){
  const intersection = readIntersection();

  // Recompute all lane groups
  const rows = state.laneGroups.map(lg => {
    const r = computeLaneGroup(lg, intersection);
    return { lg, r };
  });

  // Render table
  const tbody = $("laneTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const {lg, r} of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(lg.label)}</td>
      <td>${fmt(lg.v,0)}</td>
      <td>${fmt(lg.g,1)}</td>
      <td>${fmt(r.sEffTotal,0)}</td>
      <td>${fmt(r.cap,0)}</td>
      <td>${isFinite(r.X) ? fmt(r.X,2) : "∞"}</td>
      <td>${isFinite(r.delay) ? fmt(r.delay,1) : "—"}</td>
      <td>${r.los !== "—" ? losPill(r.los) : "—"}</td>
      <td><button class="btn danger" data-del="${lg.id}">Remove</button></td>
    `;
    tbody.appendChild(tr);
  }

  // Intersection weighted average delay
  let vSum = 0;
  let vdSum = 0;
  for (const {lg, r} of rows){
    const vUse = Math.max(0, lg.v); // weight by entered volume
    if (isFinite(r.delay)){
      vSum += vUse;
      vdSum += vUse * r.delay;
    }
  }
  const dInt = vSum > 0 ? (vdSum / vSum) : NaN;
  $("dInt").textContent = isFinite(dInt) ? `${fmt(dInt,1)} s/veh` : "—";
  const losInt = isFinite(dInt) ? losFromDelay(dInt) : "—";
  $("losInt").innerHTML = losInt !== "—" ? losPill(losInt) : "—";
  $("vTot").textContent = vSum > 0 ? `${fmt(vSum,0)} veh/hr` : "—";

  // Attach remove handlers
  tbody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      state.laneGroups = state.laneGroups.filter(x => x.id !== id);
      recomputeAndRender();
    });
  });
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function exportCsv(){
  const intersection = readIntersection();
  const header = [
    "Label","v_vehhr","lanes","g_sec","C_sec",
    "phf","mult","s0_vehhrln","hvPct","ET","laneWidth_ft","L_sec","arrivalType",
    "sEffTotal_vehhr","cap_vehhr","vc","delay_sveh","LOS"
  ];

  const lines = [header.join(",")];

  for (const lg of state.laneGroups){
    const r = computeLaneGroup(lg, intersection);
    const row = [
      csvCell(lg.label),
      lg.v, lg.lanes, lg.g, intersection.C,
      lg.phf, lg.mult, lg.s0, lg.hvPct, lg.ET, lg.laneWidth, lg.L, lg.arrivalType,
      Math.round(r.sEffTotal),
      Math.round(r.cap),
      isFinite(r.X) ? r.X : "",
      isFinite(r.delay) ? r.delay : "",
      r.los
    ];
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "los_lane_groups.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(x){
  const s = String(x ?? "");
  if (/[",\n]/.test(s)){
    return '"' + s.replaceAll('"','""') + '"';
  }
  return s;
}

// --- UI wiring ---
$("addLaneGroup").addEventListener("click", () => {
  const lg = readLaneGroupFromForm();
  state.laneGroups.push(lg);
  recomputeAndRender();
});

$("clearForm").addEventListener("click", () => {
  clearLaneGroupForm();
});

$("clearAll").addEventListener("click", () => {
  state.laneGroups = [];
  recomputeAndRender();
});

$("exportCsv").addEventListener("click", exportCsv);

$("addExample").addEventListener("click", () => {
  // Fill an example lane group quickly
  $("label").value = "EB Thru";
  $("v").value = 620;
  $("lanes").value = 2;
  $("g").value = 40;
  $("phf").value = 0.92;
  $("hvPct").value = 4;
  $("ET").value = 2.0;
  $("laneWidth").value = 12;
  $("L").value = 2;
  $("arrivalType").value = 4;
  $("mult").value = 1.00;
});

["C","T","k","s0_default","phf_default","L_default"].forEach(id => {
  $(id).addEventListener("input", () => {
    // Keep per-lane-group defaults in sync only if user hasn't changed them
    // (Simple approach: do nothing; user can hit Clear to re-apply defaults)
    recomputeAndRender();
  });
});

["v","lanes","g","phf","s0","hvPct","ET","laneWidth","L","arrivalType","mult","label"].forEach(id => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("addLaneGroup").click();
  });
});

// Initialize
clearLaneGroupForm();
recomputeAndRender();
