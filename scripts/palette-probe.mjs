#!/usr/bin/env node
// Spec 0008 — palette probe. Committed so every number in the spec's Source
// verification table can be re-run with `node scripts/palette-probe.mjs`.
//
// The first draft of this table was not reproducible: it said "CIELAB ΔE76 +
// Viénot" without pinning the input space, the white point, or which tritanopia
// matrix, and Viénot 1999 is only validated for protanopia and deuteranopia —
// its tritanopia extrapolation is not. A reviewer running the stated method got
// materially different vision attributions. Every free parameter is therefore
// pinned here, in code, rather than described in prose:
//
//   Input space   linear-light sRGB (IEC 61966-2-1 transfer function undone)
//   White point   D65, 2° observer
//   Distance      CIEDE2000 (ΔE00), kL = kC = kH = 1
//   Simulation    Machado, Oliveira & Fernandes (2009), "A Physiologically-based
//                 Model for Simulation of Color Vision Deficiency", IEEE TVCG
//                 15(6), Table 1 — severity 1.0 matrices, applied to linear RGB.
//                 Chosen over Viénot 1999 because all three deficiencies come
//                 from one derivation, so tritanopia is not an extrapolation,
//                 and because the matrices are published constants with no
//                 free parameters to disagree about.
//
// ΔE00 rather than ΔE76: ΔE76 materially overstates differences in the blue
// region, and two of the three ramps here are blue.

// Everything below the plumbing section is EXPORTED, and the report at the end
// runs only when this file is executed directly. R9 part 2 requires the probe
// and the gate to be one implementation; that only holds if the test can import
// these functions instead of re-deriving them, so the split is here from the
// start rather than left to whoever writes the test.

// ---------- colour plumbing ----------
export const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
export const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

// Machado et al. 2009, Table 1, severity 1.0. Operate on linear RGB.
export const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

export const linOf = (hexColor, vision) => {
  const lin = hex(hexColor).map(toLinear);
  return vision === 'normal' ? lin : mul(CVD[vision], lin).map((c) => Math.max(0, Math.min(1, c)));
};

// linear sRGB -> CIELAB (D65)
export const labOf = (lin) => {
  const [r, g, b] = lin;
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.00000;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

// CIEDE2000. Sharma, Wu & Dalal (2005) formulation.
export function deltaE00(lab1, lab2) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, ap) => { if (b === 0 && ap === 0) return 0; const h = Math.atan2(b, ap) * deg; return h < 0 ? h + 360 : h; };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dLp = L2 - L1, dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (Cp1 + Cp2) / 2;
  let hbp;
  if (Cp1 * Cp2 === 0) hbp = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hbp = (hp1 + hp2) / 2;
  else hbp = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export const dE = (c1, c2, vision) => deltaE00(labOf(linOf(c1, vision)), labOf(linOf(c2, vision)));

// WCAG 2.x relative luminance and contrast — unaffected by the CVD choice.
export const relLum = (hexColor) => { const [r, g, b] = hex(hexColor).map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const l1 = relLum(a), l2 = relLum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
export const over = (fg, alpha, bg) => '#' + hex(fg).map((c, i) => Math.round(c * alpha + hex(bg)[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');

// ---------- the app's palette (mirrors src/utils/laborMetrics.js) ----------
export const TIERS = { OFFICIAL: '#2f9e44', DERIVED: '#1971c2', PROXY: '#e8590c', MODELED: '#9c36b5' };
export const RAMPS = {
  BLUE: ['#eaf2fb', '#c3dcf3', '#8fc0e6', '#5a9ed6', '#2f7ec1', '#1a5490'],
  HEAT: ['#fdf3e3', '#fbdcae', '#f7bd6f', '#ef9440', '#dd6a21', '#b23c0e'],
  TEAL: ['#e6f4f1', '#bde3dc', '#8bcdc2', '#55b3a4', '#2d9384', '#136b5f'],
};
export const NO_DATA = '#dfe3e8';
export const VISIONS = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];
const f1 = (n) => n.toFixed(1).padStart(5);

// The report runs only when this file is executed directly, so R9 part 2 can
// `import` the functions and tables above without printing anything.
if (import.meta.main) {
  console.log('Spec 0008 palette probe — Machado 2009 severity 1.0 on linear sRGB, CIEDE2000, D65.\n');

  console.log('== 1. Tier badge contrast: colour on `${color}1a` over white (WCAG 2.x) ==');
  for (const [k, c] of Object.entries(TIERS)) {
    const r = contrast(c, over(c, 0x1a / 255, '#ffffff'));
    console.log(`   ${k.padEnd(9)} ${r.toFixed(2)}:1   AA-normal(4.5) ${r >= 4.5 ? 'PASS' : 'FAIL'}   AA-large(3.0) ${r >= 3 ? 'PASS' : 'FAIL'}`);
  }

  console.log('\n== 2. Text greys on white (WCAG 2.x) ==');
  for (const [n, c] of [['gray-300', '#d1d5db'], ['gray-400', '#9ca3af'], ['gray-500', '#6b7280'], ['gray-600', '#4b5563']]) {
    const r = contrast(c, '#ffffff');
    console.log(`   ${n.padEnd(9)} ${c} ${r.toFixed(2)}:1  AA-normal ${r >= 4.5 ? 'PASS' : 'FAIL'}`);
  }

  console.log('\n== 3. Ramps: minimum adjacent-step ΔE00, per vision ==');
  console.log(`   ${'ramp'.padEnd(6)}${VISIONS.map((v) => v.slice(0, 7).padStart(8)).join('')}`);
  for (const [name, ramp] of Object.entries(RAMPS)) {
    const row = VISIONS.map((v) => f1(Math.min(...ramp.slice(1).map((c, i) => dE(ramp[i], c, v)))).padStart(8));
    console.log(`   ${name.padEnd(6)}${row.join('')}`);
  }

  console.log('\n== 4. Lightest ramp step vs NO-DATA grey #dfe3e8 (ΔE00) ==');
  console.log('   A country with a low MEASURED value vs a country with NO data.');
  console.log(`   ${'ramp'.padEnd(6)}${VISIONS.map((v) => v.slice(0, 7).padStart(8)).join('')}   WCAG contrast`);
  for (const [name, ramp] of Object.entries(RAMPS)) {
    const row = VISIONS.map((v) => f1(dE(ramp[0], NO_DATA, v)).padStart(8));
    console.log(`   ${name.padEnd(6)}${row.join('')}      ${contrast(ramp[0], NO_DATA).toFixed(2)}:1`);
  }

  console.log('\n== 5. Tier colours pairwise, per vision (ΔE00) ==');
  const pairs = [['OFFICIAL', 'DERIVED'], ['OFFICIAL', 'PROXY'], ['OFFICIAL', 'MODELED'], ['DERIVED', 'PROXY'], ['DERIVED', 'MODELED'], ['PROXY', 'MODELED']];
  console.log(`   ${'pair'.padEnd(22)}${VISIONS.map((v) => v.slice(0, 7).padStart(8)).join('')}`);
  for (const [a, b] of pairs) {
    const row = VISIONS.map((v) => f1(dE(TIERS[a], TIERS[b], v)).padStart(8));
    console.log(`   ${(a + '/' + b).padEnd(22)}${row.join('')}`);
  }

  console.log('\n== 6. Minimums that decide R5 and R10 ==');
  for (const [name, ramp] of Object.entries(RAMPS)) {
    const worstAdj = Math.min(...VISIONS.map((v) => Math.min(...ramp.slice(1).map((c, i) => dE(ramp[i], c, v)))));
    const worstND = Math.min(...VISIONS.map((v) => dE(ramp[0], NO_DATA, v)));
    console.log(`   ${name.padEnd(6)} worst adjacent ΔE00 ${f1(worstAdj)}   worst vs no-data ΔE00 ${f1(worstND)}`);
  }
  const worstTier = pairs.map(([a, b]) => ({ p: `${a}/${b}`, d: Math.min(...VISIONS.map((v) => dE(TIERS[a], TIERS[b], v))) })).sort((x, y) => x.d - y.d)[0];
  console.log(`   closest tier pair across all visions: ${worstTier.p} at ΔE00 ${worstTier.d.toFixed(1)}`);

  console.log('\n== 7. Ramp lightness (L*) is strictly monotonic under every vision ==');
  console.log('   A sequential ramp is read as an ordered scale against a legend, not by');
  console.log('   discriminating adjacent steps. What must survive CVD is the ORDER.');
  for (const [name, ramp] of Object.entries(RAMPS)) {
    for (const v of VISIONS) {
      const Ls = ramp.map((c) => labOf(linOf(c, v))[0]);
      const mono = Ls.every((L, i) => i === 0 || L < Ls[i - 1]);
      const minGap = Math.min(...Ls.slice(1).map((L, i) => Ls[i] - L));
      console.log(`   ${name.padEnd(5)} ${v.padEnd(13)} ${mono ? 'monotonic  ' : 'NOT MONOTONIC'} min L* gap ${minGap.toFixed(1).padStart(5)}  L*: ${Ls.map((L) => L.toFixed(0).padStart(3)).join(' ')}`);
    }
  }
}
