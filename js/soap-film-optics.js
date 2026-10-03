// Spectral integration is performed before gamut mapping or display encoding.
export const opticalParameters = { nAir: 1, nFilm: 1.333, minNm: 360, maxNm: 830, stepNm: 1 };
export function reflectance(h, wavelength, angleDegrees = 0) {
  const n = opticalParameters.nFilm, a = angleDegrees * Math.PI / 180;
  const c0 = Math.cos(a), c1 = Math.sqrt(1 - (Math.sin(a) / n) ** 2);
  const rs = (c0 - n * c1) / (c0 + n * c1);
  const rp = (n * c0 - c1) / (n * c0 + c1);
  const phase = 4 * Math.PI * n * h * c1 / wavelength;
  const layer = r => { const q = r * r; return 2 * q * (1 - Math.cos(phase)) / (1 + q * q - 2 * q * Math.cos(phase)); };
  return (layer(rs) + layer(rp)) * .5;
}
export function parseSpectra(observerText, illuminantText) {
  const rows = t => t.trim().split(/\r?\n/).map(l => l.split(',').map(Number));
  const d65 = new Map(rows(illuminantText).map(r => [r[0], r[1]]));
  const spectrum = rows(observerText).filter(r => r[0] >= 360 && r[0] <= 830).map(r => [r[0], ...r.slice(1).map(v => v * d65.get(r[0]))]);
  const normalizer = spectrum.reduce((s, r) => s + r[2], 0);
  return spectrum.map(r => [r[0], r[1] / normalizer, r[2] / normalizer, r[3] / normalizer]);
}
export function integrate(h, angle, spectrum) {
  const xyz = [0, 0, 0];
  for (const r of spectrum) { const R = reflectance(h, r[0], angle); for (let k = 0; k < 3; k++) xyz[k] += R * r[k + 1]; }
  const [x, y, z] = xyz;
  return { xyz, rgb: [3.2404542*x-1.5371385*y-.4985314*z, -.969266*x+1.8760108*y+.041556*z, .0556434*x-.2040259*y+1.0572252*z] };
}
// Desaturate only out-of-gamut negative channels toward luminance.
export function gamutMap(rgb) {
  const y = Math.max(0, .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]);
  const lo = Math.min(...rgb), t = lo < 0 ? y / (y - lo) : 1;
  return rgb.map(c => Math.max(0, y + (c - y) * t));
}
export const encode = c => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;
export const toneMap = c => 1 - Math.exp(-Math.max(0, c));
