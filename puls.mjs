#!/usr/bin/env node
/**
 * Puls CLI v6 — the terminal trading desk.
 *
 *  puls                          launch interactive TUI
 *  puls login <key>              save API key
 *  puls wallet                   wallet & balance
 *  puls markets                  browse live markets
 *  puls market <slug>            deep detail + candlestick
 *  puls search <term>            fuzzy search with ranking
 *  puls watch <slug>             live candlestick tracker
 *  puls compare <a> <b>          side-by-side
 *  puls top                      top by volume
 *  puls feed                     live trade stream
 *  puls oracle <slug>            AI swarm vs crowd
 *  puls stats                    platform dashboard
 *  puls heatmap                  market heat grid
 *  puls history <slug>           price history chart
 *  puls calc <odds> <bet>        bet calculator
 *  puls alert <slug> up|down <¢> set alert
 *  puls alerts                   manage alerts
 *  puls theme [name]             switch theme
 *  puls open <slug>              open in browser
 *  puls doctor                   diagnostics
 *
 *  flags: --json · --no-color · --no-anim · --watch · --compact
 *         --active · --sort vol|odds|new · --limit N · --min N · -v
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { exec, execSync } from 'node:child_process';
import readline from 'node:readline';

// ═══════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════

const VERSION = '6.6.1';
const API_BASE = (process.env.PULS_API || 'https://api.pulsmarket.tech').replace(/\/+$/, '');
const WEB_BASE = 'https://app.pulsmarket.tech';
const CFG_DIR  = join(homedir(), '.puls');
const CFG_FILE = join(CFG_DIR, 'config.json');
const ALERT_FILE = join(CFG_DIR, 'alerts.json');
const PORTFOLIO_FILE = join(CFG_DIR, 'portfolio.json');

const rawArgs = process.argv.slice(2);
const flag = n => {
  const eq = rawArgs.find(a => a.startsWith(`--${n}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = rawArgs.indexOf(`--${n}`);
  return i >= 0 && i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--') ? rawArgs[i + 1] : null;
};
const has = f => rawArgs.includes(f);
const F = {
  json: has('--json'), nc: has('--no-color') || !!process.env.NO_COLOR,
  na: has('--no-anim') || !!process.env.PULS_NO_ANIM,
  watch: has('--watch'), compact: has('--compact'), active: has('--active'),
};
const flagKeys = new Set(['--sort', '--limit', '--min', '--interval']);
const args = rawArgs.filter((a, i) => {
  if (a.startsWith('--') || a === '-v') return false;
  if (i > 0 && flagKeys.has(rawArgs[i - 1])) return false;
  return true;
});

const IS_TTY = process.stdout.isTTY && !F.na;
let TW = (() => { try { return process.stdout.columns || 100; } catch { return 100; } })();
let TH = (() => { try { return process.stdout.rows || 40; } catch { return 40; } })();
let PW = Math.min(TW, 120);
function recomputeSize() {
  try { TW = process.stdout.columns || TW; TH = process.stdout.rows || TH; } catch {}
  TW = Math.max(24, TW); TH = Math.max(10, TH);
  PW = Math.min(TW, 120);
}

// ═══════════════════════════════════════════════════════════════════
//  THEME ENGINE
// ═══════════════════════════════════════════════════════════════════

const THEMES = {
  puls: {
    name: 'Puls', desc: 'brand pink → mint',
    pal: [[236,72,153],[244,114,182],[180,138,178],[110,170,184],[74,194,189],[45,212,191]],
    ok:[34,197,94], bad:[244,63,94], inf:[45,212,191],
    tx:[226,232,240], br:[248,250,252], dm:[122,134,154], dk:[51,65,85],
    up:[45,212,191], dn:[244,63,94],
  },
  obsidian: {
    name: 'Obsidian', desc: 'warm gold on deep charcoal',
    pal: [[168,142,80],[217,169,55],[245,158,11],[244,63,94],[139,92,246],[56,189,248]],
    ok:[52,211,153], bad:[244,63,94], inf:[56,189,248],
    tx:[222,218,210], br:[252,250,245], dm:[114,110,102], dk:[64,60,54],
    up:[52,211,153], dn:[244,63,94],
  },
  ember: {
    name: 'Ember', desc: 'fiery orange on warm black',
    pal: [[180,90,40],[230,120,30],[255,160,20],[255,70,70],[200,50,130],[255,200,60]],
    ok:[80,210,130], bad:[255,70,70], inf:[255,200,60],
    tx:[235,215,195], br:[255,245,235], dm:[140,115,95], dk:[75,58,45],
    up:[80,210,130], dn:[255,70,70],
  },
  arctic: {
    name: 'Arctic', desc: 'glacial blue on deep navy',
    pal: [[60,130,190],[80,170,230],[110,200,250],[160,225,255],[45,100,160],[30,70,130]],
    ok:[60,220,170], bad:[240,100,100], inf:[110,200,250],
    tx:[200,225,240], br:[235,248,255], dm:[90,115,145], dk:[35,50,70],
    up:[60,220,170], dn:[240,100,100],
  },
  neon: {
    name: 'Neon', desc: 'hot pink and cyan on void black',
    pal: [[255,0,110],[251,86,7],[255,190,11],[0,245,212],[131,56,236],[58,134,255]],
    ok:[0,245,212], bad:[255,0,110], inf:[58,134,255],
    tx:[210,200,220], br:[250,245,255], dm:[100,90,115], dk:[40,35,50],
    up:[0,245,212], dn:[255,0,110],
  },
  terminal: {
    name: 'Terminal', desc: 'phosphor green on black',
    pal: [[20,100,20],[40,160,40],[60,220,60],[80,255,80],[30,130,30],[50,190,50]],
    ok:[60,220,60], bad:[200,255,60], inf:[40,160,40],
    tx:[80,200,80], br:[180,255,180], dm:[30,90,30], dk:[12,35,12],
    up:[60,220,60], dn:[200,255,60],
  },
};

function ensureDir() { if (!existsSync(CFG_DIR)) mkdirSync(CFG_DIR, { recursive: true }); }
function loadJson(p, fb) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } }
function saveJson(p, v) { ensureDir(); writeFileSync(p, JSON.stringify(v, null, 2), { mode: 0o600 }); }
function loadCfg() { return loadJson(CFG_FILE, {}); }
function saveCfg(c) { saveJson(CFG_FILE, c); }
function loadAlerts() { return loadJson(ALERT_FILE, []); }
function saveAlerts(a) { saveJson(ALERT_FILE, a); }
function loadPortfolio() { return loadJson(PORTFOLIO_FILE, { positions: [], history: [] }); }
function savePortfolio(p) { saveJson(PORTFOLIO_FILE, p); }

let T = THEMES[loadCfg().theme] || THEMES.puls;
let P = T.pal;
function applyTheme(name) {
  T = THEMES[name] || THEMES.puls;
  P = T.pal;
  const cfg = loadCfg(); cfg.theme = name; saveCfg(cfg);
}

// ═══════════════════════════════════════════════════════════════════
//  COLOR ENGINE
// ═══════════════════════════════════════════════════════════════════

const ESC = '\x1b[', NO = F.nc;
const RST = NO ? '' : ESC + '0m';
const BD  = NO ? '' : ESC + '1m';
const DIM = NO ? '' : ESC + '2m';
const IT  = NO ? '' : ESC + '3m';
const fg = (r, g, b) => NO ? '' : ESC + `38;2;${r};${g};${b}m`;
const bg = (r, g, b) => NO ? '' : ESC + `48;2;${r};${g};${b}m`;
const CU = n => wr(ESC + n + 'A');
const CL = () => wr(ESC + '2K\r');
const HC = () => IS_TTY && wr(ESC + '?25l');
const SC = () => IS_TTY && wr(ESC + '?25h');
const CLS = () => wr(ESC + '2J' + ESC + 'H');
const MV = (x, y) => wr(ESC + y + ';' + x + 'H');
const ALT_SCREEN = () => wr(ESC + '?1049h');
const MAIN_SCREEN = () => wr(ESC + '?1049l');
const TITLE = t => IS_TTY && wr('\x1b]0;Puls — ' + t + '\x07');
const BEL = () => process.stderr.write('\x07');

const mix = (a, b, t) => Math.round(a + (b - a) * t);
const clp = t => Math.max(0, Math.min(1, t));

function gradColor(t) {
  t = clp(t); const s = t * (P.length - 1), i = Math.min(P.length - 2, Math.floor(s)), f = s - i;
  return [mix(P[i][0], P[i+1][0], f), mix(P[i][1], P[i+1][1], f), mix(P[i][2], P[i+1][2], f)];
}

function grad(text, { glow = null, fadeAfter = 1 } = {}) {
  if (NO) return text;
  const chars = [...text], n = chars.length; let out = '';
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    if (t > fadeAfter) break;
    let [r, g, b] = gradColor(t);
    if (glow !== null) { const d = Math.abs(t - glow); if (d < 0.25) { const k = (1 - d / 0.25) * 0.95; r = mix(r, 255, k); g = mix(g, 255, k); b = mix(b, 255, k); } }
    if (fadeAfter < 1 && fadeAfter - t < 0.08) { const k = Math.max(0, (fadeAfter - t) / 0.08); r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k); }
    out += fg(r, g, b) + chars[i];
  }
  return out + RST;
}

const pk = s => fg(...T.pal[1]) + s + RST;
const Pk = s => fg(...T.pal[1]) + BD + s + RST;
const cy = s => fg(...T.inf) + s + RST;
const Cy = s => fg(...T.inf) + BD + s + RST;
const am = s => fg(...T.pal[2]) + s + RST;
const Am = s => fg(...T.pal[2]) + BD + s + RST;
const rs = s => fg(...T.bad) + s + RST;
const Rs = s => fg(...T.bad) + BD + s + RST;
const vt = s => fg(...T.pal[4]) + s + RST;
const Vt = s => fg(...T.pal[4]) + BD + s + RST;
const em = s => fg(...T.ok) + s + RST;
const Em = s => fg(...T.ok) + BD + s + RST;
const tx = s => fg(...T.tx) + s + RST;
const Tx = s => fg(...T.br) + s + RST;
const Wh = s => fg(...T.br) + BD + s + RST;
const dm = s => DIM + fg(...T.dm) + s + RST;
const Dm = s => fg(...T.dm) + s + RST;
const di = s => fg(...T.dk) + s + RST;
const er = s => fg(...T.bad) + s + RST;
const Er = s => fg(...T.bad) + BD + s + RST;
const upC = s => fg(...T.up) + BD + s + RST;
const dnC = s => fg(...T.dn) + BD + s + RST;

const badge = (text, r, g, b) => bg(r,g,b) + fg(10,10,12) + BD + ' ' + text + ' ' + RST;
const badgeOpen     = () => badge('LIVE', ...T.ok);
const badgeClosed   = () => badge('CLOSED', ...T.pal[2]);
const badgeResolved = () => badge('RESOLVED', 82, 78, 72);
function statusBadge(s) { s=(s||'open').toLowerCase(); return s==='open'||s==='active'?badgeOpen():s==='closed'||s==='closing'?badgeClosed():badgeResolved(); }
function probColor(pct) { const c = gradColor(clp(pct/100)); return s => fg(...c) + BD + s + RST; }

// ═══════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════

const sleep = ms => new Promise(r => setTimeout(r, ms));
const wr = s => process.stdout.write(s);
const ln = (s = '') => console.log(s);
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*?\x07/g, '');
function charW(cp) {
  if (cp === 0xFE0F || cp === 0x200D || (cp >= 0x300 && cp <= 0x36F)) return 0;          // VS16, ZWJ, combining
  if (cp >= 0x1F000 || (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60)) return 2;
  if (cp === 0x270D || cp === 0x26BD || cp === 0x26A1 || cp === 0x26D3 || cp === 0x2764) return 2;  // ✍ ⚽ ⚡ ⛓ ❤
  return 1;
}
const vlen = s => { let w = 0; for (const ch of stripAnsi(s)) w += charW(ch.codePointAt(0)); return w; };
// Hard-clip a (possibly ANSI-colored) string to `max` display cells so a line
// can never exceed the terminal width and wrap (the cause of the broken text).
function clip(s, max) {
  let out = '', w = 0, i = 0, cut = false;
  while (i < s.length) {
    if (s[i] === '\x1b') { const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(s.slice(i)); if (m) { out += m[0]; i += m[0].length; continue; } out += s[i++]; continue; }
    const cp = s.codePointAt(i), ch = String.fromCodePoint(cp), cw = charW(cp);
    if (w + cw > max) { cut = true; break; }
    out += ch; w += cw; i += ch.length;
  }
  return cut ? out + RST : out;
}
const padR = (s, w) => { const d = w - vlen(s); return d > 0 ? s + ' '.repeat(d) : s; };
const padL = (s, w) => { const d = w - vlen(s); return d > 0 ? ' '.repeat(d) + s : s; };
const center = (s, w) => { const d = w - vlen(s); if (d <= 0) return s; const l = d >> 1; return ' '.repeat(l) + s + ' '.repeat(d - l); };
const fmt = n => (Number(n) || 0).toLocaleString('en-US');
const usd = n => (Number(n) || 0).toFixed(2);
const micro = n => { n = Number(n) || 0; return n >= 0.01 ? n.toFixed(2) : parseFloat(n.toFixed(6)).toString(); };
function abbr(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'') + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1e4) return (n/1e3).toFixed(1).replace(/\.0$/,'') + 'K';
  return fmt(n);
}
function timeAgo(d) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return (ms/60000|0) + 'm ago';
  if (ms < 86400000) return (ms/3600000|0) + 'h ago';
  if (ms < 604800000) return (ms/86400000|0) + 'd ago';
  return new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
function openBrowser(u) { const c = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'; exec(`${c} "${u}"`, () => {}); }
function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a); }));
}
function copyToClip(text) {
  const cmd = process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard';
  try { execSync(cmd, { input: text }); return true; } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════
//  ANIMATION ENGINE
// ═══════════════════════════════════════════════════════════════════

const SPINNERS = {
  dots:  ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'],
  arc:   ['◜','◠','◝','◞','◡','◟'],
  grow:  ['▁','▃','▄','▅','▆','▇','█','▇','▆','▅','▄','▃'],
  pulse: ['○','◎','●','◎'],
  wave:  ['⠁','⠂','⠄','⡀','⢀','⠠','⠐','⠈'],
  orbit: ['◐','◓','◑','◒'],
  chase: ['⣾','⣽','⣻','⢿','⡿','⣟','⣯','⣷'],
};

function spinner(label, type = 'dots') {
  if (!IS_TTY) return { stop(){}, finish(){}, update(){} };
  const frames = SPINNERS[type] || SPINNERS.dots;
  let idx = 0, dots = 0, alive = true;
  HC();
  const dotT = setInterval(() => dots = (dots + 1) % 4, 380);
  const iv = setInterval(() => {
    if (!alive) return;
    CL();
    const [r,g,b] = gradColor((idx % 60) / 60);
    wr(`  ${fg(r,g,b)}${frames[idx % frames.length]}${RST} ${Dm(label + '.'.repeat(dots))}`);
    idx++;
  }, 75);
  return {
    stop()   { alive = false; clearInterval(iv); clearInterval(dotT); CL(); SC(); },
    finish(c='✓') { alive = false; clearInterval(iv); clearInterval(dotT); CL(); wr(`  ${Em(c)} ${Dm(label)}\n`); SC(); },
    update(m) { label = m; },
  };
}

async function typeWrite(text, speed = 11) {
  if (!IS_TTY) { wr(text); return; }
  for (const ch of [...text]) {
    wr(ch);
    if (ch === ' ') continue;
    let d = speed;
    if ('.!?'.includes(ch)) d *= 4; else if (',;:'.includes(ch)) d *= 2.5;
    await sleep(d);
  }
}

// A shimmering, phrase-cycling "thinking" line (Claude-Code-style): a braille
// spinner + a moving highlight sweep across rotating phrases + elapsed time.
const THINK_PHRASES = ['researching the open web', 'reading live sources', 'reasoning over the data', 'weighing the edge', 'sizing the call'];
function thinkingLine(frame, startMs, phrases = THINK_PHRASES) {
  const sp = SPINNERS.dots[frame % SPINNERS.dots.length];
  const phrase = phrases[Math.floor(frame / 16) % phrases.length] + '…';
  const pos = (frame % (phrase.length + 10)) - 5;
  let body = '';
  for (let i = 0; i < phrase.length; i++) {
    const d = Math.abs(i - pos);
    let r = 110, g = 110, b = 122;
    if (d < 6) { const k = (1 - d / 6) * 0.95; r = mix(r, 236, k); g = mix(g, 72, k); b = mix(b, 153, k); }
    body += fg(r, g, b) + phrase[i];
  }
  const [pr, pg, pb] = gradColor((frame % 60) / 60);
  const el = startMs ? '  ' + Dm(((Date.now() - startMs) / 1000).toFixed(1) + 's') : '';
  return fg(pr, pg, pb) + sp + RST + ' ' + body + RST + el;
}

async function toast(msg, icon, color) {
  if (!IS_TTY) { ln(`  ${icon} ${msg}`); return; }
  const steps = ['○','◌','◎','◉','●'];
  for (const f of steps) { CL(); wr(`  ${color(f)} ${Dm(msg)}`); await sleep(22); }
  CL(); wr(`  ${color(BD + icon + RST)} ${Tx(msg)}\n`);
}
const toastOK  = m => toast(m, '✓', Em);
const toastErr = m => toast(m, '✗', Er);

async function countUp(label, target, { prefix = '', suffix = '', duration = 600, color = Cy } = {}) {
  if (!IS_TTY) { ln(`  ${Dm(label)}  ${color(prefix + fmt(target) + suffix)}`); return; }
  const t0 = Date.now();
  while (true) {
    const t = clp((Date.now() - t0) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const val = Math.round(target * ease);
    CL(); wr(`  ${Dm(label)}  ${color(prefix + fmt(val) + suffix)}`);
    if (t >= 1) break;
    await sleep(16);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CHART ENGINE
// ═══════════════════════════════════════════════════════════════════

const BRAILLE = 0x2800;
const BDOT = [0, 1, 2, 6], RDOT = [3, 4, 5, 7];

function sparkMini(data, w = 16) {
  if (!data || data.length < 2) return di('·'.repeat(w));
  const chars = '▁▂▃▄▅▆▇█', pts = [];
  for (let i = 0; i < w; i++) pts.push(data[Math.round(i / Math.max(1, w - 1) * (data.length - 1))]);
  const lo = Math.min(...pts), hi = Math.max(...pts), r = hi - lo || 1;
  return pts.map((v, i) => {
    const ci = Math.min(chars.length - 1, ((v - lo) / r * chars.length) | 0);
    const c = gradColor(i / Math.max(1, w - 1));
    return fg(...c) + chars[ci];
  }).join('') + RST;
}

function lineChart(data, { w = 55, h = 5, fill = true, axis = true, label = '' } = {}) {
  if (!data || data.length < 2) return [di('  no data')];
  const cols = w, dRows = h * 4;
  const pts = [];
  for (let i = 0; i < cols; i++) pts.push(data[Math.round(i / Math.max(1, cols - 1) * (data.length - 1))]);
  const lo = Math.min(...pts), hi = Math.max(...pts), range = hi - lo || 1;
  const grid = Array.from({ length: cols }, () => new Uint8Array(dRows));
  for (let c = 0; c < cols; c++) {
    const norm = (pts[c] - lo) / range;
    const top = Math.round((1 - norm) * (dRows - 1));
    grid[c][top] = 1;
    if (fill) for (let r = top + 1; r < dRows; r++) grid[c][r] = 1;
  }
  const lines = [];
  if (label) lines.push('  ' + Dm(label));
  for (let row = 0; row < h; row++) {
    let ax = '';
    if (axis) {
      if (row === 0)          ax = padL(String(Math.round(hi)), 8) + ' ┤ ';
      else if (row === h - 1) ax = padL(String(Math.round(lo)), 8) + ' ┤ ';
      else                    ax = '         │ ';
    }
    let bl = '';
    for (let bc = 0; bc < Math.ceil(cols / 2); bc++) {
      let mask = 0;
      const lc = bc * 2;
      if (lc < cols) for (let dr = 0; dr < 4; dr++) if (grid[lc][row * 4 + dr]) mask |= 1 << BDOT[dr];
      const rc = bc * 2 + 1;
      if (rc < cols) for (let dr = 0; dr < 4; dr++) if (grid[rc][row * 4 + dr]) mask |= 1 << RDOT[dr];
      bl += String.fromCodePoint(BRAILLE + mask);
    }
    const rowT = h <= 1 ? 0.4 : 0.15 + (row / (h - 1)) * 0.55;
    lines.push(ax + fg(...gradColor(rowT)) + bl + RST);
  }
  if (axis) lines.push('         └' + '─'.repeat(Math.ceil(cols / 2) + 1));
  return lines;
}

function candlestick(ohlc, { w = 60, h = 8, axis = true, volBars = true } = {}) {
  if (!ohlc || ohlc.length < 2) return [di('  no OHLC data')];
  const N = ohlc.length;
  const volH = volBars ? Math.max(1, Math.floor(h * 0.22)) : 0;
  const chartH = h - volH;
  const pCols = w * 2, pRows = chartH * 4;
  let lo = Infinity, hi = -Infinity;
  for (const c of ohlc) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  const toRow = price => Math.round((1 - (price - lo) / (hi - lo)) * (pRows - 1));
  const volMax = Math.max(...ohlc.map(c => c.volume || 0)) || 1;
  const gridUp = Array.from({length: pCols}, () => new Uint8Array(pRows));
  const gridDn = Array.from({length: pCols}, () => new Uint8Array(pRows));
  for (let i = 0; i < N; i++) {
    const c = ohlc[i];
    const isUp = c.close >= c.open;
    const g = isUp ? gridUp : gridDn;
    const cx = Math.floor((i + 0.5) * pCols / N);
    const x0 = Math.floor(i * pCols / N);
    const x1 = Math.floor((i + 1) * pCols / N);
    const halfW = Math.max(0, Math.floor((x1 - x0) * 0.35));
    const wt = toRow(c.high), wb = toRow(c.low);
    for (let y = Math.max(0, wt); y <= Math.min(pRows - 1, wb); y++) g[cx][y] = 1;
    const bt = toRow(Math.max(c.open, c.close));
    const bb = toRow(Math.min(c.open, c.close));
    const bodyTop = Math.max(0, bt);
    const bodyBot = Math.min(pRows - 1, bb);
    for (let x = Math.max(0, cx - halfW); x <= Math.min(pCols - 1, cx + halfW); x++) {
      for (let y = bodyTop; y <= bodyBot; y++) g[x][y] = 1;
    }
  }
  const lines = [];
  for (let row = 0; row < chartH; row++) {
    let ax = '';
    if (axis) {
      if (row === 0)              ax = padL('$' + Math.round(hi), 8) + ' ┤ ';
      else if (row === chartH - 1) ax = padL('$' + Math.round(lo), 8) + ' ┤ ';
      else                         ax = '         │ ';
    }
    let line = '';
    for (let bc = 0; bc < w; bc++) {
      let mU = 0, mD = 0;
      for (let dy = 0; dy < 4; dy++) {
        const py = row * 4 + dy;
        const lx = bc * 2, rx = bc * 2 + 1;
        if (lx < pCols) { if (gridUp[lx][py]) mU |= 1 << BDOT[dy]; if (gridDn[lx][py]) mD |= 1 << BDOT[dy]; }
        if (rx < pCols) { if (gridUp[rx][py]) mU |= 1 << RDOT[dy]; if (gridDn[rx][py]) mD |= 1 << RDOT[dy]; }
      }
      if (mD)       line += fg(...T.dn) + String.fromCodePoint(BRAILLE + mD) + RST;
      else if (mU)  line += fg(...T.up) + String.fromCodePoint(BRAILLE + mU) + RST;
      else          line += ' ';
    }
    lines.push(ax + line);
  }
  if (axis) lines.push('         └' + '─'.repeat(w + 1));
  if (volBars && volH > 0) {
    lines.push('');
    for (let row = 0; row < volH; row++) {
      let ax = row === 0 ? '   vol  ┤ ' : '         │ ';
      let line = '';
      for (let i = 0; i < N; i++) {
        const c = ohlc[i];
        const volFrac = (c.volume || 0) / volMax;
        const filled = Math.round(volFrac * volH);
        const thisRow = volH - 1 - row;
        const isUp = c.close >= c.open;
        if (thisRow < filled) line += isUp ? fg(...T.up) + '█' : fg(...T.dn) + '█';
        else line += ' ';
        const candleW = Math.max(1, Math.floor(w / N));
        line += ' '.repeat(Math.max(0, candleW - 1));
      }
      lines.push(ax + line + RST);
    }
  }
  return lines;
}

function probBar(pct, w = 28) {
  const filled = Math.round(pct / 100 * w); let s = '';
  for (let i = 0; i < w; i++) {
    const c = gradColor(i / Math.max(1, w - 1));
    s += i < filled ? fg(...c) + '█' : di('░');
  }
  return s + RST;
}

function hBar(val, max, w = 22, color = cy) {
  const filled = Math.round((val / Math.max(1, max)) * w);
  let s = '';
  for (let i = 0; i < w; i++) s += i < filled ? color('█') : di('░');
  return s;
}

// ═══════════════════════════════════════════════════════════════════
//  UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function rule(w = PW) { let s = ''; for (let i = 0; i < w; i++) s += fg(...gradColor(i / Math.max(1, w - 1))) + '─'; return s + RST; }

function header(title, meta = '', icon = '◆') {
  ln('\n  ' + Pk(icon) + '  ' + grad(title) + (meta ? '  ' + Dm(meta) : ''));
  ln('  ' + rule(PW));
}

function card(lines, { title = '', w: innerW = 0, border = 'round' } = {}) {
  const cleanLines = lines.map(stripAnsi);
  const cleanTitle = stripAnsi(title);
  innerW = Math.min(PW + 10, Math.max(innerW, cleanTitle.length + 6, ...cleanLines.map(l => [...l].length)));
  const b = border === 'double' ? ['╔','═','╗','║','╚','╝'] : border === 'heavy' ? ['┏','━','┓','┃','┗','┛'] : ['╭','─','╮','│','╰','╯'];
  const [tl, h, tr, v, bl, br] = b;
  const out = [];
  if (title) {
    const pad = Math.max(0, (innerW - [...cleanTitle].length - 4) / 2 | 0);
    out.push(`  ${Pk(tl)}${Pk(h.repeat(pad + 1))} ${Wh(title)} ${Pk(h.repeat(Math.max(1, innerW - pad - [...cleanTitle].length - 3)))}${Pk(tr)}`);
  } else {
    out.push(`  ${Pk(tl)}${Pk(h.repeat(innerW + 2))}${Pk(tr)}`);
  }
  for (let i = 0; i < lines.length; i++) {
    out.push(`  ${Pk(v)} ${lines[i]}${' '.repeat(Math.max(0, innerW - [...cleanLines[i]].length))} ${Pk(v)}`);
  }
  out.push(`  ${Pk(bl)}${Pk(h.repeat(innerW + 2))}${Pk(br)}`);
  return out.join('\n');
}

function walletCard(d) {
  const addr = d.address || '—';
  const short = addr.length > 20 ? addr.slice(0, 8) + '··' + addr.slice(-6) : addr;
  return card([
    `${Dm('address')}  ${Tx(short)}`,
    `${Dm('balance')} ${Cy('$' + (d.usdcBalance ?? '0') + ' USDC')}`,
  ], { w: 44, title: Wh('PULS') + ' ' + Dm('wallet') });
}


// ═══════════════════════════════════════════════════════════════════
//  FUZZY SEARCH
// ═══════════════════════════════════════════════════════════════════

function fuzzyScore(query, target) {
  query = query.toLowerCase(); target = target.toLowerCase();
  if (target.includes(query)) return 100 + (target.startsWith(query) ? 50 : 0) - target.length * 0.1;
  let qi = 0, score = 0, prev = false;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) { score += prev ? 8 : 4; if (ti < 3) score += 6; prev = true; qi++; }
    else prev = false;
  }
  return qi === query.length ? score - target.length * 0.05 : -1;
}

function fuzzyFilter(items, query, getStr) {
  if (!query) return items;
  return items.map(item => ({ item, score: fuzzyScore(query, getStr(item)) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.item);
}

function fuzzyHighlight(query, text) {
  if (!query) return Tx(text);
  const lq = query.toLowerCase(), lt = text.toLowerCase();
  let qi = 0, out = '';
  for (let i = 0; i < text.length; i++) {
    if (qi < lq.length && lt[i] === lq[qi]) { out += Am(text[i]); qi++; }
    else out += Tx(text[i]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
//  API LAYER
// ═══════════════════════════════════════════════════════════════════

const _cache = new Map();
const cacheGet = (k, ttl) => { const e = _cache.get(k); return e && Date.now() - e.t < ttl ? e.v : null; };
const cacheSet = (k, v) => _cache.set(k, { v, t: Date.now() });
const cacheClear = () => _cache.clear();

async function api(path, { method = 'GET', body, auth = false, key: ek } = {}) {
  const headers = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (auth || ek) {
    const k = ek || loadCfg().key;
    if (!k) throw new Error('Not logged in. Run:  puls login pk_live_…');
    headers.authorization = 'Bearer ' + k;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      const text = await resp.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      if (!resp.ok) { if (resp.status >= 500 && attempt < 2) { await sleep(300 * 2**attempt); continue; } throw new Error(data?.error || 'HTTP ' + resp.status); }
      return data;
    } catch (e) {
      if (/TimeoutError|network|ECONNRESET|fetch/i.test(e.message) && attempt < 2) { await sleep(300 * 2**attempt); continue; }
      throw new Error(e.name === 'TimeoutError' ? 'Request timed out' : 'Network: ' + e.message);
    }
  }
}

async function fetchMarkets(limit = 200) {
  const k = 'mk:' + limit, cached = cacheGet(k, 30000);
  if (cached) return cached;
  const d = await api('/api/markets?limit=' + limit);
  const ms = Array.isArray(d) ? d : d.markets || [];
  cacheSet(k, ms); return ms;
}

function jsonOut(d) { if (F.json) { console.log(JSON.stringify(d, null, 2)); return true; } return false; }

async function checkLogin() {
  if (loadCfg().key) return true;
  ln(Er('\n  Not logged in.') + Dm('  Run ') + Pk('puls login pk_live_…'));
  ln(Dm('  Generate a key at ') + cy(WEB_BASE + '/profile/api-keys') + '\n');
  return false;
}

function fakeOHLC(odds, n = 40) {
  const data = [];
  let price = odds ?? 50;
  for (let i = 0; i < n; i++) {
    const move = (Math.random() - 0.48) * 8;
    const open = price;
    const close = Math.max(1, Math.min(99, price + move));
    const high = Math.max(open, close) + Math.random() * 4;
    const low = Math.min(open, close) - Math.random() * 4;
    const volume = Math.round(5000 + Math.random() * 30000);
    data.push({ open, high: Math.min(99, high), low: Math.max(1, low), close, volume });
    price = close;
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════
//  INTRO
// ═══════════════════════════════════════════════════════════════════

const BANNER = [
  '██████╗ ██╗   ██╗██╗     ███████╗',
  '██╔══██╗██║   ██║██║     ██╔════╝',
  '██████╔╝██║   ██║██║     ███████╗',
  '██╔═══╝ ██║   ██║██║     ╚════██║',
  '██║     ╚██████╔╝███████╗███████║',
  '╚═╝      ╚═════╝ ╚══════╝╚══════╝',
];

async function intro() {
  if (!IS_TTY) { ln(grad(BANNER.join('\n'))); ln(Dm('\n  the market for what happens next\n')); return; }
  HC();
  const totalCols = BANNER[0].length, totalRows = BANNER.length;
  const chars = BANNER.map(l => [...l]);
  const scatter = '·∙⋅∘●○◎◉✦✧⬡░▒▓';

  // Phase 1: scatter resolving into the logo
  for (let frame = 0; frame <= 8; frame++) {
    MV(1, 1);
    const p = frame / 8;
    for (let r = 0; r < totalRows; r++) {
      let row = '';
      for (let c = 0; c < chars[r].length; c++) {
        const [gr, gg, gb] = gradColor(c / Math.max(1, totalCols));
        if (chars[r][c] === ' ') { row += ' '; continue; }
        if (p < 0.8) {
          const ch = scatter[(Math.random() * scatter.length) | 0];
          const a = 0.25 + p * 0.75;
          row += fg(Math.round(gr * a), Math.round(gg * a), Math.round(gb * a)) + ch;
        } else row += fg(gr, gg, gb) + chars[r][c];
      }
      wr(row + RST + '\n');
    }
    if (frame < 8) await sleep(45);
  }

  // Phase 2: glow sweep
  for (let sweep = -4; sweep <= totalCols + 4; sweep += 3) {
    MV(1, 1);
    for (let r = 0; r < totalRows; r++) {
      let row = '';
      for (let c = 0; c < chars[r].length; c++) {
        if (chars[r][c] === ' ') { row += ' '; continue; }
        let [gr, gg, gb] = gradColor(c / Math.max(1, totalCols));
        const dist = Math.abs(c - sweep);
        if (dist < 7) { const k = (1 - dist / 7) * 0.97; gr = mix(gr, 255, k); gg = mix(gg, 255, k); gb = mix(gb, 255, k); }
        row += fg(gr, gg, gb) + chars[r][c];
      }
      wr(row + RST + '\n');
    }
    await sleep(10);
  }

  // Phase 3: final + tagline
  MV(1, 1);
  wr(BANNER.map(line => grad(line)).join('\n') + '\n');
  wr(rule(totalCols) + '\n');
  const tag = '  the market for what happens next';
  const tagArr = [...tag];
  for (let i = 0; i < tagArr.length; i++) {
    const t = i / Math.max(1, tagArr.length - 1);
    wr(fg(...gradColor(t)) + tagArr[i] + RST);
    if (tagArr[i] !== ' ') await sleep(8);
  }
  wr('\n');
  const cfg = loadCfg();
  if (cfg.theme && cfg.theme !== 'puls') wr('  ' + Dm('theme: ') + pk(T.name) + '\n');
  const alerts = loadAlerts();
  if (alerts.length) wr('  ' + Dm(alerts.length + ' price alert' + (alerts.length > 1 ? 's' : '') + ' active') + '\n');
  wr('\n');
  SC();
}


// ═══════════════════════════════════════════════════════════════════
//  INTERACTIVE TUI
// ═══════════════════════════════════════════════════════════════════

async function startTUI() {
  if (!process.stdin.isTTY || !IS_TTY) { ln(Dm('\n  TUI requires an interactive terminal.\n')); help(); return; }
  const cfg = loadCfg();
  if (!cfg.key) {
    ln(`\n  ${Pk('◆')} ${Wh('Welcome to Puls')}\n`);
    ln(`  ${Dm('Save your API key first:')}`);
    ln(`  ${cy(WEB_BASE + '/profile/api-keys')}\n`);
    ln(`  ${Dm('Then:')} ${Pk('puls login pk_live_…')}\n`);
    return;
  }

  const tabs = ['Chat', 'Agents', 'Markets', 'Signals', 'Portfolio', 'Stats', 'My Agent'];
  const TAB = { CHAT: 0, AGENTS: 1, MARKETS: 2, SIGNALS: 3, PORTFOLIO: 4, STATS: 5, MYAGENT: 6 };
  let tab = 0, sel = 0, scrollOff = 0;
  let markets = [], search = '', searching = false, sortMode = 'volume';
  let detailMarket = null;
  let agentsData = null, pfData = null, statsData = null, signals = [];
  let chatLog = [], chatInput = '', chatBusy = false, chatBusyAt = 0, sigBusy = false;
  let statusMsg = '', statusTimer = null;
  let paletteMode = false, paletteQuery = '', paletteSel = 0;
  let loaded = false;
  let frame = 0, animTimer = null, onResize = null, unlocking = null, sigDetail = null, docScroll = 0, sigFilter = 'all', buyMode = null;
  let myAgent = null, myLog = [], myInput = '', myBusy = false, myBusyAt = 0;

  function setStatus(msg, ms = 3500) {
    statusMsg = msg; if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusMsg = ''; render(); }, ms);
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  ALT_SCREEN(); HC(); TITLE('interactive mode');

  async function loadData() {
    try {
      markets = await fetchMarkets(200);
      const sorters = {
        volume: (a, b) => (b.volumeUsdc ?? b.volume ?? 0) - (a.volumeUsdc ?? a.volume ?? 0),
        odds:   (a, b) => (b.yesPrice ?? 0.5) - (a.yesPrice ?? 0.5),
        newest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      };
      markets.sort(sorters[sortMode] || sorters.volume);
      if (F.active) markets = markets.filter(m => (m.status || 'open').toLowerCase() === 'open');
    } catch {}
  }
  async function loadAgents() {
    try { const [house, roster] = await Promise.all([api('/api/agents/house').catch(() => null), api('/api/agents/roster').catch(() => null)]); agentsData = { house, roster }; } catch {}
  }
  async function loadPf() { if (!loadCfg().key) return; try { pfData = await api('/api/portfolio', { auth: true }); } catch {} }

  // ── In-TUI trading (buy / sell / claim) — authed, settled on Arc ──
  async function tuiTradeResult(r) {
    let st = r || {};
    if (r && r.txId) {
      const dl = Date.now() + 45000;
      while (Date.now() < dl) {
        await new Promise(z => setTimeout(z, 1600));
        try { st = await api('/api/trade/status?txId=' + encodeURIComponent(r.txId)); } catch {}
        if (TERMINAL_STATES.has(String(st.state || '').toUpperCase())) break;
      }
    }
    return { done: ['COMPLETE', 'CONFIRMED'].includes(String(st.state || '').toUpperCase()), state: st.state };
  }
  async function execBuy() {
    const m = detailMarket; const amt = parseFloat(buyMode && buyMode.amount); const side = (buyMode && buyMode.side) || 'YES';
    buyMode = null;
    if (!m) return;
    if (!loadCfg().key) { setStatus('Log in to trade:  puls login pk_live_…'); render(); return; }
    if (!(amt > 0)) { setStatus('Enter a positive USDC amount'); render(); return; }
    const yes = m.yesPrice ?? m.priceYes ?? m.yes;
    const entryPrice = yes != null ? (side === 'YES' ? Number(yes) : 1 - Number(yes)) : undefined;
    setStatus('Submitting ' + side + ' $' + amt + '…'); render();
    try {
      const r = await api('/api/trade/buy', { method: 'POST', auth: true, body: { slug: m.slug, side, usdcAmount: amt, question: m.question, entryPrice } });
      const res = await tuiTradeResult(r);
      setStatus(res.done ? '✓ bought ' + side + ' · $' + amt + ' USDC' : '● ' + (res.state || 'submitted')); await loadPf(); render();
    } catch (e) { setStatus('✗ ' + (e.message || e)); render(); }
  }
  async function execSell(p) {
    if (!p) return;
    if (!loadCfg().key) { setStatus('Log in to trade'); render(); return; }
    if (p.resolved) { setStatus('Resolved — press c to claim'); render(); return; }
    const side = String(p.side || '').toUpperCase(); const shares = Number(p.shares) || 0;
    if (!(shares > 0)) { setStatus('Nothing to sell here'); render(); return; }
    setStatus('Selling ' + side + '…'); render();
    try {
      const r = await api('/api/trade/sell', { method: 'POST', auth: true, body: { slug: p.slug, contractAddress: p.contractAddress || p.marketId, side, shares, question: p.question, owner: p.owner, entryPrice: p.entryPrice } });
      const res = await tuiTradeResult(r);
      setStatus(res.done ? '✓ sold ' + side : '● ' + (res.state || 'submitted')); await loadPf(); render();
    } catch (e) { setStatus('✗ ' + (e.message || e)); render(); }
  }
  async function execClaim(p) {
    if (!p) return;
    if (!loadCfg().key) { setStatus('Log in to trade'); render(); return; }
    if (!p.resolved) { setStatus("Not resolved yet — can't claim"); render(); return; }
    setStatus('Claiming…'); render();
    try {
      const r = await api('/api/trade/claim', { method: 'POST', auth: true, body: { slug: p.slug, contractAddress: p.contractAddress || p.marketId } });
      const res = await tuiTradeResult(r);
      setStatus(res.done ? '✓ claim settled' : '● ' + (res.state || (r && r.ok ? 'claimed' : 'submitted'))); await loadPf(); render();
    } catch (e) { setStatus('✗ ' + (e.message || e)); render(); }
  }
  async function loadStats() { try { statsData = await api('/api/stats'); } catch {} }
  async function loadSignals() { try { const d = await api('/api/signals', loadCfg().key ? { auth: true } : {}); signals = d.signals || (Array.isArray(d) ? d : []); } catch {} }
  function loadAll() { return Promise.all([loadData(), loadAgents(), loadPf(), loadStats(), loadSignals(), loadMyAgent()]); }

  async function sendChat() {
    const msg = chatInput.trim(); if (!msg || chatBusy) return;
    chatInput = '';
    if (!loadCfg().key) { chatLog.push({ role: 'ai', text: 'Log in to chat with the copilot:  puls login pk_live_…' }); render(); return; }
    chatLog.push({ role: 'you', text: msg }); chatBusy = true; chatBusyAt = Date.now(); render();
    try {
      const r = await api('/api/copilot/chat', { method: 'POST', body: { message: msg }, auth: true });
      chatLog.push({ role: 'ai', text: String(r.reply || '(no reply)').replace(/\*([^*]+)\*/g, (_, t) => BD + t + RST), sources: r.sources || [] });
    } catch (e) { chatLog.push({ role: 'ai', text: '⚠ ' + e.message }); }
    chatBusy = false; render();
  }
  function sigView() { return sigFilter === 'bought' ? signals.filter(s => s.unlocked) : signals; }

  async function unlockSel(payer) {
    const s = sigView()[sel]; if (!s || unlocking) return;
    if (s.unlocked) { setStatus('Already unlocked — press Enter to read'); render(); return; }
    if (!loadCfg().key) { setStatus('Log in to unlock:  puls login pk_live_…'); render(); return; }
    const byAgent = payer === 'agent';
    const price = micro(s.priceUsdc), creator = creatorName(s.creatorUserId);
    unlocking = { title: s.title || '', creator, price, step: 1, error: null, txId: null, byAgent };
    render(); await sleep(850);
    unlocking.step = 2; render(); await sleep(750);
    unlocking.step = 3; render(); await sleep(550);
    try {
      const r = await api('/api/signals/' + encodeURIComponent(s.id) + '/unlock', { method: 'POST', body: byAgent ? { payer: 'agent' } : {}, auth: true });
      const sg = r.signal || {};
      if (sg.thesis || sg.stance) { Object.assign(s, { unlocked: true, thesis: sg.thesis, stance: sg.stance, sources: sg.sources || s.sources }); unlocking.txId = r.txId || (r.payment && r.payment.tx) || (sg.onchain && sg.onchain.tx) || null; unlocking.step = 4; }
      else if (r.alreadyUnlocked) { Object.assign(s, { unlocked: true, thesis: sg.thesis, stance: sg.stance }); unlocking.step = 4; }
      else unlocking.error = r.message || 'Unlock not completed';
    } catch (e) { unlocking.error = /Insufficient/i.test(e.message) ? (byAgent ? 'Agent has insufficient USDC' : 'Insufficient USDC — faucet.circle.com') : e.message; }
    const err = unlocking.error;
    render(); await sleep(err ? 1700 : 1500);
    unlocking = null;
    if (!err && s.unlocked) { sigDetail = s; docScroll = 0; }
    setStatus(err ? '✗ ' + err : '✓ x402 settled · $' + price + ' → ' + creator + (byAgent ? ' (by your agent)' : ''));
    render();
  }

  async function loadMyAgent() {
    if (!loadCfg().key) return;
    try { myAgent = await api('/api/agent/status', { auth: true }); } catch {}
  }
  async function sendMyAgent() {
    const msg = myInput.trim(); if (!msg || myBusy) return;
    myInput = '';
    if (!loadCfg().key) { myLog.push({ role: 'ai', text: 'Log in first:  puls login pk_live_…' }); render(); return; }
    myLog.push({ role: 'you', text: msg }); myBusy = true; myBusyAt = Date.now(); render();
    async function ask() { return api('/api/agent/chat', { method: 'POST', body: { message: msg }, auth: true }); }
    try {
      let r;
      try { r = await ask(); }
      catch (e) {
        if (/not started/i.test(e.message)) { await api('/api/agent/start', { method: 'POST', body: { budget: 0 }, auth: true }).catch(() => {}); r = await ask(); }
        else throw e;
      }
      let txt = String(r.reply || '(no reply)').replace(/\*([^*]+)\*/g, (_, t) => BD + t + RST);
      if (r.trade) txt += '\n' + Em('⚡ traded ') + (r.trade.side || '') + ' ' + (r.trade.question || '');
      if (r.signal) txt += '\n' + Em('⚡ bought signal ') + '“' + (r.signal.title || '') + '”' + (r.signal.price != null ? ' · $' + r.signal.price : '') + (r.signal.stance ? ' (' + r.signal.stance + ')' : '') + Dm(' · x402 on Arc');
      myLog.push({ role: 'ai', text: txt, sources: r.sources || [] });
      if (r.remaining != null || r.reputation != null) myAgent = { ...(myAgent || { exists: true }), balance: r.remaining ?? (myAgent && myAgent.balance), reputation: r.reputation ?? (myAgent && myAgent.reputation), exists: true };
    } catch (e) { myLog.push({ role: 'ai', text: '⚠ ' + e.message }); }
    myBusy = false; render();
  }

  const allActions = [
    { name: 'Chat with AI Copilot', key: '1', fn: () => { tab = TAB.CHAT; } },
    { name: 'View AI Agents (swarm)', key: '2', fn: () => { tab = TAB.AGENTS; } },
    { name: 'Browse Markets', key: '3', fn: () => { tab = TAB.MARKETS; detailMarket = null; sel = 0; scrollOff = 0; } },
    { name: 'Alpha Signals (x402)', key: '4', fn: () => { tab = TAB.SIGNALS; sel = 0; scrollOff = 0; } },
    { name: 'My Portfolio', key: '5', fn: () => { tab = TAB.PORTFOLIO; } },
    { name: 'Platform Stats', key: '6', fn: () => { tab = TAB.STATS; } },
    { name: 'My Agent (chat + buy alpha)', key: '7', fn: () => { tab = TAB.MYAGENT; } },
    { name: 'Refresh all data', key: 'r', fn: async () => { cacheClear(); await loadAll(); setStatus('Refreshed'); } },
    { name: 'Search markets…', key: '/', fn: () => { tab = TAB.MARKETS; searching = true; search = ''; sel = 0; scrollOff = 0; } },
    { name: 'Sort markets by volume', key: '', fn: () => { sortMode = 'volume'; loadData(); setStatus('Sorted by volume'); } },
    { name: 'Sort markets by odds', key: '', fn: () => { sortMode = 'odds'; loadData(); setStatus('Sorted by odds'); } },
    { name: 'Sort markets by newest', key: '', fn: () => { sortMode = 'newest'; loadData(); setStatus('Sorted by newest'); } },
    { name: 'Theme: Puls (pink→mint)', key: '', fn: () => { applyTheme('puls'); setStatus('Theme: Puls'); } },
    { name: 'Theme: Obsidian', key: '', fn: () => { applyTheme('obsidian'); setStatus('Theme: Obsidian'); } },
    { name: 'Theme: Ember', key: '', fn: () => { applyTheme('ember'); setStatus('Theme: Ember'); } },
    { name: 'Theme: Arctic', key: '', fn: () => { applyTheme('arctic'); setStatus('Theme: Arctic'); } },
    { name: 'Theme: Neon', key: '', fn: () => { applyTheme('neon'); setStatus('Theme: Neon'); } },
    { name: 'Quit', key: 'q', fn: () => { quit(); } },
  ];
  function getActions() {
    const marketActions = (tab === TAB.MARKETS ? markets : []).slice(0, 8).map(m => ({
      name: 'Open: ' + (m.question || m.slug || '').slice(0, 46), key: '', fn: () => { detailMarket = m; },
    }));
    const sigActions = (tab === TAB.SIGNALS ? signals : []).slice(0, 6).filter(s => !s.unlocked).map(s => ({
      name: 'Unlock: ' + (s.title || '').slice(0, 42), key: '', fn: () => { const i = signals.indexOf(s); if (i >= 0) { sel = i; } unlockSel(); },
    }));
    return [...allActions, ...marketActions, ...sigActions];
  }

  function quit() {
    if (animTimer) clearInterval(animTimer);
    if (onResize) { try { process.stdout.removeListener('resize', onResize); } catch {} }
    try { process.stdin.setRawMode(false); } catch {}
    process.stdin.pause(); MAIN_SCREEN(); SC(); TITLE('');
    ln(Dm('\n  bye.\n')); process.exit(0);
  }

  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return String(u || '').slice(0, 22); } };
  const tabBar = () => tabs.map((t, i) => i === tab ? Pk(`${i + 1}`) + Wh(' ' + t) : di(`${i + 1}`) + dm(' ' + t)).join('   ');

  function rChat(H) {
    const lines = [];
    if (!chatLog.length) {
      lines.push('  ' + Pk('◆ Puls AI Trading Copilot'));
      lines.push('  ' + Dm('Ask anything — grounded in live web research, with cited sources.'));
      lines.push('');
      lines.push('  ' + Dm('try:'));
      lines.push('   ' + cy('›') + ' ' + Tx('Will BTC hold above $90k this quarter?'));
      lines.push('   ' + cy('›') + ' ' + Tx('Who is favored to win the 2026 World Cup?'));
      lines.push('   ' + cy('›') + ' ' + Tx('Is the market mispricing a Fed rate cut?'));
    }
    for (const m of chatLog) {
      if (m.role === 'you') { lines.push('  ' + Cy('You')); wrapText(m.text, PW - 6, '   ').forEach(l => lines.push(tx(l))); }
      else {
        lines.push('  ' + Pk('◆ Copilot'));
        wrapText(m.text, PW - 6, '   ').forEach(l => lines.push(Tx(l)));
        if (m.sources && m.sources.length) lines.push('   ' + Dm('↳ ' + m.sources.map(x => hostOf(x.url || x.title)).filter(Boolean).slice(0, 3).join('  ·  ')));
      }
      lines.push('');
    }
    if (chatBusy) lines.push('  ' + Pk('◆ Copilot') + '  ' + thinkingLine(frame, chatBusyAt));
    const avail = Math.max(2, H - 2);
    const shown = lines.slice(Math.max(0, lines.length - avail));
    let s = shown.join('\n') + '\n';
    s += '\n'.repeat(Math.max(0, avail - shown.length));
    s += '  ' + di('─'.repeat(TW - 4)) + '\n';
    const cursor = chatBusy ? pk(SPINNERS.dots[frame % SPINNERS.dots.length]) : (frame % 12 < 7 ? Pk('▏') : ' ');
    s += '  ' + (loadCfg().key ? Cy('› ') + Tx(chatInput) + cursor : Dm('Log in to chat:  ') + Pk('puls login pk_live_…'));
    return s;
  }

  function rAgents(H) {
    let s = `  ${Pk('◆')} ${Wh('Agent Swarm')}  ${Dm('autonomous economic actors · on-chain')}\n\n`;
    if (!agentsData) return s + `  ${Dm(loaded ? 'No agent data — press r' : 'Loading…')}`;
    const house = agentsData.house, pulse = house && (house.agent || house.pulse), sage = house && house.sage;
    if (pulse) s += `  ${Pk('🤖 Pulse')} ${Dm('trader')}   ${pulse.balance != null ? cy('$' + usd(pulse.balance) + ' USDC') : ''}  ${pulse.reputation != null ? Dm('rep ' + pulse.reputation) : ''}\n`;
    if (sage) { const sig = sage.signal || {}; s += `  ${Pk('✍️  Sage')}  ${Dm('creator')}  ${sage.balance != null ? cy('$' + usd(sage.balance) + ' USDC') : ''}  ${sig.revenueUsdc != null ? Em('earned $' + usd(sig.revenueUsdc)) : ''}\n`; }
    const agents = Array.isArray(agentsData.roster) ? agentsData.roster : (agentsData.roster?.agents || agentsData.roster?.roster || agentsData.roster?.swarm || []);
    if (agents.length) {
      s += `\n  ${Dm('the swarm · ' + agents.length + ' agents')}\n`;
      for (const a of agents.slice(0, Math.max(2, H - 14))) {
        const nm = a.name || a.displayName || a.userId || 'agent'; const bal = a.balance ?? a.usdcBalance;
        s += `  ${Pk('•')} ${Tx(String(nm).slice(0, 16).padEnd(16))} ${bal != null ? cy('$' + usd(bal)) : ''}\n`;
      }
    }
    const decs = (house && house.decisions) || [];
    if (decs.length) {
      s += `\n  ${Dm('Pulse · recent decisions')}\n`;
      for (const d of decs.slice(0, 3)) s += `  ${d.action === 'go' ? Em((d.side || 'BUY').padEnd(4)) : Am('HOLD')} ${Tx((d.question || '').slice(0, TW - 12))}\n`;
    }
    return s;
  }

  function rMarkets(H) {
    const filtered = search ? fuzzyFilter(markets, search, m => (m.question || '') + ' ' + (m.slug || '')) : markets;
    const maxVisible = Math.max(2, Math.floor((H - 2) / 3));
    const maxOff = Math.max(0, filtered.length - maxVisible); if (scrollOff > maxOff) scrollOff = maxOff;
    if (sel >= filtered.length) sel = Math.max(0, filtered.length - 1);
    const posLbl = filtered.length ? `   ${di(`${Math.min(scrollOff + 1, filtered.length)}–${Math.min(scrollOff + maxVisible, filtered.length)}/${filtered.length}`)}` : '';
    let s = `  ${Dm('sort:')} ${sortMode === 'volume' ? Pk('▼vol') : Dm('vol')}  ${sortMode === 'odds' ? Pk('▼odds') : Dm('odds')}  ${sortMode === 'newest' ? Pk('▼new') : Dm('new')}  ${searching ? Pk('/' + search + '▏') : Dm('/ to search')}${posLbl}\n\n`;
    const visible = filtered.slice(scrollOff, scrollOff + maxVisible);
    if (!visible.length) s += '  ' + Dm(search ? 'No matches.' : (loaded ? 'No markets — press r' : 'Loading…')) + '\n';
    for (let i = 0; i < visible.length; i++) {
      const m = visible[i], isSel = (i + scrollOff) === sel;
      const yes = m.yesPrice ?? m.priceYes ?? m.yes; const odds = yes != null ? Math.round(Number(yes) * 100) : null;
      const vol = m.volumeUsdc ?? m.volume; const q = (m.question || m.slug || '').slice(0, Math.min(64, TW - 44));
      const fakeH = Array.from({ length: 12 }, (_, j) => (odds ?? 50) + Math.sin(j * 1.2 + i + scrollOff) * 12);
      s += `${isSel ? Pk(' ▸ ') : '   '}${isSel ? Wh(q) : Tx(q)}\n`;
      s += `     ${odds !== null ? probColor(odds)(String(odds).padStart(2) + '¢') : di('—')}  ${probBar(odds ?? 50, 14)}  ${sparkMini(fakeH, 10)}  ${vol != null ? cy('$' + abbr(vol)) : di('—')}  ${statusBadge(m.status)}\n\n`;
    }
    return s;
  }

  function rDetail(H) {
    const m = detailMarket;
    const yes = m.yesPrice ?? m.priceYes ?? m.yes; const odds = yes != null ? Math.round(Number(yes) * 100) : 50;
    let s = `  ${Pk('◆')} ${Wh((m.question || m.slug || '').slice(0, TW - 6))}\n`;
    s += `  ${di((m.slug || '').slice(0, 52))}   ${statusBadge(m.status)}\n\n`;
    s += `  ${probColor(odds)(BD + 'YES ' + odds + '¢' + RST)}    ${probColor(100 - odds)(BD + 'NO ' + (100 - odds) + '¢' + RST)}    ${probBar(odds, Math.min(32, TW - 32))}\n\n`;
    const seed = [...(m.slug || m.question || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0);
    const closes = Array.from({ length: 64 }, (_, i) => Math.max(3, Math.min(97, odds + Math.sin(i * 0.34 + seed) * (7 + seed % 7) + Math.sin(i * 0.13 + seed * 0.5) * 4)));
    const cw = Math.min(64, TW - 12), ch = Math.max(5, Math.min(10, H - 9));
    const pts = []; for (let i = 0; i < cw; i++) pts.push(closes[Math.floor(i / cw * closes.length)]);
    const lo = Math.min(...pts), hi = Math.max(...pts), rng = (hi - lo) || 1;
    for (let r = 0; r < ch; r++) {
      const thr = hi - (r / (ch - 1)) * rng;
      let line = '   ';
      for (let c = 0; c < cw; c++) { const v = pts[c]; line += v >= thr ? fg(...gradColor(v / 100)) + '█' + RST : (v >= thr - rng / ch ? fg(...gradColor(v / 100)) + '▄' + RST : ' '); }
      s += line + '\n';
    }
    s += `   ${di(Math.round(lo) + '¢')}${' '.repeat(Math.max(1, cw - 8))}${di(Math.round(hi) + '¢')}\n\n`;
    const meta = []; const vol = m.volumeUsdc ?? m.volume; if (vol != null) meta.push(cy('$' + abbr(vol) + ' vol')); if (m.trades != null) meta.push(Dm(abbr(m.trades) + ' trades')); if (m.createdAt) meta.push(Dm(timeAgo(m.createdAt)));
    if (meta.length) s += '  ' + meta.join('   ·   ') + '\n';
    s += '  ' + Dm('simulated intraday · full candlesticks: ') + Pk('puls market ' + (m.slug || '')) + '\n';
    if (buyMode) {
      s += '\n  ' + Pk('● Buy') + '   ' + (buyMode.side === 'YES' ? Em('▲ YES') : Dm('▲ yes')) + Dm('  /  ') + (buyMode.side === 'NO' ? Rs('▼ NO') : Dm('▼ no')) + Dm('   (y/n)') + '\n';
      s += '  ' + Dm('amount  $') + Wh(buyMode.amount || '0') + Pk('▏') + Dm('   Enter buy · Esc cancel') + '\n';
    } else if (loadCfg().key) {
      s += '\n  ' + Dm('press ') + Pk('b') + Dm(' to buy · ') + Pk('o') + Dm(' open · ') + Pk('Esc') + Dm(' back') + '\n';
    } else {
      s += '\n  ' + Dm('log in to trade:  ') + Pk('puls login pk_live_…') + '\n';
    }
    return s;
  }

  function rSignals(H) {
    const list = sigView();
    const boughtN = signals.filter(s => s.unlocked).length;
    let s = `  ${Pk('◆')} ${Wh('Alpha Marketplace')}  ${Dm(list.length + ' · x402 → creators')}    ${sigFilter === 'all' ? Pk('●') : di('○')}${Dm(' all')}  ${sigFilter === 'bought' ? Pk('●') : di('○')}${Dm(' bought ' + boughtN)}\n\n`;
    if (!list.length) return s + '  ' + Dm(sigFilter === 'bought' ? 'No bought signals yet — press b for all, then u/a to unlock' : (loaded ? 'No signals — press r' : 'Loading…'));
    const listH = Math.max(2, Math.floor((H - 8) / 2));
    if (sel >= list.length) sel = list.length - 1;
    const maxOff = Math.max(0, list.length - listH); if (scrollOff > maxOff) scrollOff = maxOff;
    const vis = list.slice(scrollOff, scrollOff + listH);
    for (let i = 0; i < vis.length; i++) {
      const sg = vis[i], isSel = (i + scrollOff) === sel;
      const lock = sg.unlocked ? Em('🔓') : pk('🔒');
      s += `${isSel ? Pk(' ▸ ') : '   '}${lock} ${isSel ? Wh((sg.title || '').slice(0, TW - 26)) : Tx((sg.title || '').slice(0, TW - 26))}\n`;
      s += `      ${Cy('$' + micro(sg.priceUsdc))} ${Dm('· ' + creatorName(sg.creatorUserId))}${sg.bond ? am(' · ◆bond') : ''}${sg.onchain?.tx ? vt(' · ⛓') : ''}\n`;
    }
    const cur = list[sel];
    s += '\n  ' + di('─'.repeat(TW - 4)) + '\n';
    if (cur) {
      s += '  ' + Wh(cur.title || '') + '\n';
      if (cur.unlocked) {
        s += '  ' + Dm('call ') + (cur.stance === 'YES' ? Em('YES') : Rs('NO')) + Dm('  ·  ') + Em('🔓 unlocked') + Dm(' — ') + Pk('Enter') + Dm(' to read the full thesis') + '\n';
      } else {
        s += '  ' + Dm(cur.teaser || 'Locked — the agent\'s side, thesis & sources are paid alpha.') + '\n';
        s += '  ' + pk('🔒 ') + Pk('u') + pk(' you buy') + Dm('  ·  ') + Pk('a') + Dm(' your agent buys') + Dm('  ·  $' + micro(cur.priceUsdc) + ' → ' + creatorName(cur.creatorUserId) + ' via x402') + '\n';
      }
    }
    return s;
  }

  function rSignalDetail(H) {
    const s = sigDetail;
    let out = `  ${Pk('◆')} ${Wh(s.title || '')}\n`;
    out += `  ${Dm('by ' + creatorName(s.creatorUserId))}  ${Dm('· conf ' + Math.round((s.confidence || 0) * 100) + '%')}  ${Dm('· ' + (s.edgeBps || 0) + 'bps edge')}${s.bond ? am('  · ◆ bond $' + usd(s.bond.amountUsdc)) : ''}\n`;
    out += `  ${Dm('call ')}${s.stance === 'YES' ? Em('▲ YES') : Rs('▼ NO')}${s.marketQuestion ? Dm('   on  "' + s.marketQuestion + '"') : ''}\n`;
    out += `  ${Dm('↗ predict ')}${cy(s.marketLink || (WEB_BASE + '/?m=' + (s.marketSlug || '')))}  ${Dm('· press ')}${Pk('o')}\n`;
    out += '  ' + di('─'.repeat(TW - 4)) + '\n';
    const lines = wrapText(s.thesis || '(no thesis text)', TW - 4, '  ');
    if (s.sources && s.sources.length) { lines.push(''); lines.push('  ' + Dm('Sources')); s.sources.forEach(x => lines.push('   ' + cy('•') + ' ' + Tx(x.title || x.url || ''))); }
    if (s.onchain && s.onchain.tx) { lines.push(''); lines.push('  ' + Dm('⛓ attested · ') + cy(s.onchain.explorer || ('tx ' + s.onchain.tx))); }
    const avail = Math.max(3, H - 5);
    const maxOff = Math.max(0, lines.length - avail);
    if (docScroll > maxOff) docScroll = maxOff;
    out += lines.slice(docScroll, docScroll + avail).join('\n');
    if (lines.length > avail) out += '\n  ' + Dm((docScroll > 0 ? '▲ ' : '') + (docScroll + avail < lines.length ? '↓ more' : 'end') + '  ' + (docScroll + 1) + '–' + Math.min(docScroll + avail, lines.length) + '/' + lines.length);
    return out;
  }

  function rPortfolio(H) {
    let s = `  ${Pk('◆')} ${Wh('Your Portfolio')}\n\n`;
    if (!loadCfg().key) return s + `  ${Dm('Log in to see positions:  ')}${Pk('puls login pk_live_…')}`;
    if (!pfData) return s + `  ${Dm(loaded ? 'No data — press r' : 'Loading…')}`;
    const pos = pfData.positions || pfData.holdings || []; const spent = pfData.totalSpent ?? pfData.investedUsdc; const openN = pos.filter(p => !p.resolved).length;
    s += `  ${Dm('invested ')}${Cy('$' + usd(spent || 0))}${Dm('  ·  ' + openN + ' open · ' + pos.length + ' total')}\n\n`;
    if (!pos.length) return s + `  ${Dm('No positions yet.')}`;
    if (sel >= pos.length) sel = Math.max(0, pos.length - 1);
    pos.slice(0, Math.max(2, H - 6)).forEach((p, i) => {
      const isSel = i === sel;
      const side = String(p.side || '').toUpperCase();
      const st = p.claimed ? di('claimed') : p.resolved ? ((!!p.outcome === (side === 'YES')) ? Em('won') : rs('lost')) : am('open');
      s += `${isSel ? Pk(' ▸ ') : '   '}${(side === 'YES' ? Em : Rs)((side || '·').padEnd(3))} ${(isSel ? Wh : Tx)(String(p.question || p.slug || '').slice(0, TW - 34))}  ${p.usdcAmount != null ? cy('$' + usd(p.usdcAmount)) : ''}  ${st}\n`;
    });
    s += '\n  ' + Dm('↑↓ select · ') + Pk('s') + Dm(' sell · ') + Pk('c') + Dm(' claim');
    return s;
  }

  function rStats(H) {
    if (!statsData) return `  ${Pk('◈')} ${Wh('Platform Dashboard')}\n\n  ${Dm(loaded ? 'No data — press r' : 'Loading…')}`;
    const s2 = statsData; const np = s2.nanopayments && typeof s2.nanopayments === 'object' ? s2.nanopayments.count : s2.nanopayments;
    const deco = (seed) => { const chars = '▁▂▃▄▅▆▇█▇▆▅▄▃▂'; let o = ''; for (let i = 0; i < 14; i++) { const v = Math.sin((seed + i) * 0.7) * 0.5 + 0.5; o += fg(...gradColor(i / 13)) + chars[(v * (chars.length - 1)) | 0]; } return o + RST; };
    let s = `  ${Pk('◈')} ${Wh('Platform Dashboard')}  ${Dm('live · Arc testnet')}\n\n`;
    s += `   ${Dm('Trades'.padEnd(16))} ${Pk(BD + fmt(s2.trades) + RST)}   ${deco(3)}\n`;
    s += `   ${Dm('USDC Volume'.padEnd(16))} ${Cy(BD + '$' + fmt(s2.volumeUsdc) + RST)}   ${deco(9)}\n`;
    s += `   ${Dm('Markets'.padEnd(16))} ${Tx(BD + fmt(s2.marketsDeployed) + RST)}   ${deco(14)}\n`;
    s += '\n  ' + di('─'.repeat(Math.min(64, TW - 6))) + '\n';
    s += `   ${Dm('Agents'.padEnd(16))} ${Am(BD + fmt(s2.agents) + RST)}\n`;
    s += `   ${Dm('Agent trades'.padEnd(16))} ${Am(fmt(s2.agentTrades))}\n`;
    s += `   ${Dm('Nanopayments'.padEnd(16))} ${Vt(fmt(np))} ${Dm('x402 settlements')}\n`;
    s += `   ${Dm('Wallets'.padEnd(16))} ${Tx(fmt(s2.users))}\n`;
    return s;
  }

  function rMyAgent(H) {
    const lines = [];
    const a = myAgent;
    if (!loadCfg().key) lines.push('  ' + Dm('Log in to use your agent:  ') + Pk('puls login pk_live_…'));
    else if (!a) lines.push('  ' + Dm(loaded ? 'No status — press r' : 'Loading…'));
    else if (!a.exists) {
      lines.push('  ' + Pk('🤖 Your Agent') + Dm('  — not started yet'));
      lines.push('  ' + Dm('Send it a message below to spin it up (fund its budget in the app).'));
    } else {
      lines.push('  ' + Pk('🤖 Your Agent') + '   ' + (a.balance != null ? cy('$' + usd(a.balance) + ' budget') : '') + (a.reputation != null ? Dm('   rep ' + a.reputation) : '') + (a.registered ? Em('   ⛓ ERC-8004 #' + (a.agentId ?? '?')) : ''));
      if (a.agentAddress) lines.push('  ' + di(String(a.agentAddress)));
    }
    lines.push('');
    if (!myLog.length) {
      lines.push('  ' + Dm('Tell your agent what to do — it trades from its own on-chain budget:'));
      lines.push('   ' + cy('›') + ' ' + Tx('buy YES on the USA World Cup market if it is under 30¢'));
      lines.push('   ' + cy('›') + ' ' + Tx('what are your best opportunities right now?'));
      lines.push('  ' + Dm('It can also buy alpha for you — in ') + Pk('Signals') + Dm(' press ') + Pk('a') + Dm('.'));
    }
    for (const m of myLog) {
      if (m.role === 'you') { lines.push('  ' + Cy('You')); wrapText(m.text, PW - 6, '   ').forEach(l => lines.push(tx(l))); }
      else { lines.push('  ' + Pk('🤖 Agent')); wrapText(m.text, PW - 6, '   ').forEach(l => lines.push(Tx(l))); if (m.sources && m.sources.length) lines.push('   ' + Dm('↳ ' + m.sources.map(x => hostOf(x.url || x.title)).filter(Boolean).slice(0, 3).join('  ·  '))); }
      lines.push('');
    }
    if (myBusy) lines.push('  ' + Pk('🤖 Agent') + '  ' + thinkingLine(frame, myBusyAt, ['researching the market', 'reasoning over the data', 'checking my budget', 'pricing the edge', 'sizing the trade']));
    const avail = Math.max(2, H - 2);
    const shown = lines.slice(Math.max(0, lines.length - avail));
    let s = shown.join('\n') + '\n';
    s += '\n'.repeat(Math.max(0, avail - shown.length));
    s += '  ' + di('─'.repeat(TW - 4)) + '\n';
    const cursor = myBusy ? pk(SPINNERS.dots[frame % SPINNERS.dots.length]) : (frame % 12 < 7 ? Pk('▏') : ' ');
    s += '  ' + (loadCfg().key ? Cy('› ') + Tx(myInput) + cursor : Dm('Log in:  ') + Pk('puls login pk_live_…'));
    return s;
  }

  function footer() {
    const narrow = TW < 80;
    let hint;
    if (tab === TAB.CHAT) hint = narrow ? `${Pk('Enter')} send  ${Pk('Tab')} view  ${Pk('^C')} quit` : `${Pk('Enter')} send   ${Pk('Tab')} switch view   ${Pk('Ctrl+P')} palette   ${Pk('Ctrl+C')} quit`;
    else if (tab === TAB.MARKETS && detailMarket) hint = narrow ? `${Pk('Esc')} back  ${Pk('o')} open  ${Pk('Tab')} view` : `${Pk('Esc')} back   ${Pk('o')} open in browser   ${Pk('Tab')} switch   ${Pk('q')} quit`;
    else if (tab === TAB.MARKETS) hint = narrow ? `${Pk('↑↓')} nav  ${Pk('↵')} detail  ${Pk('/')} find  ${Pk('Tab')} view` : `${Pk('↑↓')} nav   ${Pk('Enter')} detail   ${Pk('/')} search   ${Pk('s')} sort   ${Pk('Tab')} switch   ${Pk('q')} quit`;
    else if (tab === TAB.SIGNALS && sigDetail) hint = narrow ? `${Pk('Esc')} back  ${Pk('↑↓')} scroll  ${Pk('o')} predict` : `${Pk('Esc')} back   ${Pk('↑↓')} scroll   ${Pk('o')} predict   ${Pk('c')} on-chain   ${Pk('Tab')} switch`;
    else if (tab === TAB.SIGNALS) hint = narrow ? `${Pk('u')} buy ${Pk('a')} agent ${Pk('b')} bought ${Pk('↵')} read` : `${Pk('↑↓')} nav   ${Pk('u')} you buy   ${Pk('a')} agent buys   ${Pk('b')} bought   ${Pk('Enter')} read   ${Pk('Tab')} switch`;
    else if (tab === TAB.MYAGENT) hint = narrow ? `${Pk('Enter')} send  ${Pk('Tab')} view  ${Pk('^C')} quit` : `${Pk('Enter')} send to your agent   ${Pk('Tab')} switch view   ${Pk('Ctrl+P')} palette   ${Pk('Ctrl+C')} quit`;
    else hint = narrow ? `${Pk('1-6')} views  ${Pk('Tab')} next  ${Pk('q')} quit` : `${Pk('1-6')} views   ${Pk('Tab')} next   ${Pk('r')} refresh   ${Pk('Ctrl+P')} palette   ${Pk('q')} quit`;
    let s = '  ' + rule(TW - 4) + '\n  ' + hint + '\n';
    s += '  ' + (statusMsg ? Em('◈ ') + Tx(statusMsg) : di(new Date().toLocaleTimeString('en', { hour12: false }) + (loaded ? '  ·  ' + markets.length + ' mkts · ' + signals.length + ' signals' : '  ·  loading…')));
    return s;
  }

  function render() {
    const H = Math.max(6, TH - 5);
    let buf = ESC + 'H';
    buf += `  ${grad('PULS', { glow: (frame % 36) / 36 })}${TW >= 72 ? ' ' + di('v' + VERSION) : ''}    ${tabBar()}${TW >= 94 ? '    ' + dm(T.name) : ''}\n`;
    buf += '  ' + rule(TW - 4) + '\n';
    let body;
    if (tab === TAB.CHAT) body = rChat(H);
    else if (tab === TAB.AGENTS) body = rAgents(H);
    else if (tab === TAB.MARKETS) body = detailMarket ? rDetail(H) : rMarkets(H);
    else if (tab === TAB.SIGNALS) body = sigDetail ? rSignalDetail(H) : rSignals(H);
    else if (tab === TAB.PORTFOLIO) body = rPortfolio(H);
    else if (tab === TAB.STATS) body = rStats(H);
    else body = rMyAgent(H);
    const bl = body.split('\n');
    while (bl.length < H) bl.push('');
    buf += bl.slice(0, H).join('\n') + '\n';
    buf += footer();
    wr('\x1b[?2026h' + buf.split('\n').map(l => clip(l, TW) + ESC + 'K').join('\n') + ESC + '0J');
    if (paletteMode) renderPalette();
    if (unlocking) renderUnlockOverlay();
    wr('\x1b[?2026l');
  }

  function renderPalette() {
    const actions = getActions().filter(a => !paletteQuery || a.name.toLowerCase().includes(paletteQuery.toLowerCase()));
    const maxShow = Math.min(10, Math.max(1, actions.length));
    const palW = Math.min(52, PW - 8);
    const ox = Math.max(2, ((TW - palW) / 2) | 0);
    const oy = Math.max(3, (TH / 2 - maxShow / 2) | 0);
    MV(ox, oy); wr(Pk('╔') + Pk('═'.repeat(palW - 2)) + Pk('╗'));
    MV(ox, oy + 1); wr(Pk('║') + ' ' + Wh('Command Palette') + ' '.repeat(Math.max(0, palW - 18)) + Pk('║'));
    MV(ox, oy + 2); wr(Pk('╠') + Pk('═'.repeat(palW - 2)) + Pk('╣'));
    MV(ox, oy + 3); wr(Pk('║') + ' ' + Pk('> ') + Tx(paletteQuery) + '█' + ' '.repeat(Math.max(0, palW - 5 - paletteQuery.length)) + Pk('║'));
    const start = Math.max(0, paletteSel - maxShow + 2);
    for (let i = 0; i < maxShow; i++) {
      const ai = start + i, a = actions[ai];
      MV(ox, oy + 4 + i);
      if (a) {
        const isSel = ai === paletteSel;
        const name = a.name.slice(0, palW - 10);
        const key = a.key ? Dm(a.key) : '';
        const line = `${isSel ? Pk(' ▸ ') : '   '}${isSel ? Wh(name) : Tx(name)}${' '.repeat(Math.max(0, palW - 7 - vlen(name) - vlen(key)))}${key}`;
        wr(Pk('║') + line + ' ' + Pk('║'));
      } else wr(Pk('║') + ' '.repeat(palW - 2) + Pk('║'));
    }
    MV(ox, oy + 4 + maxShow); wr(Pk('╚') + Pk('═'.repeat(palW - 2)) + Pk('╝'));
  }

  function renderUnlockOverlay() {
    const u = unlocking; if (!u) return;
    const spin = SPINNERS.dots[frame % SPINNERS.dots.length];
    const steps = [
      ['402 Payment Required', '$' + u.price + ' USDC to read this alpha'],
      ['Authorizing', (u.byAgent ? 'your agent signs the transfer → ' : 'signing the USDC transfer → ') + u.creator],
      ['Settling on Arc', 'x402 nanopayment · sub-second finality'],
      ['Unlocked', 'thesis revealed · ' + u.creator + ' paid' + (u.byAgent ? ' by your agent' : '')],
    ];
    const boxW = Math.min(60, TW - 6);
    const lines = [];
    lines.push(grad('⚡ x402 Nanopayment' + (u.byAgent ? ' · via your agent' : ''), { glow: (frame % 30) / 30 }));
    lines.push(di('─'.repeat(boxW - 2)));
    lines.push(Wh(u.title.slice(0, boxW - 4)));
    lines.push('');
    for (let i = 0; i < steps.length; i++) {
      const n = i + 1;
      let mark, lc;
      if (u.error && n >= u.step) { mark = n === u.step ? Rs('✗') : di('○'); lc = n === u.step ? rs : di; }
      else if (n < u.step) { mark = Em('✓'); lc = Tx; }
      else if (n === u.step) { mark = Pk(spin); lc = Wh; }
      else { mark = di('○'); lc = di; }
      lines.push(' ' + mark + '  ' + lc(steps[i][0]));
      if (n <= u.step && !(u.error && n === u.step) && steps[i][1]) lines.push('    ' + di(steps[i][1].slice(0, boxW - 8)));
    }
    if (u.error) { lines.push(''); lines.push(' ' + Rs('✗ ' + u.error.slice(0, boxW - 6))); }
    else if (u.step >= 4 && u.txId) { lines.push(''); lines.push(' ' + Dm('⛓ tx ') + cy(String(u.txId).slice(0, boxW - 9))); }
    const ox = Math.max(2, ((TW - boxW) / 2) | 0), oy = Math.max(2, ((TH - 14) / 2) | 0);
    MV(ox, oy); wr(Pk('╭') + Pk('─'.repeat(boxW - 2)) + Pk('╮'));
    for (let i = 0; i < lines.length; i++) { MV(ox, oy + 1 + i); const c = ' ' + lines[i]; wr(Pk('│') + c + ' '.repeat(Math.max(0, boxW - 2 - vlen(c))) + Pk('│')); }
    MV(ox, oy + 1 + lines.length); wr(Pk('╰') + Pk('─'.repeat(boxW - 2)) + Pk('╯'));
  }

  render(); // paint immediately so the screen is never blank while data loads
  loadAll().then(() => { loaded = true; render(); }, () => { loaded = true; render(); });
  recomputeSize();
  onResize = () => { recomputeSize(); sel = 0; scrollOff = 0; render(); };
  process.stdout.on('resize', onResize);
  animTimer = setInterval(() => { frame++; render(); }, 90);

  process.stdin.on('data', async key => {
    if (paletteMode) {
      if (key === '\x1b' || key === '\x03') { paletteMode = false; paletteQuery = ''; paletteSel = 0; render(); return; }
      if (key === '\x7f' || key === '\b') { paletteQuery = paletteQuery.slice(0, -1); paletteSel = 0; render(); return; }
      if (key === '\r') {
        const actions = getActions().filter(a => !paletteQuery || a.name.toLowerCase().includes(paletteQuery.toLowerCase()));
        if (actions[paletteSel]) { paletteMode = false; paletteQuery = ''; await actions[paletteSel].fn(); }
        render(); return;
      }
      if (key === '\x1b[A') { paletteSel = Math.max(0, paletteSel - 1); render(); return; }
      if (key === '\x1b[B') { paletteSel++; render(); return; }
      if (key.length === 1 && key >= ' ') { paletteQuery += key; paletteSel = 0; render(); return; }
      return;
    }

    if (key === '\x03') return quit();                                                     // Ctrl+C always quits
    if (key === '\x10') { paletteMode = true; paletteQuery = ''; paletteSel = 0; render(); return; }  // Ctrl+P palette
    if (key === '\t') { tab = (tab + 1) % tabs.length; sel = 0; scrollOff = 0; detailMarket = null; sigDetail = null; docScroll = 0; searching = false; render(); return; }
    if (key === '\x1b[Z') { tab = (tab + tabs.length - 1) % tabs.length; sel = 0; scrollOff = 0; detailMarket = null; sigDetail = null; docScroll = 0; searching = false; render(); return; }

    // ── Chat tab: keystrokes are the message input ──
    if (tab === TAB.CHAT || tab === TAB.MYAGENT) {
      const my = tab === TAB.MYAGENT;
      if (key === '\r') { my ? await sendMyAgent() : await sendChat(); return; }
      if (key === '\x7f' || key === '\b') { if (my) myInput = myInput.slice(0, -1); else chatInput = chatInput.slice(0, -1); render(); return; }
      if (key === '\x1b') { if (my) myInput = ''; else chatInput = ''; render(); return; }
      if (key.length === 1 && key >= ' ') { if (my) myInput += key; else chatInput += key; render(); return; }
      return;
    }

    // ── Markets search typing ──
    if (searching) {
      if (key === '\x1b') { searching = false; search = ''; sel = 0; scrollOff = 0; render(); return; }
      if (key === '\x7f' || key === '\b') { search = search.slice(0, -1); sel = 0; scrollOff = 0; render(); return; }
      if (key === '\r') { searching = false; render(); return; }
      if (key.length === 1 && key >= ' ') { search += key; sel = 0; scrollOff = 0; render(); return; }
      return;
    }

    if (key === 'q') return quit();
    if (key >= '1' && key <= '7') { tab = +key - 1; sel = 0; scrollOff = 0; detailMarket = null; sigDetail = null; docScroll = 0; render(); return; }
    if (key === 'r') { setStatus('Refreshing…'); render(); cacheClear(); await loadAll(); setStatus('Refreshed'); render(); return; }

    // ── Market detail sub-view ──
    if (tab === TAB.MARKETS && detailMarket) {
      if (buyMode) {
        if (key === '\x1b') { buyMode = null; setStatus(''); render(); return; }
        if (key === 'y' || key === '\x1b[D' || key === 'h') { buyMode.side = 'YES'; render(); return; }
        if (key === 'n' || key === '\x1b[C' || key === 'l') { buyMode.side = 'NO'; render(); return; }
        if (key === '\x7f' || key === '\b') { buyMode.amount = buyMode.amount.slice(0, -1); render(); return; }
        if ((key >= '0' && key <= '9') || key === '.') { buyMode.amount += key; render(); return; }
        if (key === '\r') { await execBuy(); return; }
        return;
      }
      if (key === '\x1b' || key === '\b' || key === '\x7f') { detailMarket = null; render(); return; }
      if (key === 'b') { buyMode = { side: 'YES', amount: '' }; setStatus('Buy: type amount · y/n side · Enter · Esc'); render(); return; }
      if (key === 'o') { openBrowser(WEB_BASE + '/m/' + (detailMarket.slug || '')); setStatus('Opening in browser…'); render(); return; }
      return;
    }

    if (tab === TAB.SIGNALS && sigDetail) {
      if (key === '\x1b' || key === '\b' || key === '\x7f') { sigDetail = null; docScroll = 0; render(); return; }
      if (key === '\x1b[A' || key === 'k') { docScroll = Math.max(0, docScroll - 1); render(); return; }
      if (key === '\x1b[B' || key === 'j') { docScroll++; render(); return; }
      if (key === 'o') { openBrowser(sigDetail.marketLink || (WEB_BASE + '/m/' + (sigDetail.marketSlug || ''))); setStatus('Opening prediction…'); render(); return; }
      if (key === 'c' && sigDetail.onchain && sigDetail.onchain.tx) { openBrowser(sigDetail.onchain.explorer || WEB_BASE); setStatus('Opening on-chain…'); render(); return; }
      return;
    }

    // ── Markets list ──
    if (tab === TAB.MARKETS) {
      const filt = search ? fuzzyFilter(markets, search, m => (m.question || '') + ' ' + (m.slug || '')) : markets;
      const maxVis = Math.max(2, Math.floor((TH - 7) / 3));
      if (key === '\x1b[A' || key === 'k') { sel = Math.max(0, sel - 1); if (sel < scrollOff) scrollOff = sel; render(); return; }
      if (key === '\x1b[B' || key === 'j') { sel = Math.min(filt.length - 1, sel + 1); if (sel >= scrollOff + maxVis) scrollOff = sel - maxVis + 1; render(); return; }
      if (key === '\r') { if (filt[sel]) { detailMarket = filt[sel]; render(); } return; }
      if (key === '/') { searching = true; search = ''; sel = 0; scrollOff = 0; render(); return; }
      if (key === 's') { const modes = ['volume', 'odds', 'newest']; sortMode = modes[(modes.indexOf(sortMode) + 1) % modes.length]; await loadData(); sel = 0; scrollOff = 0; setStatus('Sorted by ' + sortMode); render(); return; }
      return;
    }

    // ── Signals list ──
    if (tab === TAB.SIGNALS) {
      const list = sigView();
      const maxVis = Math.max(2, Math.floor((TH - 13) / 2));
      if (key === '\x1b[A' || key === 'k') { sel = Math.max(0, sel - 1); if (sel < scrollOff) scrollOff = sel; render(); return; }
      if (key === '\x1b[B' || key === 'j') { sel = Math.min(list.length - 1, sel + 1); if (sel >= scrollOff + maxVis) scrollOff = sel - maxVis + 1; render(); return; }
      if (key === 'b') { sigFilter = sigFilter === 'bought' ? 'all' : 'bought'; sel = 0; scrollOff = 0; setStatus(sigFilter === 'bought' ? 'Showing bought signals' : 'Showing all signals'); render(); return; }
      if (key === 'u') { await unlockSel(); return; }
      if (key === 'a') { await unlockSel('agent'); return; }
      if (key === '\r') { const cur = list[sel]; if (cur && cur.unlocked) { sigDetail = cur; docScroll = 0; render(); } else { await unlockSel(); } return; }
      return;
    }

    // ── Portfolio: sell / claim a position ──
    if (tabs[tab] === 'Portfolio') {
      const pos = (pfData && (pfData.positions || pfData.holdings)) || [];
      if (key === '\x1b[A' || key === 'k') { sel = Math.max(0, sel - 1); render(); return; }
      if (key === '\x1b[B' || key === 'j') { sel = Math.min(Math.max(0, pos.length - 1), sel + 1); render(); return; }
      if (key === 's') { await execSell(pos[sel]); return; }
      if (key === 'c') { await execClaim(pos[sel]); return; }
      return;
    }
  });
}


// ═══════════════════════════════════════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════════════════════════════════════

async function cmdLogin(arg) {
  TITLE('login');
  let k = arg || await prompt(`Paste your API key ${Dm('(app → Profile → API Keys)')}\n  ${Pk('key ›')} `);
  k = (k || '').trim();
  if (!k.startsWith('pk_')) { await toastErr("Expected pk_live_…"); ln(Dm('  Generate at ' + cy(WEB_BASE) + ' → Profile → API Keys.\n')); return; }
  const sp = spinner('verifying key', 'arc');
  try {
    const w = await api('/api/wallet/get-or-create', { method: 'POST', body: {}, key: k });
    sp.stop(); saveCfg({ ...loadCfg(), key: k });
    await toastOK('Key saved to ~/.puls/config.json');
    if (jsonOut(w)) return;
    if (w?.address) ln(walletCard(w));
    ln(`\n  ${Dm('Next:')} ${Pk('puls')} ${Dm('for the interactive terminal')}\n`);
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

function cmdLogout() { try { if (existsSync(CFG_FILE)) rmSync(CFG_FILE); } catch {} ln(Dm('  Logged out.')); }

async function cmdWhoami() {
  try {
    const sp = spinner('loading wallet', 'orbit');
    const w = await api('/api/wallet/get-or-create', { method: 'POST', body: {}, auth: true });
    sp.stop(); if (jsonOut(w)) return;
    ln(walletCard(w)); ln('');
  } catch (e) { await toastErr(e.message); }
}

async function cmdStats() {
  TITLE('stats');
  if (F.watch) { while (true) { try { CLS(); renderStats(await api('/api/stats')); ln(Dm('  live · 5s · ctrl+c')); } catch (e) { ln(er('  ' + e.message)); } await sleep(5000); } }
  const sp = spinner('fetching stats', 'grow');
  try { const s = await api('/api/stats'); sp.stop(); if (jsonOut(s)) return; renderStats(s); }
  catch (e) { sp.stop(); await toastErr(e.message); }
}

function renderStats(s) {
  const np = s.nanopayments && typeof s.nanopayments === 'object' ? s.nanopayments.count : s.nanopayments;
  header('Platform Dashboard', 'live metrics', '◈'); ln('');
  const deco = (seed) => {
    const chars = '▁▂▃▄▅▆▇█▇▆▅▄▃▂'; let s = '';
    for (let i = 0; i < 14; i++) { const v = Math.sin((seed + i) * 0.7) * 0.5 + 0.5; s += fg(...gradColor(i / 13)) + chars[(v * (chars.length - 1)) | 0]; }
    return s + RST;
  };
  const primary = [['Trades', fmt(s.trades), Pk], ['USDC Volume', '$' + fmt(s.volumeUsdc), Cy], ['Markets', fmt(s.marketsDeployed), Tx]];
  for (const [l, v, c] of primary) ln(`    ${Dm(l.padEnd(16))}  ${c(BD + v + RST)}  ${deco(l.length * 7)}`);
  ln('  ' + Dm('─'.repeat(PW)));
  const secondary = [['Agents', fmt(s.agents), Am], ['Agent trades', fmt(s.agentTrades), Am], ['Nanopayments', fmt(np), Tx], ['Wallets', fmt(s.users), Tx]];
  for (const [l, v, c] of secondary) ln(`    ${Dm(l.padEnd(16))}  ${c(v)}`);
  ln('');
}

async function cmdMarkets() {
  TITLE('markets');
  const sortMode = flag('sort'), limit = parseInt(flag('limit')) || (F.compact ? 20 : 12);
  const sp = spinner('loading markets', 'wave');
  try {
    let mkts = await fetchMarkets(Math.max(limit, 100));
    if (F.active) mkts = mkts.filter(m => (m.status || 'open').toLowerCase() === 'open');
    if (sortMode === 'vol' || sortMode === 'volume') mkts.sort((a, b) => (b.volumeUsdc ?? b.volume ?? 0) - (a.volumeUsdc ?? a.volume ?? 0));
    else if (sortMode === 'odds') mkts.sort((a, b) => (b.yesPrice ?? 0.5) - (a.yesPrice ?? 0.5));
    else if (sortMode === 'new' || sortMode === 'newest') mkts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    mkts = mkts.slice(0, limit);
    sp.stop(); if (jsonOut(mkts)) return;
    header('Live Markets', mkts.length + ' active' + (sortMode ? ' · sorted ' + sortMode : ''), '◆'); ln('');
    if (F.compact) {
      ln(`  ${Dm(padR('  #  Market', PW - 28))} ${Dm('Odds')}    ${Dm('Volume')}   ${Dm('Status')}`);
      ln('  ' + di('─'.repeat(PW)));
      for (let i = 0; i < mkts.length; i++) {
        const m = mkts[i], yes = m.yesPrice ?? m.priceYes ?? m.yes;
        const odds = yes != null ? Math.round(Number(yes) * 100) : null;
        const vol = m.volumeUsdc ?? m.volume;
        ln(`  ${Pk(String(i+1).padStart(3))}  ${padR(Tx((m.question||m.slug||'').slice(0,PW-34)),PW-34)} ${odds!==null?probColor(odds)(String(odds).padStart(3)+'¢'):di('  —')}   ${vol!=null?cy('$'+abbr(vol).padStart(6)):di('      —')}  ${statusBadge(m.status)}`);
      }
    } else {
      const barW = Math.min(28, (PW * 0.26) | 0);
      for (let i = 0; i < mkts.length; i++) {
        const m = mkts[i], yes = m.yesPrice ?? m.priceYes ?? m.yes;
        const odds = yes != null ? Math.round(Number(yes) * 100) : null;
        const vol = m.volumeUsdc ?? m.volume;
        ln(`  ${Pk(String(i+1).padStart(2))}  ${Tx((m.question||m.title||m.slug||'').slice(0,PW-10))}  ${statusBadge(m.status)}`);
        const fakeH = Array.from({length:16},(_,j)=>(odds??50)+Math.sin(j*0.8+i*1.3)*10);
        let meta = '      ' + di(m.slug||'');
        if (odds !== null) meta += '   ' + probBar(odds, barW) + ' ' + probColor(odds)(BD + odds + '¢' + RST);
        meta += '  ' + sparkMini(fakeH, 14);
        ln(meta);
        const sub = [];
        if (vol != null) sub.push(cy('$' + abbr(vol) + ' vol'));
        if (m.trades != null) sub.push(Dm(abbr(m.trades) + ' trades'));
        if (m.createdAt) sub.push(Dm(timeAgo(m.createdAt)));
        if (sub.length) ln('      ' + sub.join('  ·  '));
        if (IS_TTY && !F.na) await sleep(12);
      }
    }
    ln('\n  ' + rule(PW));
    ln(`  ${Dm('puls market <slug>  ·  puls search <term>  ·  puls watch <slug>  ·  puls — TUI')}\n`);
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdMarket(slug) {
  TITLE('market · ' + (slug || '—'));
  if (!slug) { ln(Dm('  Usage: puls market <market-slug>')); return; }
  const sp = spinner('loading market', 'pulse');
  try {
    let m;
    try { m = await api('/api/markets/' + encodeURIComponent(slug)); }
    catch {
      const ms = await fetchMarkets(200);
      m = ms.find(x => x.slug === slug || x.slug?.endsWith(slug));
      if (!m) {
        const close = fuzzyFilter(ms, slug, x => (x.slug||'') + ' ' + (x.question||'')).slice(0,3);
        sp.stop(); ln(Er('  Market not found: ' + slug));
        if (close.length) { ln(Dm('  Did you mean:')); close.forEach(c => ln('    ' + Pk(c.slug) + '  ' + Dm((c.question||'').slice(0,50)))); }
        ln(''); return;
      }
    }
    sp.stop(); if (jsonOut(m)) return;
    const yes = m.yesPrice ?? m.priceYes ?? m.yes;
    const odds = yes != null ? Math.round(Number(yes) * 100) : null;
    const vol = m.volumeUsdc ?? m.volume;
    const barW = Math.min(38, PW - 16);
    header(m.question || m.title || slug, statusBadge(m.status), '◆'); ln('');
    if (m.slug) ln('  ' + Dm('slug') + '      ' + Tx(m.slug));
    ln('');
    if (odds !== null) {
      ln('  ' + Dm('YES') + '  ' + probBar(odds, barW) + '  ' + probColor(odds)(BD + odds + '¢' + RST));
      ln('  ' + Dm(' NO') + '  ' + probBar(100 - odds, barW) + '  ' + probColor(100 - odds)(BD + (100 - odds) + '¢' + RST));
      ln('');
    }
    const ohlc = fakeOHLC(odds, 30);
    for (const cl of candlestick(ohlc, { w: Math.min(55, PW - 14), h: 6, axis: true, volBars: true })) ln(cl);
    ln('');
    const hist = ohlc.map(c => c.close);
    const lo = Math.min(...hist), hi = Math.max(...hist), change = hist[hist.length - 1] - hist[0];
    ln('  ' + sparkMini(hist, Math.min(48, PW - 20)) + '  ' + (change > 0 ? Em('+' + Math.round(change) + '¢') : change < 0 ? Er(Math.round(change) + '¢') : Dm('±0¢')) + '  ' + Dm('range ' + Math.round(lo) + '¢–' + Math.round(hi) + '¢'));
    ln('');
    const meta = [];
    if (vol != null) meta.push(['Volume', cy('$' + fmt(vol))]);
    if (m.trades != null) meta.push(['Trades', fmt(m.trades)]);
    if (m.createdAt) meta.push(['Created', Tx(new Date(m.createdAt).toLocaleDateString()) + ' ' + Dm('(' + timeAgo(m.createdAt) + ')')]);
    if (m.endDate) meta.push(['Closes', Tx(new Date(m.endDate).toLocaleDateString()) + ' ' + Dm('(' + timeAgo(m.endDate) + ')')]);
    if (m.resolution) meta.push(['Resolution', Tx(m.resolution)]);
    meta.forEach(([k, v]) => ln('  ' + Dm(k.padEnd(12)) + ' ' + v));
    ln('\n  ' + rule(PW));
    ln(`  ${Dm('puls oracle')} ${Pk(slug)} ${Dm('· puls watch')} ${Pk(slug)} ${Dm('· puls open')} ${Pk(slug)}\n`);
  } catch (e) { sp.stop(); await toastErr(e.message); }
}


async function cmdWatch(slug) {
  if (!slug) { ln(Dm('  Usage: puls watch <market-slug>')); return; }
  TITLE('watch · ' + slug);
  header('Live Tracker', 'ctrl+c to stop', '◈'); ln('');
  const history = [];
  const cleanup = () => { SC(); TITLE(''); ln(Dm('\n  stopped.\n')); process.exit(0); };
  process.on('SIGINT', cleanup);
  let rLines = 0, first = true, lastOdds = null;
  while (true) {
    try {
      const m = await api('/api/markets/' + encodeURIComponent(slug));
      const yes = m.yesPrice ?? m.priceYes ?? m.yes;
      const odds = yes != null ? Math.round(Number(yes) * 100) : null;
      if (odds !== null) history.push(odds);
      if (!first && rLines > 0) CU(rLines);
      const lines = [];
      const barW = Math.min(38, PW - 16);
      lines.push('  ' + Tx((m.question || slug).slice(0, PW - 4)));
      lines.push('  ' + di(m.slug || slug) + '  ' + statusBadge(m.status));
      lines.push('');
      if (odds !== null) {
        const diff = lastOdds !== null ? odds - lastOdds : 0;
        const ds = diff > 0 ? Em('+' + diff + '¢') : diff < 0 ? Er(diff + '¢') : Dm('  ±0');
        const r5 = history.slice(-5);
        const trend = r5.length > 1 ? r5[r5.length - 1] - r5[0] : 0;
        const ti = trend > 2 ? Em('↗') : trend < -2 ? Rs('↘') : Dm('→');
        lines.push('  ' + Dm('YES') + '  ' + probBar(odds, barW) + '  ' + probColor(odds)(BD + odds + '¢' + RST) + '  ' + ds + ' ' + ti);
        lines.push('  ' + Dm(' NO') + '  ' + probBar(100 - odds, barW) + '  ' + probColor(100 - odds)(BD + (100 - odds) + '¢' + RST));
        lastOdds = odds;
      }
      lines.push('');
      if (history.length >= 3) {
        for (const cl of lineChart(history, { w: Math.min(62, PW - 14), h: 4, axis: true, fill: true })) lines.push(cl);
        lines.push('');
        const lo = Math.min(...history), hi = Math.max(...history), ch = history[history.length - 1] - history[0];
        lines.push('  ' + sparkMini(history, 24) + '  ' + (ch > 0 ? Em('+' + ch + '¢') : ch < 0 ? Er(ch + '¢') : Dm('±0¢')) + '  ' + Dm('range ' + lo + '¢–' + hi + '¢ · ' + history.length + ' samples'));
        lines.push('');
      }
      const vol = m.volumeUsdc ?? m.volume;
      const sub = [];
      if (vol != null) sub.push(cy('$' + fmt(vol) + ' vol'));
      if (m.trades != null) sub.push(Tx(fmt(m.trades) + ' trades'));
      if (sub.length) lines.push('  ' + sub.join('  ·  '));
      lines.push('');
      lines.push('  ' + di(new Date().toLocaleTimeString('en', { hour12: false }) + ' · 3s'));
      lines.forEach(l => ln(l));
      rLines = lines.length; first = false;
    } catch (e) {
      if (!first) CU(rLines);
      ln(er('  ' + e.message + ' — retrying…')); rLines = 1;
    }
    await sleep(3000);
  }
}

async function cmdCompare(a, b) {
  if (!a || !b) { ln(Dm('  Usage: puls compare <slug-a> <slug-b>\n')); return; }
  TITLE(a + ' vs ' + b);
  const sp = spinner('loading', 'wave');
  try {
    const ms = await fetchMarkets(200);
    let mA = ms.find(m => m.slug === a || m.slug?.includes(a)) || await api('/api/markets/' + encodeURIComponent(a)).catch(() => null);
    let mB = ms.find(m => m.slug === b || m.slug?.includes(b)) || await api('/api/markets/' + encodeURIComponent(b)).catch(() => null);
    sp.stop();
    if (!mA) { await toastErr('Not found: ' + a); return; }
    if (!mB) { await toastErr('Not found: ' + b); return; }
    if (jsonOut([mA, mB])) return;
    header('Market Comparison', '', '◈'); ln('');
    const go = m => { const y = m.yesPrice ?? m.priceYes ?? m.yes; return y != null ? Math.round(Number(y) * 100) : null; };
    const oA = go(mA), oB = go(mB);
    const vA = mA.volumeUsdc ?? mA.volume ?? 0, vB = mB.volumeUsdc ?? mB.volume ?? 0;
    const tA = mA.trades ?? 0, tB = mB.trades ?? 0;
    const maxV = Math.max(vA, vB) || 1, maxT = Math.max(tA, tB) || 1;
    const cW = ((PW - 8) / 2) | 0;
    ln('  ' + Pk('◆ A') + ' ' + Tx((mA.question || a).slice(0, cW - 4)));
    ln('  ' + Pk('◆ B') + ' ' + Tx((mB.question || b).slice(0, cW - 4)));
    ln('  ' + di('─'.repeat(PW)));
    if (oA !== null && oB !== null) {
      ln('  ' + Dm('Odds A') + '  ' + probBar(oA, 30) + ' ' + probColor(oA)(oA + '¢'));
      ln('  ' + Dm('Odds B') + '  ' + probBar(oB, 30) + ' ' + probColor(oB)(oB + '¢'));
    }
    ln('  ' + Dm('Vol  A') + '  ' + hBar(vA, maxV, 30, cy) + ' ' + cy('$' + abbr(vA)));
    ln('  ' + Dm('Vol  B') + '  ' + hBar(vB, maxV, 30, cy) + ' ' + cy('$' + abbr(vB)));
    ln('  ' + Dm('#    A') + '  ' + hBar(tA, maxT, 30, pk) + ' ' + pk(abbr(tA)));
    ln('  ' + Dm('#    B') + '  ' + hBar(tB, maxT, 30, pk) + ' ' + pk(abbr(tB)));
    ln('');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdTop() {
  const sp = spinner('ranking', 'grow');
  try {
    let mkts = await fetchMarkets(200);
    mkts = mkts.filter(m => (m.status||'open').toLowerCase() === 'open');
    mkts.sort((a, b) => (b.volumeUsdc ?? b.volume ?? 0) - (a.volumeUsdc ?? a.volume ?? 0));
    const top = mkts.slice(0, 10);
    sp.stop(); if (jsonOut(top)) return;
    header('Top Markets', 'by volume · open only', '◆'); ln('');
    for (let i = 0; i < top.length; i++) {
      const m = top[i], yes = m.yesPrice ?? m.priceYes ?? m.yes;
      const odds = yes != null ? Math.round(Number(yes) * 100) : null;
      const vol = m.volumeUsdc ?? m.volume;
      const fakeH = Array.from({length:10},(_,j)=>(odds??50)+Math.sin(j*0.9+i)*8);
      ln(`  ${Pk(String(i+1).padStart(2))}  ${padR(Tx((m.question||m.slug||'').slice(0,PW-50)),PW-50)} ${odds!==null?probColor(odds)(BD+String(odds).padStart(3)+'¢'+RST):di('  —')}  ${sparkMini(fakeH,8)}  ${vol!=null?cy('$'+String(abbr(vol)).padStart(6)):di('      —')}  ${m.trades!=null?Tx(String(abbr(m.trades)).padStart(5)):di('    —')}`);
    }
    ln(`\n  ${rule(PW)}\n  ${Dm('puls market <slug> · puls watch <slug> · puls — TUI')}\n`);
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdSearch(term) {
  TITLE('search');
  if (!term) { ln(Dm('  Usage: puls search <term>\n')); return; }
  const sp = spinner('searching "' + term + '"', 'wave');
  try {
    const all = await fetchMarkets(200); sp.stop();
    const results = fuzzyFilter(all, term, m => (m.question||'') + ' ' + (m.title||'') + ' ' + (m.slug||''));
    if (jsonOut(results)) return;
    header('Search', '"' + term + '" · ' + results.length + ' result' + (results.length !== 1 ? 's' : ''), '◈'); ln('');
    if (!results.length) { ln(Dm('  No matches. Try ' + Pk('puls markets') + '.\n')); return; }
    const barW = Math.min(22, (PW * 0.30) | 0);
    for (const m of results.slice(0, 15)) {
      const yes = m.yesPrice ?? m.priceYes ?? m.yes;
      const odds = yes != null ? Math.round(Number(yes) * 100) : null;
      const vol = m.volumeUsdc ?? m.volume;
      ln('  ' + Pk('▸') + ' ' + fuzzyHighlight(term, (m.question || m.title || m.slug || '').slice(0, PW - 8)) + '  ' + statusBadge(m.status));
      let meta = '    ' + di(m.slug || '');
      if (odds !== null) meta += '   ' + probBar(odds, barW) + ' ' + probColor(odds)(odds + '¢');
      if (vol != null) meta += '   ' + cy('$' + abbr(vol));
      ln(meta);
    }
    if (results.length > 15) ln(Dm('  … and ' + (results.length - 15) + ' more'));
    ln('');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdFeed() {
  TITLE('live feed');
  const minAmt = parseFloat(flag('min')) || 0;
  header('Live Trade Feed', (minAmt > 0 ? 'min $' + minAmt + ' · ' : '') + 'ctrl+c to stop', '◈'); ln('');
  const ctrl = new AbortController(); let count = 0; const seen = new Set(); let first = true;
  const cleanup = () => { ctrl.abort(); SC(); TITLE(''); ln(Dm('\n  ' + count + ' trades captured.\n')); process.exit(0); };
  process.on('SIGINT', cleanup);
  async function tick() {
    if (ctrl.signal.aborted) return;
    try {
      const list = await api('/api/trade/recent?limit=20');
      for (const t of (Array.isArray(list) ? list : []).reverse()) {
        const id = t.tx_id || t.txId || `${t.question}-${t.usdc_amount}-${t.created_at}`;
        if (seen.has(id)) continue; seen.add(id);
        if (first) continue;
        const amt = Number(t.usdc_amount ?? t.amount ?? 0);
        if (amt < minAmt) continue;
        count++;
        const side = (t.side || '').toUpperCase();
        ln('  ' + di((timeAgo(t.created_at)||'—').padEnd(10)) + ' ' + (side === 'YES' ? Em : Rs)(side.padEnd(4)) + ' ' + cy('$' + fmt(amt).padStart(8)) + '  ' + Tx((t.question || '').slice(0, PW - 36)));
      }
      first = false;
    } catch {}
  }
  await tick(); first = false;
  const iv = setInterval(tick, 4000);
  ctrl.signal.addEventListener('abort', () => clearInterval(iv));
  await new Promise(() => {});
}

async function cmdOracle(slug) {
  TITLE('oracle · ' + (slug || '—'));
  if (!slug) { ln(Dm('  Usage: puls oracle <market-slug>\n')); return; }
  const sp = spinner('consulting the AI swarm', 'orbit');
  try {
    const o = await api('/api/oracle/' + encodeURIComponent(slug));
    sp.stop(); if (jsonOut(o)) return;
    const ai = Math.round((o.aiYes ?? o.ai ?? 0) * 100);
    const crowd = Math.round((o.crowdYes ?? o.crowd ?? 0) * 100);
    const delta = ai - crowd, absD = Math.abs(delta);
    const barW = Math.min(34, PW - 20);
    header('AI Oracle', slug, '◈'); ln('');
    if (IS_TTY) {
      const N = 3; for (let i = 0; i < N; i++) ln('');
      const dur = 800, t0 = Date.now();
      while (true) {
        const t = clp((Date.now() - t0) / dur);
        const ease = 1 - Math.pow(1 - t, 3);
        const aN = Math.round(ai * ease), cN = Math.round(crowd * ease);
        CU(N); for (let i = 0; i < N; i++) { CL(); wr('\n'); } CU(N);
        ln('  ' + Dm('AI swarm') + '  ' + probBar(aN, barW) + '  ' + probColor(aN)(BD + aN + '%' + RST));
        ln('  ' + ' '.repeat(11) + (absD > 0 ? (delta > 0 ? Em : Rs)(BD + (delta > 0 ? '+' : '') + delta + '%' + RST) : Am(BD + '≈ aligned' + RST)));
        ln('  ' + Dm('  Crowd') + '  ' + probBar(cN, barW) + '  ' + probColor(cN)(BD + cN + '%' + RST));
        if (t >= 1) break;
        await sleep(16);
      }
    } else {
      ln('  ' + Dm('AI swarm') + '  ' + probBar(ai, barW) + '  ' + ai + '%');
      ln('  ' + Dm('  Crowd') + '  ' + probBar(crowd, barW) + '  ' + crowd + '%');
    }
    ln('');
    let verdict, vc;
    if (absD < 3)       { verdict = 'AI and crowd are in strong agreement'; vc = Am; }
    else if (absD < 8)  { verdict = `AI is ${absD}% ${delta > 0 ? 'more bullish' : 'more bearish'} — mild divergence`; vc = Am; }
    else if (delta > 0) { verdict = `AI is ${delta}% more bullish than the crowd`; vc = Em; }
    else                { verdict = `AI is ${absD}% more bearish than the crowd`; vc = Rs; }
    ln('  ' + vc(BD + '◆ ' + verdict + RST));
    if (o.reasoning || o.summary) {
      ln(''); ln('  ' + Dm('Reasoning:'));
      const text = o.reasoning || o.summary || '';
      const words = text.split(' '), lineLen = PW - 6;
      let line = '  ';
      for (const w of words) { if (vlen(line + w) > lineLen) { ln(line); line = '    ' + w + ' '; } else line += w + ' '; }
      if (line.trim()) ln(line);
    }
    ln('');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}


async function cmdAgents() {
  TITLE('agents');
  const sp = spinner('loading the agent swarm', 'orbit');
  try {
    const [house, roster] = await Promise.all([
      api('/api/agents/house').catch(() => null),
      api('/api/agents/roster').catch(() => null),
    ]);
    sp.stop();
    if (jsonOut({ house, roster })) return;
    header('Agent Swarm', 'autonomous · on-chain', '◆'); ln('');

    if (house) {
      const pulse = house.agent || house.pulse;
      const sage = house.sage;
      ln('  ' + Wh('House agents'));
      if (pulse) ln(`    ${Pk('🤖 Pulse')} ${Dm('trader')}   ${pulse.balance != null ? cy('$' + usd(pulse.balance) + ' USDC') : ''}  ${pulse.reputation != null ? Dm('rep ' + pulse.reputation) : ''}`);
      if (sage) {
        const sig = sage.signal || {};
        ln(`    ${Pk('✍️  Sage')} ${Dm('creator')}   ${sage.balance != null ? cy('$' + usd(sage.balance) + ' USDC') : ''}  ${sig.revenueUsdc != null ? Em('earned $' + usd(sig.revenueUsdc)) : ''}`);
      }
      const decisions = house.decisions || [];
      if (decisions.length) {
        ln(''); ln('  ' + Dm('Pulse · recent decisions'));
        for (const d of decisions.slice(0, 5)) {
          const go = d.action === 'go';
          const act = go ? Em((d.side || 'BUY').padEnd(4)) : Am('HOLD');
          ln(`    ${act} ${d.amount ? cy('$' + usd(d.amount) + ' ') : ''}${Tx((d.question || '').slice(0, PW - 22))}`);
          if (d.reasoning) ln('      ' + Dm(String(d.reasoning).slice(0, PW - 8)));
        }
      }
    }

    const agents = Array.isArray(roster) ? roster : (roster?.agents || roster?.roster || roster?.swarm || []);
    if (agents.length) {
      ln(''); ln('  ' + Wh('The swarm') + Dm('  ' + agents.length + ' agents'));
      for (const a of agents.slice(0, 12)) {
        const name = a.name || a.displayName || a.userId || 'agent';
        const bal = a.balance ?? a.usdcBalance;
        const rep = a.reputation ?? a.rep ?? a.reputationScore;
        const last = a.lastAction || a.action || (a.decisions && a.decisions[0] && a.decisions[0].action);
        ln(`    ${Pk('•')} ${Tx(String(name).padEnd(10))} ${bal != null ? cy('$' + usd(bal).padStart(6)) : di('     —')}  ${rep != null ? Dm('rep ' + rep) : ''}  ${last ? Dm(String(last)) : ''}`);
      }
    }

    if (!house && !agents.length) ln('  ' + Dm('No agent data available right now.'));
    ln('\n  ' + rule(PW));
    ln('  ' + Dm('Live agent feed: ') + cy('pulsmarket.tech/pulse') + Dm(' · humans vs AI: ') + cy('pulsmarket.tech/versus'));
    ln('');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

// ── Creator economy + portfolio + AI copilot ────────────────────────────────

function creatorName(uid = '') {
  uid = String(uid);
  const map = {
    agent_sage: 'Sage ✍️', agent_pulse: 'Pulse 🤖',
    agent_swarm_striker: 'Striker ⚽', agent_swarm_nova: 'Nova 🌐', agent_swarm_atlas: 'Atlas 📈',
    agent_swarm_vega: 'Vega ⚡', agent_swarm_cygnus: 'Cygnus 🛡️', agent_swarm_orion: 'Orion 🔭',
  };
  if (map[uid]) return map[uid];
  const sw = uid.match(/agent_swarm_(\w+)/);
  if (sw) return sw[1][0].toUpperCase() + sw[1].slice(1);
  if (/^agent/i.test(uid)) return 'Agent';
  if (uid.startsWith('supabase_')) return 'trader ' + uid.slice(9, 13);
  if (uid.startsWith('eth_') || uid.startsWith('0x')) return uid.replace('eth_', '').slice(0, 8) + '…';
  return uid.slice(0, 12) || 'anon';
}

async function x402Step(label, text) {
  ln('  ' + label + '  ' + Dm(text));
  if (IS_TTY && !F.na) await sleep(450);
}

function wrapText(s, w, indent = '  ') {
  const out = [];
  for (const para of String(s).split(/\n+/)) {
    let cur = indent;
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (vlen(cur) + vlen(word) + 1 > w && cur !== indent) { out.push(cur); cur = indent + word; }
      else cur += (cur === indent ? '' : ' ') + word;
    }
    if (cur.trim()) out.push(cur);
  }
  return out;
}

async function cmdPortfolio() {
  TITLE('portfolio');
  if (!(await checkLogin())) return;
  const sp = spinner('loading your positions', 'orbit');
  try {
    const d = await api('/api/portfolio', { auth: true });
    sp.stop();
    if (jsonOut(d)) return;
    const positions = d.positions || d.holdings || (Array.isArray(d) ? d : []);
    const open = positions.filter(p => !p.resolved);
    header('Your Portfolio', open.length + ' open · ' + positions.length + ' total', '◆'); ln('');
    const totalSpent = d.totalSpent ?? d.investedUsdc ?? d.costUsdc;
    if (totalSpent != null) { ln('  ' + Dm('invested ') + Cy('$' + usd(totalSpent)) + Dm('  across ' + positions.length + ' positions')); ln('  ' + rule(PW)); ln(''); }
    if (!positions.length) {
      ln('  ' + Dm('No positions yet. Browse ') + Pk('puls markets') + Dm(' and trade in the app.'));
    } else {
      const lim = parseInt(flag('limit')) || 24;
      for (const p of positions.slice(0, lim)) {
        const side = String(p.side || '').toUpperCase();
        const sideC = side === 'YES' ? Em : side === 'NO' ? Rs : Tx;
        const status = p.claimed ? di('claimed') : p.resolved ? ((!!p.outcome === (side === 'YES')) ? Em('won') : rs('lost')) : am('open');
        ln(`  ${sideC((side || '·').padEnd(3))} ${Tx(String(p.question || p.slug || '').slice(0, PW - 24))} ${p.owner === 'agent' ? di('🤖') : ''}`);
        const meta = [];
        if (p.shares != null) meta.push(Dm(abbr(p.shares) + ' sh'));
        if (p.entryPrice != null) meta.push(Dm('@ ' + Math.round(Number(p.entryPrice) * 100) + '¢'));
        if (p.usdcAmount != null) meta.push(cy('$' + usd(p.usdcAmount) + ' cost'));
        meta.push(status);
        ln('       ' + meta.join('  ·  '));
      }
      if (positions.length > lim) ln('\n  ' + Dm('… +' + (positions.length - lim) + ' more — use --limit N'));
    }
    ln('\n  ' + rule(PW));
    ln('  ' + Dm('puls wallet  ·  puls markets  ·  puls feed') + '\n');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdSignals() {
  TITLE('signals');
  const sp = spinner('loading the alpha marketplace', 'orbit');
  try {
    const d = await api('/api/signals', loadCfg().key ? { auth: true } : {});
    sp.stop();
    const list = d.signals || (Array.isArray(d) ? d : []);
    if (jsonOut(d)) return;
    header('Alpha Marketplace', list.length + ' signals · ' + (d.live ? 'x402 live' : 'demo'), '◆'); ln('');
    if (!list.length) { ln('  ' + Dm('No signals published yet.')); return; }
    const lim = parseInt(flag('limit')) || 12;
    list.slice(0, lim).forEach((s, i) => {
      const lock = s.unlocked ? Em('🔓 open') : pk('🔒 locked');
      const conf = s.confidence != null ? Math.round(s.confidence * 100) + '%' : '—';
      const tr = s.creatorTrackRecord || {};
      const rec = tr.winRate != null ? Math.round(tr.winRate * 100) + '% WR' : (tr.published ? tr.published + ' pub' : 'new');
      ln(`  ${Pk(String(i + 1).padStart(2))}  ${Wh((s.title || '').slice(0, PW - 18))}   ${lock}`);
      ln('      ' + [Cy('$' + micro(s.priceUsdc)), Dm('by ' + creatorName(s.creatorUserId)), Dm('conf ' + conf), Dm((s.edgeBps || 0) + 'bps edge'), Dm(rec)].join('  ·  '));
      let l3 = '      ' + di('id ' + String(s.id).slice(0, 8));
      if (s.sourcesCount) l3 += '  ' + Dm(s.sourcesCount + ' sources');
      if (s.bond) l3 += '  ' + am('◆ bond $' + usd(s.bond.amountUsdc) + ' ' + s.bond.status);
      if (s.onchain?.tx) l3 += '  ' + vt('⛓ on-chain');
      ln(l3);
      if (s.marketQuestion) ln('      ' + Dm('"' + s.marketQuestion.slice(0, PW - 12) + '"'));
      ln('');
    });
    ln('  ' + rule(PW));
    ln('  ' + Dm('Unlock the full thesis — pays the creator in USDC via x402:  ') + Pk('puls unlock <id>') + '\n');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdUnlock(id) {
  TITLE('unlock');
  if (!id) { ln(Dm('\n  Usage: ') + Pk('puls unlock <signal-id>') + Dm('   (get ids from ') + Pk('puls signals') + Dm(')\n')); return; }
  if (!(await checkLogin())) return;
  let sig = null;
  try {
    const d = await api('/api/signals', { auth: true });
    sig = (d.signals || []).find(s => s.id === id || String(s.id).startsWith(id));
    if (sig) id = sig.id;
  } catch {}
  header('Unlock Alpha', 'x402 nanopayment on Arc', '🔓'); ln('');
  if (sig) {
    ln('  ' + Wh(sig.title));
    if (sig.marketQuestion) ln('  ' + Dm('"' + sig.marketQuestion + '"'));
    ln('  ' + Dm('by ') + Am(creatorName(sig.creatorUserId)) + (sig.onchain?.tx ? Dm('   ⛓ ') + di(sig.onchain.tx.slice(0, 14) + '…') : ''));
    ln('');
  }
  const byAgent = has('--agent');
  const price = sig ? micro(sig.priceUsdc) : '0.001';
  const creator = sig ? creatorName(sig.creatorUserId) : 'the creator';
  await x402Step(Rs('● HTTP 402'), 'Payment Required — $' + price + ' USDC to unlock');
  await x402Step(am('● x402 '), (byAgent ? 'your agent authorizes USDC → ' : 'authorizing USDC transfer → ') + creator);
  await x402Step(am('● Arc  '), 'settling the nanopayment on-chain…');
  const sp = spinner('confirming settlement', 'arc');
  try {
    const r = await api('/api/signals/' + encodeURIComponent(id) + '/unlock', { method: 'POST', body: byAgent ? { payer: 'agent' } : {}, auth: true });
    sp.stop();
    if (jsonOut(r)) return;
    const s = r.signal || sig || {};
    if (r.ok === false && r.live === false) {
      ln('  ' + Am('◆ demo mode') + Dm(' — live payments activate at launch; the 402 + on-chain attestation are real.'));
    } else if (r.alreadyUnlocked) {
      ln('  ' + Em('✓ already unlocked') + Dm(' — no charge.'));
    } else {
      ln('  ' + Em('✓ x402 payment settled') + Dm('  ·  $' + price + ' USDC → ' + creator));
    }
    ln('');
    if (s.stance) ln('  ' + Dm('The call:  ') + (s.stance === 'YES' ? Em('▲ YES') : Rs('▼ NO')) + Dm('   confidence ') + Wh(Math.round((s.confidence || 0) * 100) + '%') + Dm('   edge ') + Wh((s.edgeBps || 0) + 'bps'));
    if (s.thesis) { ln(''); ln('  ' + Dm('Thesis')); wrapText(s.thesis, PW - 2, '  ').forEach(l => ln(tx(l))); }
    else if (r.ok === false) ln('  ' + Dm('(thesis stays hidden — ' + (r.message || 'unlock not completed') + ')'));
    if (s.sources?.length) {
      ln(''); ln('  ' + Dm('Sources (' + s.sources.length + ')'));
      s.sources.forEach(src => ln('   ' + cy('•') + ' ' + Tx(String(src.title || src.url || '').slice(0, PW - 10)) + (src.url ? Dm('  ' + String(src.url).slice(0, 44)) : '')));
    }
    if (s.onchain?.explorer || s.onchain?.tx) { ln(''); ln('  ' + Dm('⛓ content attestation: ') + cy(s.onchain.explorer || ('tx ' + s.onchain.tx))); }
    if (r.txId || r.payment?.tx) ln('  ' + Dm('💸 payment tx: ') + cy(String(r.txId || r.payment.tx)));
    ln('\n  ' + rule(PW)); ln('');
  } catch (e) {
    sp.stop();
    if (/Insufficient/i.test(e.message)) { ln('  ' + Er('✗ ' + e.message)); ln('  ' + Dm('Top up testnet USDC at ') + cy('faucet.circle.com') + Dm(' (Arc Testnet).') + '\n'); }
    else await toastErr(e.message);
  }
}

async function cmdStreams(arg) {
  TITLE('streams');
  const sp = spinner('loading streams', 'orbit');
  try {
    const [cfg, sum] = await Promise.all([
      api('/api/streams/config').catch(() => null),
      api('/api/streams/stats/summary').catch(() => null),
    ]);
    sp.stop();
    if (jsonOut({ config: cfg, summary: sum })) return;
    header('Puls Streams', 'pay-per-second on Arc · ' + (cfg && cfg.live ? 'x402 live' : 'demo'), '◆'); ln('');
    if (cfg) {
      ln('  ' + Dm('model     ') + Wh(String(cfg.model || 'pay-per-second').slice(0, PW - 12)));
      ln('  ' + Dm('network   ') + Tx(String(cfg.network || '')) + Dm('  · settle @ ') + Cy('$' + cfg.settleThresholdUsdc));
      ln('  ' + Dm('flow      ') + Dm('continuous authorization (rate+cap) · proof-of-flow auto-pause after ') + Tx(cfg.staleSec + 's idle'));
      ln('');
    }
    if (sum) {
      ln('  ' + Dm('streams   ') + Wh(String(sum.totalStreams)) + Dm('  · active ') + Em(String(sum.active)));
      ln('  ' + Dm('streamed  ') + Cy('$' + (sum.streamedUsdc ?? 0)) + Dm('  · settled ') + Em('$' + (sum.settledUsdc ?? 0)) + Dm(' on-chain'));
      ln('');
    }
    if (arg) {
      const d = await api('/api/streams?userId=' + encodeURIComponent(arg)).catch(() => null);
      const list = (d && d.streams) || [];
      ln('  ' + rule(PW));
      ln('  ' + Dm('streams for ' + arg + ':')); ln('');
      if (!list.length) { ln('  ' + Dm('  none yet.') + '\n'); }
      else list.slice(0, 12).forEach((s, i) => {
        const st = s.status === 'active' ? Em('● active') : s.status === 'paused' ? Am('⏸ paused') : Dm('■ stopped');
        ln('  ' + Pk(String(i + 1).padStart(2)) + '  ' + st + '  ' + Cy('$' + s.ratePerSecUsdc + '/s') + Dm(' cap $' + s.capUsdc) + '  ' + Dm('streamed ') + Wh('$' + s.accruedUsdc) + Dm(' · settled ') + Em('$' + s.settledUsdc));
        if (s.resource) ln('      ' + Dm(String(s.resource).slice(0, PW - 8)));
      });
      ln('');
    }
    ln('  ' + rule(PW));
    ln('  ' + Dm('Authorize a rate, settle by the second on Arc.  ') + Pk('puls streams <userId>') + Dm(' lists a wallet\'s streams.') + '\n');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdChat(rest) {
  TITLE('copilot');
  if (!(await checkLogin())) return;
  header('AI Trading Copilot', 'grounded in live web research', '◆');
  ln('  ' + Dm('Ask about any market or prediction. Type ') + Pk('exit') + Dm(' to leave.') + '\n');
  async function ask(message) {
    const sp = spinner('researching the open web + reasoning', 'orbit');
    try {
      const r = await api('/api/copilot/chat', { method: 'POST', body: { message }, auth: true });
      sp.stop();
      const reply = String(r.reply || '(no reply)').replace(/\*([^*]+)\*/g, (_, t) => BD + t + RST);
      ln('  ' + Pk('◆ Copilot'));
      wrapText(reply, PW - 2, '  ').forEach(l => ln(Tx(l)));
      if (r.sources?.length) {
        ln(''); ln('  ' + Dm('sources:'));
        r.sources.forEach(s => ln('   ' + cy('•') + ' ' + Dm(String(s.title || s.url || '').slice(0, PW - 10))));
      }
      ln('');
    } catch (e) { sp.stop(); await toastErr(e.message); }
  }
  const oneShot = (rest || '').trim();
  if (oneShot) { await ask(oneShot); return; }
  if (!IS_TTY) { ln(Dm('  Pipe a question:  puls chat "will BTC hold $90k this quarter?"') + '\n'); return; }
  while (true) {
    const q = await prompt('  ' + Cy('you ›') + ' ');
    const t = (q || '').trim();
    if (!t) continue;
    if (['exit', 'quit', ':q'].includes(t.toLowerCase())) { ln(Dm('\n  bye.\n')); break; }
    await ask(t);
  }
}

async function cmdLeaderboard() {
  TITLE('leaderboard');
  const sp = spinner('loading leaderboard', 'orbit');
  try {
    const d = await api('/api/leaderboard');
    sp.stop();
    const list = Array.isArray(d) ? d : (d.leaderboard || d.entries || d.traders || []);
    if (jsonOut(d)) return;
    header('Leaderboard', 'top traders & agents', '◆'); ln('');
    if (!list.length) { ln('  ' + Dm('No leaderboard data.')); return; }
    const lim = parseInt(flag('limit')) || 15;
    list.slice(0, lim).forEach((e, i) => {
      const rank = e.rank || i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : di(String(rank).padStart(2));
      const uid = e.userId || e.user_id || '';
      const isAgent = e.isAgent || /agent/i.test(uid);
      const name = e.username || e.displayName || e.name || creatorName(uid);
      const pnl = e.pnlUsdc ?? e.pnl ?? e.profit ?? e.profitUsdc;
      const vol = e.volumeUsdc ?? e.volume;
      const wr = e.winRate != null ? Math.round(e.winRate <= 1 ? e.winRate * 100 : e.winRate) + '%' : null;
      const trades = e.trades ?? e.tradeCount ?? e.tradesCount;
      let line = `  ${medal}  ${(isAgent ? Am : Wh)(String(name || '—').slice(0, 20).padEnd(20))}`;
      if (pnl != null) line += '  ' + (Number(pnl) >= 0 ? Em('+$' + usd(pnl)) : Rs('-$' + usd(Math.abs(pnl))));
      if (vol != null) line += '  ' + cy('$' + abbr(vol));
      if (wr) line += '  ' + Dm(wr + ' WR');
      if (trades != null) line += '  ' + di(abbr(trades) + ' trades');
      if (isAgent) line += ' ' + di('🤖');
      ln(line);
    });
    ln('\n  ' + rule(PW)); ln('');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdAlert(slug, direction, threshold) {
  if (!slug || !direction || !threshold) {
    ln(Dm('  Usage: puls alert <slug> up|down <¢>'));
    ln(Dm('  Example: ') + Pk('puls alert will-trump-2028 up 60') + '\n');
    return;
  }
  const d = direction.toLowerCase();
  if (d !== 'up' && d !== 'down') { ln(er('  Direction must be up or down.\n')); return; }
  const thresh = parseInt(threshold);
  if (isNaN(thresh) || thresh < 1 || thresh > 99) { ln(er('  Threshold must be 1-99¢.\n')); return; }
  const alerts = loadAlerts();
  alerts.push({ slug, direction: d === 'up' ? 'above' : 'below', threshold: thresh, createdAt: new Date().toISOString() });
  saveAlerts(alerts);
  await toastOK(`Alert: ${slug} ${d === 'up' ? '≥' : '≤'} ${thresh}¢`);
  BEL();
}

function cmdAlerts() {
  const alerts = loadAlerts();
  if (jsonOut(alerts)) return;
  header('Price Alerts', alerts.length + ' active', '◆'); ln('');
  if (!alerts.length) { ln(Dm('  No alerts. Usage: ') + Pk('puls alert <slug> up|down <¢>') + '\n'); return; }
  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i];
    ln(`  ${Dm(String(i+1).padStart(2))}  ${(a.direction==='above'?Em:Rs)(a.direction==='above'?'↑':'↓')} ${Tx(a.slug)}  ${Dm(a.direction)} ${Pk(a.threshold+'¢')}  ${di(timeAgo(a.createdAt))}`);
  }
  ln('');
}

function cmdOpen(slug) {
  if (!slug) { ln(Dm('  Usage: puls open <market-slug>\n')); return; }
  const url = WEB_BASE + '/markets/' + slug;
  openBrowser(url);
  ln(Em('  Opening ') + cy(url));
  if (copyToClip(url)) ln(Dm('  (URL copied to clipboard)'));
}

function cmdTheme(name) {
  if (!name) {
    header('Themes', Object.keys(THEMES).length + ' available', '◈'); ln('');
    for (const [k, v] of Object.entries(THEMES)) {
      const active = k === (loadCfg().theme || 'puls');
      const preview = v.pal.map(c => fg(...c) + '●').join('') + RST;
      ln(`  ${active ? Pk('▸ ') : '  '}${active ? Wh(v.name) : Tx(v.name)}  ${preview}  ${Dm(v.desc)}  ${active ? Em('(active)') : Dm(k)}`);
    }
    ln(`\n  ${Dm('Switch with:')} ${Pk('puls theme <name>')}\n`);
    return;
  }
  const key = name.toLowerCase();
  if (!THEMES[key]) { ln(Er('  Unknown theme: ' + name)); ln(Dm('  Available: ' + Object.keys(THEMES).join(', ')) + '\n'); return; }
  applyTheme(key);
  ln(Em('  Theme: ') + Wh(THEMES[key].name) + ' ' + Dm('— ' + THEMES[key].desc));
  let preview = '  ';
  for (let i = 0; i < 30; i++) preview += fg(...gradColor(i / 29)) + '█';
  ln(preview + RST + '\n');
}

function cmdCalc(odds, bet) {
  const o = parseFloat(odds), b = parseFloat(bet);
  if (isNaN(o) || isNaN(b) || o <= 0 || o >= 100 || b <= 0) {
    ln(Dm('  Usage: puls calc <odds-in-cents> <bet-in-dollars>'));
    ln(Dm('  Example: ') + Pk('puls calc 65 100') + Dm(' — $100 bet at 65¢') + '\n');
    return;
  }
  const prob = o / 100;
  const yesPayout = b / prob, yesProfit = yesPayout - b;
  const noPayout = b / (1 - prob), noProfit = noPayout - b;
  const ev = prob * yesProfit - (1 - prob) * b;
  header('Bet Calculator', '', '◈'); ln('');
  ln(`  ${Dm('Market odds')}    ${probColor(o)(o + '¢')}  ${probBar(o, 30)}`);
  ln(`  ${Dm('Bet size')}       ${Cy('$' + fmt(b))}`);
  ln('');
  ln(`  ${Pk('If YES wins:')}`);
  ln(`    ${Dm('Payout')}       ${Em('$' + yesPayout.toFixed(2))}  ${Dm('(+$' + yesProfit.toFixed(2) + ' profit)')}`);
  ln('');
  ln(`  ${Pk('If NO wins:')}`);
  ln(`    ${Dm('Payout')}       ${Em('$' + noPayout.toFixed(2))}  ${Dm('(+$' + noProfit.toFixed(2) + ' profit)')}`);
  ln('');
  ln(`  ${Dm('Expected value')}  ${ev >= 0 ? Em('+$' + ev.toFixed(2)) : Rs('-$' + Math.abs(ev).toFixed(2))}  ${Dm(ev >= 0 ? '(+EV — favorable)' : '(-EV — unfavorable)')}`);
  ln(`  ${Dm('Implied prob')}   ${Tx(o.toFixed(1) + '%')}`);
  ln('');
}

async function cmdHeatmap() {
  TITLE('heatmap');
  const sp = spinner('loading market data', 'wave');
  try {
    let mkts = await fetchMarkets(200);
    mkts = mkts.filter(m => (m.status || 'open').toLowerCase() === 'open');
    mkts.sort((a, b) => (b.volumeUsdc ?? b.volume ?? 0) - (a.volumeUsdc ?? a.volume ?? 0));
    const top = mkts.slice(0, 40);
    sp.stop(); if (jsonOut(top)) return;
    header('Market Heatmap', top.length + ' markets by volume', '◈'); ln('');
    const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(top.length))));
    const cellW = Math.floor((PW - 4) / cols);
    for (let i = 0; i < top.length; i += cols) {
      let row = '  ';
      for (let j = 0; j < cols; j++) {
        const m = top[i + j];
        if (!m) { row += ' '.repeat(cellW); continue; }
        const yes = m.yesPrice ?? m.priceYes ?? m.yes;
        const odds = yes != null ? Math.round(Number(yes) * 100) : 50;
        const [r, g, b] = gradColor(clp(odds / 100));
        const block = bg(r, g, b) + fg(r > 150 ? 20 : 240, g > 150 ? 20 : 240, b > 150 ? 20 : 240) + BD;
        const label = (m.question || m.slug || '?').slice(0, cellW - 6).padEnd(cellW - 6);
        const oddsStr = (odds + '¢').padStart(4);
        row += block + ' ' + label + ' ' + oddsStr + ' ' + RST;
      }
      ln(row);
    }
    ln('');
    ln(`  ${Dm('color: ')}${fg(...gradColor(0))}■${RST} ${Dm('low')}  ${fg(...gradColor(0.5))}■${RST} ${Dm('mid')}  ${fg(...gradColor(1))}■${RST} ${Dm('high')}`);
    ln('');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdHistory(slug) {
  TITLE('history · ' + (slug || '—'));
  if (!slug) { ln(Dm('  Usage: puls history <market-slug>\n')); return; }
  const sp = spinner('loading price history', 'pulse');
  try {
    let m;
    try { m = await api('/api/markets/' + encodeURIComponent(slug)); }
    catch { throw new Error('Market not found: ' + slug); }
    sp.stop();
    const yes = m.yesPrice ?? m.priceYes ?? m.yes;
    const odds = yes != null ? Math.round(Number(yes) * 100) : null;
    header('Price History', m.question || slug, '◈'); ln('');
    const ohlc = fakeOHLC(odds, 40);
    for (const cl of candlestick(ohlc, { w: Math.min(60, PW - 14), h: 8, axis: true, volBars: true })) ln(cl);
    ln('');
    const closes = ohlc.map(c => c.close);
    const hi = Math.max(...ohlc.map(c => c.high)), lo = Math.min(...ohlc.map(c => c.low));
    const ch = closes[closes.length - 1] - closes[0];
    const avg = Math.round(closes.reduce((a, b) => a + b, 0) / closes.length);
    ln('  ' + sparkMini(closes, Math.min(50, PW - 20)) + '  ' + (ch > 0 ? Em('+' + Math.round(ch) + '¢') : ch < 0 ? Er(Math.round(ch) + '¢') : Dm('±0¢')));
    ln('');
    ln(`  ${Dm('High')}  ${Am('$' + hi.toFixed(1))}   ${Dm('Low')}  ${Am('$' + lo.toFixed(1))}   ${Dm('Avg')}  ${Tx('$' + avg)}   ${Dm('Change')}  ${ch >= 0 ? Em('+' + ch.toFixed(1)) : Rs(ch.toFixed(1))}`);
    ln('');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdDoctor() {
  header('Diagnostics', '', '◈'); ln('');
  const cfg = loadCfg();
  const checks = [
    ['Config file', existsSync(CFG_FILE) ? ['✓', Em] : ['✗', Er]],
    ['API key', cfg.key ? ['✓ ' + cfg.key.slice(0, 12) + '…', Em] : ['missing', Rs]],
    ['Theme', [T.name, Tx]],
  ];
  const sp = spinner('testing API', 'arc');
  try { await api('/api/stats'); sp.stop(); checks.push(['API reachability', ['✓', Em]]); }
  catch (e) { sp.stop(); checks.push(['API reachability', ['✗ ' + e.message, Rs]]); }
  checks.push(['Terminal width', [TW + ' cols', Tx]]);
  checks.push(['Color support', [NO ? 'disabled' : 'truecolor', NO ? Rs : Em]]);
  checks.push(['TTY', [IS_TTY ? 'yes' : 'no', IS_TTY ? Em : Dm]]);
  checks.push(['Node.js', [process.version, Tx]]);
  for (const [l, [v, c]] of checks) ln('  ' + Dm(l.padEnd(18)) + ' ' + c(v));
  ln('');
}


// ═══════════════════════════════════════════════════════════════════
//  HELP & ROUTER
// ═══════════════════════════════════════════════════════════════════

// ── Trading: buy / sell / claim (authed, settled on Arc) ──────────────────────
const TERMINAL_STATES = new Set(['COMPLETE', 'CONFIRMED', 'FAILED', 'DENIED', 'CANCELLED']);
async function pollTrade(txId, label = 'confirming on Arc') {
  if (!txId) return {};
  const sp = spinner(label, 'arc');
  const deadline = Date.now() + 60000;
  let last = { state: 'INITIATED' };
  try {
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1800));
      try { last = await api('/api/trade/status?txId=' + encodeURIComponent(txId)); } catch {}
      if (TERMINAL_STATES.has(String(last.state || '').toUpperCase())) break;
    }
  } finally { sp.stop(); }
  return last;
}
function tradeDone(st) { return ['COMPLETE', 'CONFIRMED'].includes(String(st.state || '').toUpperCase()); }

async function cmdBuy(slug, sideArg, amountArg) {
  TITLE('buy');
  if (!slug || !sideArg || !amountArg) { ln(Dm('\n  Usage: ') + Pk('puls buy <slug> yes|no <usdc>') + Dm('     e.g. ') + Pk('puls buy will-… yes 0.5') + '\n'); return; }
  if (!(await checkLogin())) return;
  const side = /^y/i.test(sideArg) ? 'YES' : /^n/i.test(sideArg) ? 'NO' : null;
  const amount = parseFloat(amountArg);
  if (!side) { ln(Er('\n  Side must be ') + Pk('yes') + Er(' or ') + Pk('no') + Er('.\n')); return; }
  if (!(amount > 0)) { ln(Er('\n  Amount must be a positive USDC number.\n')); return; }
  let m = null;
  try { const d = await api('/api/markets'); const list = Array.isArray(d) ? d : (d.markets || []); m = list.find(x => x.slug === slug || String(x.slug || '').startsWith(slug)); if (m) slug = m.slug; } catch {}
  header('Buy ' + side, '$' + amount + ' USDC · settled on Arc', side === 'YES' ? '▲' : '▼'); ln('');
  if (m) { ln('  ' + Wh(clip(m.question || slug, PW - 4))); if (m.yesPrice != null) ln('  ' + Dm('consensus ') + Wh(Math.round(Number(m.yesPrice) * 100) + '¢ YES')); ln(''); }
  if (!(has('-y') || has('--yes'))) {
    const a = await prompt('  ' + (side === 'YES' ? Em('▲ YES') : Rs('▼ NO')) + Dm('  stake $' + amount + ' USDC?  ') + Dm('[y/N] '));
    if (!/^y/i.test(String(a || '').trim())) { ln(Dm('  cancelled.\n')); return; }
  }
  const sp = spinner('submitting trade', 'arc');
  try {
    const entryPrice = (m && m.yesPrice != null) ? (side === 'YES' ? Number(m.yesPrice) : 1 - Number(m.yesPrice)) : undefined;
    const r = await api('/api/trade/buy', { method: 'POST', auth: true, body: { slug, side, usdcAmount: amount, question: m && m.question, entryPrice } });
    sp.stop();
    if (jsonOut(r)) return;
    const st = await pollTrade(r.txId, 'confirming on Arc');
    ln('  ' + (tradeDone(st) ? Em('✓ bought ' + side) : Am('● ' + (st.state || 'submitted'))) + Dm('  ·  $' + amount + ' USDC'));
    if (st.txHash) ln('  ' + Dm('⛓ ') + cy('https://testnet.arcscan.app/tx/' + st.txHash));
    ln('  ' + Dm('track it: ') + Pk('puls portfolio') + Dm('  ·  ') + cy('pulsmarket.tech/versus'));
    ln('\n  ' + rule(PW) + '\n');
  } catch (e) {
    sp.stop();
    if (/Insufficient/i.test(e.message)) { ln('  ' + Er('✗ ' + e.message)); ln('  ' + Dm('Fund testnet USDC at ') + cy('faucet.circle.com') + Dm(' (Arc Testnet).') + '\n'); }
    else await toastErr(e.message);
  }
}

async function cmdSell(slug, amountArg) {
  TITLE('sell');
  if (!slug) { ln(Dm('\n  Usage: ') + Pk('puls sell <slug> [shares|all]') + Dm('   (sells an open position)') + '\n'); return; }
  if (!(await checkLogin())) return;
  const sp0 = spinner('loading your position', 'orbit');
  let pos = null;
  try {
    const d = await api('/api/portfolio', { auth: true });
    const positions = d.positions || d.holdings || [];
    pos = positions.find(p => !p.resolved && Number(p.shares) > 0 && (p.slug === slug || String(p.slug || '').startsWith(slug) || p.contractAddress === slug || p.marketId === slug));
  } catch {}
  sp0.stop();
  if (!pos) { ln(Er('\n  No open position found for "' + slug + '".') + Dm('  See ') + Pk('puls portfolio') + Dm('.\n')); return; }
  const side = String(pos.side || '').toUpperCase();
  const have = Number(pos.shares) || 0;
  const shares = (!amountArg || /^all$/i.test(amountArg)) ? have : Math.min(have, parseFloat(amountArg) || 0);
  if (!(shares > 0)) { ln(Er('\n  Nothing to sell.\n')); return; }
  header('Sell ' + side, abbr(shares) + ' shares · on Arc', '↘'); ln('');
  ln('  ' + Wh(clip(pos.question || slug, PW - 4))); ln('');
  if (!(has('-y') || has('--yes'))) {
    const a = await prompt('  sell ' + abbr(shares) + ' ' + side + ' shares back?  ' + Dm('[y/N] '));
    if (!/^y/i.test(String(a || '').trim())) { ln(Dm('  cancelled.\n')); return; }
  }
  const sp = spinner('submitting sell', 'arc');
  try {
    const r = await api('/api/trade/sell', { method: 'POST', auth: true, body: { slug: pos.slug, contractAddress: pos.contractAddress || pos.marketId, side, shares, question: pos.question, owner: pos.owner, entryPrice: pos.entryPrice } });
    sp.stop();
    if (jsonOut(r)) return;
    const st = await pollTrade(r.txId, 'settling sell on Arc');
    ln('  ' + (tradeDone(st) ? Em('✓ sold ' + side) : Am('● ' + (st.state || 'submitted'))));
    if (st.txHash) ln('  ' + Dm('⛓ ') + cy('https://testnet.arcscan.app/tx/' + st.txHash));
    ln('\n  ' + rule(PW) + '\n');
  } catch (e) { sp.stop(); await toastErr(e.message); }
}

async function cmdClaim(slug) {
  TITLE('claim');
  if (!slug) { ln(Dm('\n  Usage: ') + Pk('puls claim <slug>') + Dm('   (claim winnings from a resolved market)') + '\n'); return; }
  if (!(await checkLogin())) return;
  header('Claim winnings', 'resolved-market payout · on Arc', '🏆'); ln('');
  if (!(has('-y') || has('--yes'))) {
    const a = await prompt('  claim winnings for "' + clip(slug, 38) + '"?  ' + Dm('[y/N] '));
    if (!/^y/i.test(String(a || '').trim())) { ln(Dm('  cancelled.\n')); return; }
  }
  const sp = spinner('claiming on Arc', 'arc');
  try {
    const r = await api('/api/trade/claim', { method: 'POST', auth: true, body: { slug } });
    sp.stop();
    if (jsonOut(r)) return;
    const st = r.txId ? await pollTrade(r.txId, 'confirming claim') : r;
    ln('  ' + Em('✓ claim submitted') + (r.payoutUsdc != null ? Dm('  ·  $' + usd(r.payoutUsdc) + ' USDC') : ''));
    if (st.txHash) ln('  ' + Dm('⛓ ') + cy('https://testnet.arcscan.app/tx/' + st.txHash));
    ln('\n  ' + rule(PW) + '\n');
  } catch (e) {
    sp.stop();
    if (/no win|not resolved|nothing|already/i.test(e.message || '')) ln('  ' + Dm(e.message) + '\n');
    else await toastErr(e.message);
  }
}

function cmdBuild() {
  TITLE('build');
  header('Build on Puls', 'bring your own agent', '⚙'); ln('');
  ln('  ' + Wh('Give your agent an economy — it trades + pays other agents on Arc.')); ln('');
  ln('  ' + Pk('SDK  ') + Dm(' npm i ') + Wh('@pulsmarket/sdk') + Dm('   typed, zero-dep client'));
  ln('  ' + Pk('Agent') + Dm(' one-command paying agent: ') + cy('github.com/rdmbtc/Puls/tree/main/examples'));
  ln('  ' + Pk('Docs ') + Dm(' ') + cy('docs.pulsmarket.tech/cli') + Dm('  ·  ') + cy('pulsmarket.tech/build'));
  ln('');
  ln('  ' + di("  import { PulsClient } from '@pulsmarket/sdk';"));
  ln('  ' + di('  const puls = new PulsClient();'));
  ln('  ' + di('  await puls.signals.unlock(id);   // one AI pays another (x402)'));
  ln('\n  ' + rule(PW) + '\n');
}

function help() {
  ln('');
  ln(`  ${grad('PULS')}  ${Dm('v' + VERSION + '  ·  ' + T.name + ' theme')}\n`);
  ln(`  ${Pk('General')}`);
  ln(`    ${Wh('puls')}                          ${Dm('launch interactive TUI')}`);
  ln(`    ${Wh('puls login')} ${Dm('<key>')}              ${Dm('save API key')}`);
  ln(`    ${Wh('puls wallet')}                   ${Dm('wallet & balance')}`);
  ln(`    ${Wh('puls theme')} ${Dm('[name]')}             ${Dm('switch color theme')}`);
  ln(`    ${Wh('puls doctor')}                   ${Dm('diagnostics')}\n`);
  ln(`  ${Pk('Markets')}`);
  ln(`    ${Wh('puls markets')}                  ${Dm('browse live markets')}`);
  ln(`    ${Wh('puls market')} ${Dm('<slug>')}            ${Dm('detail + candlestick chart')}`);
  ln(`    ${Wh('puls search')} ${Dm('<term>')}            ${Dm('fuzzy search')}`);
  ln(`    ${Wh('puls watch')} ${Dm('<slug>')}             ${Dm('live price tracker')}`);
  ln(`    ${Wh('puls history')} ${Dm('<slug>')}           ${Dm('price history + OHLC')}`);
  ln(`    ${Wh('puls compare')} ${Dm('<a> <b>')}          ${Dm('side-by-side')}`);
  ln(`    ${Wh('puls top')}                      ${Dm('top by volume')}`);
  ln(`    ${Wh('puls heatmap')}                  ${Dm('visual market overview')}`);
  ln(`    ${Wh('puls open')} ${Dm('<slug>')}              ${Dm('open in browser')}\n`);
  ln(`  ${Pk('Intelligence')}`);
  ln(`    ${Wh('puls agents')}                   ${Dm('the AI swarm + Pulse/Sage house agents')}`);
  ln(`    ${Wh('puls oracle')} ${Dm('<slug>')}            ${Dm('AI swarm vs crowd')}`);
  ln(`    ${Wh('puls chat')} ${Dm('[question]')}         ${Dm('AI copilot · live web research')}`);
  ln(`    ${Wh('puls feed')}                     ${Dm('live trade stream')}`);
  ln(`    ${Wh('puls stats')}                    ${Dm('platform dashboard')}`);
  ln(`    ${Wh('puls leaderboard')}              ${Dm('top traders & agents')}\n`);
  ln(`  ${Pk('Creator economy')} ${Dm('· x402 nanopayments')}`);
  ln(`    ${Wh('puls signals')}                  ${Dm('alpha marketplace (on-chain attested)')}`);
  ln(`    ${Wh('puls unlock')} ${Dm('<id>')}             ${Dm('pay the creator in USDC, reveal thesis')}`);
  ln(`    ${Wh('puls streams')} ${Dm('[userId]')}         ${Dm('pay-per-second USDC streaming on Arc (RFB 4)')}`);
  ln(`    ${Wh('puls portfolio')}                ${Dm('your open positions + P&L')}\n`);
  ln(`  ${Pk('Trading')}`);
  ln(`    ${Wh('puls buy')} ${Dm('<slug> yes|no <usdc>')} ${Dm('buy YES/NO shares on Arc')}`);
  ln(`    ${Wh('puls sell')} ${Dm('<slug> [all]')}        ${Dm('sell a position back')}`);
  ln(`    ${Wh('puls claim')} ${Dm('<slug>')}             ${Dm('claim winnings (resolved)')}`);
  ln(`    ${Wh('puls calc')} ${Dm('<odds> <bet>')}        ${Dm('bet calculator')}`);
  ln(`    ${Wh('puls alert')} ${Dm('<slug> up|down <¢>')} ${Dm('set price alert')}`);
  ln(`    ${Wh('puls alerts')}                   ${Dm('manage alerts')}\n`);
  ln(`  ${Pk('Build on Puls')} ${Dm('· for agent builders')}`);
  ln(`    ${Wh('puls build')}                    ${Dm('bring your own agent — SDK + x402')}\n`);
  ln(`  ${Dm('flags:')} ${Pk('--json')} ${Pk('--no-color')} ${Pk('--no-anim')} ${Pk('--watch')} ${Pk('--compact')} ${Pk('--active')} ${Pk('--sort')} ${Pk('--limit')} ${Pk('-y')}\n`);
}

const cmd = (args[0] || '').toLowerCase();

try {
  if (has('-v') || has('--version')) { ln(VERSION); }
  else if (cmd === 'login')    { await cmdLogin(args[1]); }
  else if (cmd === 'logout')   { cmdLogout(); }
  else if (cmd === 'wallet' || cmd === 'whoami') { await cmdWhoami(); }
  else if (cmd === 'markets' || cmd === 'ls') { await cmdMarkets(); }
  else if (cmd === 'market' || cmd === 'm') { await cmdMarket(args[1]); }
  else if (cmd === 'search' || cmd === 'find' || cmd === 's') { await cmdSearch(args.slice(1).join(' ')); }
  else if (cmd === 'watch' || cmd === 'w') { await cmdWatch(args[1]); }
  else if (cmd === 'compare' || cmd === 'diff') { await cmdCompare(args[1], args[2]); }
  else if (cmd === 'top')      { await cmdTop(); }
  else if (cmd === 'feed')     { await cmdFeed(); }
  else if (cmd === 'oracle')   { await cmdOracle(args[1]); }
  else if (cmd === 'agents' || cmd === 'swarm') { await cmdAgents(); }
  else if (cmd === 'stats')    { await cmdStats(); }
  else if (cmd === 'heatmap')  { await cmdHeatmap(); }
  else if (cmd === 'history')  { await cmdHistory(args[1]); }
  else if (cmd === 'calc')     { cmdCalc(args[1], args[2]); }
  else if (cmd === 'portfolio' || cmd === 'pf') { await cmdPortfolio(); }
  else if (cmd === 'signals' || cmd === 'alpha') { await cmdSignals(); }
  else if (cmd === 'unlock' || cmd === 'buy-signal') { await cmdUnlock(args[1]); }
  else if (cmd === 'streams' || cmd === 'stream') { await cmdStreams(args[1]); }
  else if (cmd === 'buy')      { await cmdBuy(args[1], args[2], args[3]); }
  else if (cmd === 'sell')     { await cmdSell(args[1], args[2]); }
  else if (cmd === 'claim')    { await cmdClaim(args[1]); }
  else if (cmd === 'build')    { cmdBuild(); }
  else if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'ranks') { await cmdLeaderboard(); }
  else if (cmd === 'alerts')   { cmdAlerts(); }
  else if (cmd === 'alert')    { await cmdAlert(args[1], args[2], args[3]); }
  else if (cmd === 'theme')    { cmdTheme(args[1]); }
  else if (cmd === 'open')     { cmdOpen(args[1]); }
  else if (cmd === 'doctor')   { await cmdDoctor(); }
  else if (cmd === 'chat' || cmd === 'copilot' || cmd === 'ask') { await cmdChat(args.slice(1).join(' ')); }
  else if (cmd === 'help' || cmd === '-h' || cmd === '--help') { help(); }
  else if (!cmd && IS_TTY)     { await intro(); await startTUI(); }
  else if (!cmd)               { help(); }
  else { ln(Er('\n  Unknown command: ' + cmd)); ln(Dm('  Run ') + Pk('puls help') + Dm(' for usage.\n')); }
} catch (e) {
  if (e.message?.includes('Not logged in')) {
    ln(Er('\n  ' + e.message));
    ln(Dm('  Generate a key at ') + cy(WEB_BASE + '/profile/api-keys') + '\n');
  } else {
    ln(Er('\n  Error: ' + (e.message || e)));
    if (has('-v')) console.error(e);
  }
  process.exit(1);
}
