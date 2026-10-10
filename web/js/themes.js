// Ready-made color themes. Each theme sets the app's CSS color variables.
// "hl" is the gold highlight that links Romanian and Hebrew words; "hlLine" is its underline.

export const THEMES = [
  { id: "stone", name: "Stone", dark: false, about: "Cool paper, blue-black ink, gold links",
    c: { paper: "#F0F1EB", paper2: "#E6E8E0", surface: "#F8F8F4", ink: "#1D2733", inkSoft: "#56606C", inkFaint: "#8A929B", rule: "#D3D6CC",
      accent: "#2C5AA0", hl: "#D6A43A", hlLine: "#B8862A", teal: "#1F7268", plum: "#874677", rubric: "#A33B2A", green: "#3E7C4B", amber: "#A9631F", red: "#B03A30" } },
  { id: "voronet", name: "Voroneț Blue", dark: false, about: "The blue of the painted monasteries, with ochre",
    c: { paper: "#EEF2F7", paper2: "#E1E8F1", surface: "#F7F9FC", ink: "#14213D", inkSoft: "#4A5A75", inkFaint: "#8391A8", rule: "#CBD5E3",
      accent: "#1F5FA8", hl: "#E0A93A", hlLine: "#B9811A", teal: "#1D7A73", plum: "#8A3B6E", rubric: "#A8322A", green: "#3D7D4E", amber: "#B0661F", red: "#B2392E" } },
  { id: "parchment", name: "Parchment", dark: false, about: "Warm scroll paper with brown ink and red rubrics",
    c: { paper: "#F3EAD7", paper2: "#E9DDC3", surface: "#FAF4E6", ink: "#2B2118", inkSoft: "#6A5A47", inkFaint: "#9A8A74", rule: "#DCCBA9",
      accent: "#8A3A1C", hl: "#C9A13B", hlLine: "#A7801E", teal: "#3E6E5C", plum: "#7B3F61", rubric: "#A3271B", green: "#4E7A3A", amber: "#A8601A", red: "#A32E25" } },
  { id: "galilee", name: "Galilee", dark: false, about: "Lake water teal with a bright sun highlight",
    c: { paper: "#EDF3F1", paper2: "#DFE9E6", surface: "#F6FAF9", ink: "#16302B", inkSoft: "#4B6660", inkFaint: "#81958F", rule: "#C9D9D4",
      accent: "#11727A", hl: "#F0B34A", hlLine: "#C88C1E", teal: "#1C7A5C", plum: "#87497A", rubric: "#B0452E", green: "#2F7D52", amber: "#A86221", red: "#B33A31" } },
  { id: "olive", name: "Olive Grove", dark: false, about: "Grey-green leaves and olive wood",
    c: { paper: "#EFF0E6", paper2: "#E3E5D6", surface: "#F7F8F0", ink: "#262A1C", inkSoft: "#5C624B", inkFaint: "#8E937D", rule: "#D2D5C2",
      accent: "#556B2F", hl: "#D9B44A", hlLine: "#AD8B22", teal: "#2A6F63", plum: "#7F4A6E", rubric: "#9C3A22", green: "#4F7A2E", amber: "#A0651C", red: "#A8382C" } },
  { id: "contrast", name: "High contrast", dark: false, about: "Black on white, strongest readability",
    c: { paper: "#FFFFFF", paper2: "#EDEDED", surface: "#FFFFFF", ink: "#000000", inkSoft: "#2B2B2B", inkFaint: "#555555", rule: "#8A8A8A",
      accent: "#0033CC", hl: "#FFD400", hlLine: "#000000", teal: "#006B5E", plum: "#7A0066", rubric: "#B00000", green: "#006B21", amber: "#8A4A00", red: "#B00000" } },
  { id: "lapis-night", name: "Lapis Night", dark: true, about: "Deep blue night with gold",
    c: { paper: "#141B24", paper2: "#1A222D", surface: "#1B2430", ink: "#E4E6DF", inkSoft: "#A3ACB6", inkFaint: "#737D88", rule: "#2D3846",
      accent: "#86ABEA", hl: "#E2B95A", hlLine: "#E2B95A", teal: "#62C2B4", plum: "#D18FC3", rubric: "#E89279", green: "#79BE88", amber: "#E1A05E", red: "#EE8A80" } },
  { id: "lamplight", name: "Lamplight", dark: true, about: "Warm brown evening light, easy on the eyes",
    c: { paper: "#1E1914", paper2: "#26201A", surface: "#2A231C", ink: "#EDE3D2", inkSoft: "#B8A890", inkFaint: "#85775F", rule: "#3A3127",
      accent: "#E0A866", hl: "#E9C46A", hlLine: "#E9C46A", teal: "#7CC3AE", plum: "#D79CC4", rubric: "#EE9478", green: "#9CC48A", amber: "#E8A66A", red: "#EF8E80" } },
  { id: "cedar", name: "Cedar Night", dark: true, about: "Dark cedar green with soft gold",
    c: { paper: "#111A16", paper2: "#17221D", surface: "#1A2620", ink: "#E2EAE4", inkSoft: "#9FB2A7", inkFaint: "#6C7F74", rule: "#2A3A32",
      accent: "#7CC6A4", hl: "#E8C060", hlLine: "#E8C060", teal: "#6FCFC0", plum: "#D59AC8", rubric: "#EE977C", green: "#8ED39C", amber: "#E6A867", red: "#F08A80" } },
  { id: "midnight", name: "Midnight", dark: true, about: "True black, good for OLED screens",
    c: { paper: "#000000", paper2: "#0E1013", surface: "#0B0D10", ink: "#E8E8E8", inkSoft: "#A6A6A6", inkFaint: "#6E6E6E", rule: "#24272C",
      accent: "#8DB4FF", hl: "#FFD166", hlLine: "#FFD166", teal: "#5FD3C4", plum: "#E39BD6", rubric: "#FF8C73", green: "#7EDC95", amber: "#FFB066", red: "#FF8A80" } },
];

export const CUSTOMIZABLE = [
  ["paper", "Background"],
  ["surface", "Panels and cards"],
  ["ink", "Text"],
  ["accent", "Accent (buttons, links)"],
  ["hl", "Word link highlight"],
  ["teal", "Prefix color"],
  ["plum", "Suffix color"],
  ["rubric", "Names color"],
];

export function themeById(id) {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function mix(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Only #rrggbb colors from the user's file are used: anything else ("#fff", a color name, a number from a hand-edited
// backup) would break the light/dark test and the shades worked out from it.
export function cleanOverrides(o) {
  const out = {};
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v;
  return out;
}

// Returns CSS variables for a theme with the user's overrides applied.
export function themeVars(theme, overrides = {}) {
  overrides = cleanOverrides(overrides);
  const c = { ...theme.c, ...overrides };
  const dark = luminance(c.paper) < 0.25;
  // when the user changes the background or text, keep related shades in step
  if (overrides.paper && !overrides.paper2) c.paper2 = mix(c.paper, c.ink, dark ? 0.06 : 0.05);
  if (overrides.paper && !overrides.surface) c.surface = mix(c.paper, dark ? "#FFFFFF" : "#FFFFFF", dark ? 0.04 : 0.45);
  if ((overrides.paper || overrides.ink) && !overrides.rule) c.rule = mix(c.paper, c.ink, dark ? 0.14 : 0.16);
  if (overrides.ink || overrides.paper) {
    if (!overrides.inkSoft) c.inkSoft = mix(c.ink, c.paper, 0.35);
    if (!overrides.inkFaint) c.inkFaint = mix(c.ink, c.paper, 0.55);
  }
  if (overrides.hl && !overrides.hlLine) c.hlLine = mix(c.hl, c.ink, dark ? 0 : 0.2);
  return {
    dark,
    vars: {
      "--paper": c.paper, "--paper-2": c.paper2, "--surface": c.surface,
      "--ink": c.ink, "--ink-soft": c.inkSoft, "--ink-faint": c.inkFaint, "--rule": c.rule,
      "--lapis": c.accent, "--lapis-wash": rgba(c.accent, dark ? 0.14 : 0.10),
      "--gold": c.hlLine, "--gold-wash": rgba(c.hl, dark ? 0.24 : 0.32), "--gold-strong": rgba(c.hl, dark ? 0.44 : 0.55),
      "--teal": c.teal, "--plum": c.plum, "--rubric": c.rubric, "--green": c.green, "--amber": c.amber, "--red": c.red,
      "--brand-mark": c.hl,
      "--shadow": dark ? "0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35)" : "0 1px 2px rgba(29,39,51,.06), 0 8px 24px rgba(29,39,51,.08)",
    },
  };
}

export function resolveTheme(settings, systemDark) {
  const mode = settings.theme || "auto";
  let id;
  if (mode === "auto") id = systemDark ? (settings.themeDark || "lapis-night") : (settings.themeLight || "stone");
  else id = mode;
  return themeById(id);
}
