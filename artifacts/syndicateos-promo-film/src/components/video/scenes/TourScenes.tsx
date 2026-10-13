import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
const logo = `${import.meta.env.BASE_URL}brand/syndicateos-logo-horizontal.png`;

const ease = [0.22, 1, 0.36, 1] as const;

/** Seconds since this scene mounted (rAF driven). */
function useClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = () => { setT((performance.now() - start) / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}
const typed = (text: string, t: number, start: number, cps = 16) => text.slice(0, Math.max(0, Math.floor((t - start) * cps)));
const count = (from: number, to: number, t: number, start: number, dur = 1) => {
  const p = Math.min(1, Math.max(0, (t - start) / dur));
  return from + (to - from) * (1 - Math.pow(1 - p, 3));
};
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function Scene({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      className={`tour-scene ${className}`}
      initial={{ opacity: 0, scale: 1.04, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -10 }}
      transition={{ duration: 0.6, ease }}
    >
      {children}
    </motion.section>
  );
}

function Caption({ eyebrow, title, delay = 0.5, side = 'left' }: { eyebrow: string; title: string; delay?: number; side?: 'left' | 'right' }) {
  return (
    <motion.div className={`caption caption-${side}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.7, ease }}>
      <motion.span className="cap-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: delay + 0.2, duration: 0.6, ease }} />
      <span className="cap-eyebrow">{eyebrow}</span>
      <h2 className="cap-title">{title}</h2>
    </motion.div>
  );
}

function AppHeader({ role = 'Accountant', badge = 2, tab = 0, tabs = ['Dashboard', 'Partners & Equity', 'Open Plotting', 'Project Statement'], project = 'Demo Venture Phase-1 · MVP-01' }: { role?: string; badge?: number; tab?: number; tabs?: string[]; project?: string }) {
  return (
    <div className="app-head">
      <div className="app-brand">
        <span className="sos">S<em>OS</em></span>
        <div><b>Syndicate<em>OS</em></b><small>Demo Firm · {role}</small></div>
        <span className="bell">
          <svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0" fill="none" stroke="#0f172a" strokeWidth="1.8" /></svg>
          <motion.i key={badge} initial={{ scale: 1.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>{badge}</motion.i>
        </span>
        <span className="avatar">{role[0]}</span>
      </div>
      <div className="app-selectors">
        <div className="sel"><small>FIRM</small><b>Demo Firm</b></div>
        <div className="sel"><small>PROJECT / VENTURE</small><b>{project}</b><span className="chev">⌄</span></div>
      </div>
      <div className="app-tabs">{tabs.map((x, i) => <span key={x} className={i === tab ? 'on' : ''}>{x}</span>)}</div>
    </div>
  );
}

function TestBadge() {
  return <div className="test-badge"><i />TEST DATA · FOR DEMONSTRATION ONLY</div>;
}
export { TestBadge };

/* 01 ─ brand open */
export function Tour01() {
  const chips = ['Multiple projects', 'Accountant dashboard', 'Partner dashboard', 'Expense tracking', 'Open plotting', 'Web & mobile'];
  return (
    <Scene className="s-open">
      <motion.div className="ghost-shell" initial={{ y: 60, scale: 1.18, rotateX: 18, opacity: 0.5, filter: 'blur(6px)' }} animate={{ y: [60, 20, -20], scale: [1.18, 1.12, 1.5], rotateX: [18, 14, 0], opacity: [0.5, 0.5, 0.95], filter: ['blur(6px)', 'blur(6px)', 'blur(0px)'] }} transition={{ duration: 7, times: [0, 0.75, 1], ease: 'easeInOut' }}>
        <AppHeader />
        <div className="ghost-cards"><span /><span /><span /><span /></div>
      </motion.div>
      <div className="open-veil" />
      <div className="open-center">
        <motion.img src={logo} alt="SyndicateOS" className="open-logo" initial={{ scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 240, damping: 20 }} />
        <motion.span className="open-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.8, duration: 0.7, ease }} />
        <h1 className="open-title">
          <motion.span initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ delay: 1.3, duration: 0.7, ease }}>One complete solution</motion.span>
          <motion.span initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ delay: 1.8, duration: 0.7, ease }}><em>for your partnership projects.</em></motion.span>
        </h1>
        <div className="open-chips">{chips.map((c, i) => <motion.span key={c} initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 2.6 + i * 0.35, type: 'spring', stiffness: 260, damping: 18 }}>{c}</motion.span>)}</div>
      </div>
      <motion.div className="open-exit" initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ duration: 7, times: [0, 0.78, 0.95] }} />
    </Scene>
  );
}

/* 02 ─ multiple projects */
export function Tour02() {
  const t = useClock();
  const projects = ['Demo Venture Phase-1 · MVP-01', 'Demo Township Phase-2 · MVP-02', 'Demo Farm Plots · MVP-03'];
  const hl = t < 2.4 ? 0 : t < 3.6 ? 1 : 0;
  const open = t > 1.2 && t < 4.2;
  return (
    <Scene className="s-light">
      <motion.div className="cam" initial={{ scale: 1, x: 0, y: 0 }} animate={{ scale: [1, 1.1, 1.1, 1.02], x: ['0vw', '-4vw', '-4vw', '0vw'], y: ['0vh', '4vh', '4vh', '0vh'] }} transition={{ duration: 9.5, times: [0, 0.15, 0.8, 1], ease: 'easeInOut' }}>
        <div className="app-window">
          <AppHeader project={projects[hl]} />
          <motion.div className="add-proj" animate={{ scale: t > 4.4 && t < 4.7 ? 0.92 : 1, background: t > 4.4 ? '#f59e0b' : '#ffffff' }}>+ Add Project</motion.div>
          {open && (
            <motion.div className="dropdown" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              {projects.map((p, i) => <div key={p} className={i === hl ? 'on' : ''}>{p}</div>)}
            </motion.div>
          )}
          <div className="dash-faint"><span /><span /><span /><span /></div>
        </div>
      </motion.div>
      {t > 4.8 && (
        <motion.div className="float-card addp" initial={{ opacity: 0, y: 60, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 20 }}>
          <h4>Add Project</h4>
          <label>Project name<span>{typed('Demo Venture Phase-3', t, 5.2)}</span></label>
          <label>Location<span>{typed('Demo Village', t, 6.3)}</span></label>
          <label>Total extent<span>{typed('12 Acres', t, 7.0)}</span></label>
          {t > 7.6 && <motion.div className="toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>✓ Project created</motion.div>}
        </motion.div>
      )}
      <Caption eyebrow="MULTI-PROJECT" title="Every firm. Every venture." />
    </Scene>
  );
}

/* 03 ─ accountant dashboard */
export function Tour03() {
  const t = useClock();
  const rows: [string, string, string][] = [
    ['+ Opening balance', '₹0.00', 'g'], ['+ Investments', '₹10,00,000.00', 'g'], ['+ Plot booking / customer receipts', '₹3,00,000.00', 'g'],
    ['− Expenses', '₹18,500.00', 'r'], ['− Drawings', '₹41,000.00', 'r'],
  ];
  const lifted = t > 3.2 && t < 8.2;
  return (
    <Scene className="s-light">
      <motion.div className="cam" animate={{ x: ['3vw', '-2vw'], scale: [1.04, 1.0] }} transition={{ duration: 10, ease: 'linear' }}>
        <div className="app-window">
          <AppHeader />
          <div className="kpis">
            <motion.div className="kpi" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <span className="k-l">PROJECT COST</span><b className="k-v">{inr(count(0, 48000000, t, 0.4, 1.4))}.00</b><small>₹13,00,000.00 invested by 2 partners</small>
              <p><span>Partner A · 50.0%</span><b>₹2,40,00,000.00</b></p><p><span>Partner B · 50.0%</span><b>₹2,40,00,000.00</b></p>
            </motion.div>
            <motion.div className="kpi" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <span className="k-l">PROJECTED SALES</span><b className="k-v">{inr(count(0, 60000000, t, 0.7, 1.4))}.00</b><small>6,000 Sq.Yds sellable</small>
              <p><span>Projected surplus</span><b>₹1,20,00,000.00</b></p><p><span>Return on cost</span><b>25.0%</b></p>
            </motion.div>
            <motion.div className="kpi" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
              <span className="k-l">INVENTORY</span><b className="k-v">36 total</b><small>33 available</small>
              <p><span>Booked / reserved</span><b>3</b></p><p><span>Sold</span><b>0</b></p><p><span>Blocked</span><b>0</b></p>
            </motion.div>
            <motion.div className="kpi acct" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: lifted ? -30 : 0, scale: lifted ? 1.28 : 1, x: lifted ? '-8vw' : 0, boxShadow: lifted ? '0 4vmin 8vmin rgba(15,23,42,.22)' : '0 .3vmin 1vmin rgba(15,23,42,.06)' }} transition={{ delay: t < 1 ? 1.2 : 0, duration: 0.9, ease }}>
              <span className="k-l">PROJECT ACCOUNT</span><b className="k-v">{inr(count(0, 1240500, t, 3.6, 2.4))}.00</b><small>Bank + Cash · net balance from live account balances</small>
              <span className="k-sub">POSTED CASH MOVEMENTS</span>
              {rows.map(([a, b, c], i) => <motion.p key={a} initial={{ opacity: 0, x: -8 }} animate={{ opacity: t > 3.8 + i * 0.3 ? 1 : 0.15, x: 0 }}><span>{a}</span><b className={c}>{b}</b></motion.p>)}
              <p className="net"><span>= Posted net</span><b>₹12,40,500.00</b></p>
            </motion.div>
          </div>
        </div>
      </motion.div>
      <Caption eyebrow="ACCOUNTANT DASHBOARD" title="Everything, at a glance." />
    </Scene>
  );
}

/* 04 ─ expenses / passbook */
export function Tour04() {
  const t = useClock();
  const posted = t > 4.0;
  const out = count(63000, 81500, t, 4.1, 1);
  return (
    <Scene className="s-light">
      <motion.div className="cam" animate={{ scale: [1.12, 1.0], y: ['4vh', '0vh'] }} transition={{ duration: 9, ease: 'easeOut' }}>
        <div className="app-window">
          <AppHeader tab={3} />
          <div className="pass">
            <h3>Project Passbook &amp; Live Bank Statements</h3>
            <p className="muted">Real-time ledger audit trail for escrow, operations and partner distributions</p>
            <div className="pass-tiles">
              <div><small>INFLOW</small><b className="g">18,21,500</b></div>
              <div><small>OUTFLOW</small><b className="r">{Math.round(out).toLocaleString('en-IN')}</b></div>
              <div><small>NET</small><b>{Math.round(1821500 - out).toLocaleString('en-IN')}</b></div>
            </div>
            <div className="pass-btns">
              <span>+ Enroll Investment</span>
              <motion.span animate={{ scale: t > 1.4 && t < 1.7 ? 0.92 : 1, boxShadow: t > 1.4 && t < 3 ? '0 0 0 .6vmin rgba(245,158,11,.35)' : '0 0 0 0 rgba(0,0,0,0)' }}>+ Enroll Project Expenses</motion.span>
              <span>+ Place Drawing Request</span>
            </div>
            <div className="ledger">
              {posted && <motion.div className="lrow new" initial={{ opacity: 0, y: -20, backgroundColor: '#fef3c7' }} animate={{ opacity: 1, y: 0, backgroundColor: '#ffffff' }} transition={{ duration: 1.6 }}><b>Site materials</b><span>Project Bank · Expense</span><em>POSTED</em><i className="r">−18,500</i></motion.div>}
              <div className="lrow"><b>Partner investment</b><span>Project Bank · Partner A</span><em>POSTED</em><i className="g">+5,00,000</i></div>
              <div className="lrow"><b>Customer receipt · Plot 3</b><span>Project Bank · Booking</span><em>POSTED</em><i className="g">+1,00,000</i></div>
              <div className="lrow"><b>Drawing · Partner B</b><span>Site Cash</span><em>POSTED</em><i className="r">−41,000</i></div>
            </div>
          </div>
        </div>
      </motion.div>
      {t > 1.8 && t < 4.4 && (
        <motion.div className="float-card exp" initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 20 }}>
          <h4>Enroll Project Expense</h4>
          <label>Category<span>{typed('Site materials', t, 2.0, 20)}</span></label>
          <label>Amount<span>{typed('₹ 18,500', t, 2.7, 14)}</span></label>
          <label>Account<span>{typed('Project Bank', t, 3.2, 20)}</span></label>
        </motion.div>
      )}
      <Caption eyebrow="EXPENSE TRACKING" title="Spending, as it happens." side="right" />
    </Scene>
  );
}

/* 05 ─ open plotting */
function PlotCard({ n, booked, flash }: { n: number; booked?: boolean; flash?: boolean }) {
  return (
    <motion.div className={`plot ${booked ? 'bk' : ''}`} animate={flash ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 0.7 }}>
      <div className="p-top"><b>{n}</b><em>{booked ? 'TOKEN BOOKED' : 'AVAILABLE'}</em></div>
      <p><span>◎ East</span><span>150 Sq.Yds</span></p>
      <p><span>Rate:</span><span>₹10,000.00</span></p>
      <p><span>Total:</span><span className="g">₹15,00,000.00</span></p>
      {booked ? <small>Buyer: Demo Buyer</small> : <small>Road width: 30 ft</small>}
    </motion.div>
  );
}
export function Tour05() {
  const t = useClock();
  const flip = t > 4.2;
  return (
    <Scene className="s-light">
      <motion.div className="cam" animate={{ x: ['6vw', '-6vw'], scale: [1.1, 1.0] }} transition={{ duration: 9.5, ease: 'easeInOut' }}>
        <div className="app-window">
          <AppHeader tab={2} />
          <div className="sector">
            <div className="sec-head"><b>SECTOR A · EAST FACING</b><span>Available <strong>{flip ? 32 : 33}</strong> · Booked <strong>{flip ? 4 : 3}</strong></span></div>
            <div className="plots">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <PlotCard key={n} n={n} booked={n === 3 || (n === 7 && flip)} flash={n === 7 && flip} />)}
            </div>
            <div className="road">INTERNAL SECTOR ROAD — 30 FT</div>
          </div>
        </div>
      </motion.div>
      <Caption eyebrow="OPEN PLOTTING" title="Plot by plot." />
    </Scene>
  );
}

/* 06 ─ booking */
export function Tour06() {
  const t = useClock();
  const chip = t > 3.0;
  const done = t > 4.6;
  return (
    <Scene className="s-light">
      <div className="dim-bg"><div className="app-window blurish"><AppHeader tab={2} /></div></div>
      <motion.div className="booking" initial={{ y: 40, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: done ? 0.94 : 1, x: done ? '-12vw' : 0 }} transition={{ duration: 0.8, ease }}>
        <div className="bk-head"><span className="num">7</span><div><b>7 · Fast Customer Booking <em>AVAILABLE</em></b><small>Demo Venture Phase-1 · 150 Sq.Yards (1350 Sq.Ft)</small></div></div>
        <div className="bk-facts"><p><small>FACING</small><b>East</b></p><p><small>EXTENT</small><b>150 Sq.Yds</b></p><p><small>DIMENSIONS</small><b>29' × 46'</b></p><p><small>ROAD</small><b>30 Ft Main Road</b></p></div>
        <div className="bk-sec"><h5>CUSTOMER &amp; PURCHASER DETAILS</h5>
          <div className="row2"><label>Customer / buyer full name<span>{typed('Demo Buyer', t, 0.8)}</span></label><label>WhatsApp / mobile<span>{typed('98XXX XXXXX', t, 1.6)}</span></label></div>
        </div>
        <div className="bk-sec warm"><h5>PRICING &amp; SPOT TOKEN ADVANCE <i>Total Value: ₹15,00,000.00</i></h5>
          <div className="row2"><label>Agreed rate per Sq.Yard<span>10000</span></label><label>Amount received this payment<span>{chip ? '100000' : ''}</span></label></div>
          <div className="chips">{['₹50,000.00', '₹1,00,000.00', '₹2,00,000.00', '₹5,00,000.00'].map((c, i) => <motion.span key={c} className={chip && i === 1 ? 'on' : ''} animate={{ scale: chip && i === 1 && t < 3.3 ? 0.9 : 1 }}>{c}</motion.span>)}</div>
        </div>
        <div className="bk-foot"><span>Close</span><motion.span className="go" animate={{ scale: t > 4.2 && t < 4.5 ? 0.92 : 1 }}>Book plot &amp; record payment</motion.span></div>
      </motion.div>
      {done && (
        <motion.div className="float-card collect" initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 150, damping: 20 }}>
          <h4>Plot 7 · Collections</h4>
          <p><span>Total value</span><b>₹15,00,000</b></p>
          <p><span>Collected to date</span><b className="g">{inr(count(0, 100000, t, 5.0, 1))}</b></p>
          <p><span>Balance due</span><b>{inr(count(1500000, 1400000, t, 5.0, 1))}</b></p>
          <div className="bar"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 0.0667 }} transition={{ delay: 0.4, duration: 1 }} /></div>
          <small>Receipt recorded · status TOKEN BOOKED</small>
        </motion.div>
      )}
      <Caption eyebrow="BOOKING & COLLECTIONS" title="Book and collect, in one step." />
    </Scene>
  );
}

/* 07 ─ blueprint 3D (same orthographic projection as the app) */
type Cam = { yaw: number; pitch: number; zoom: number };
function project(x: number, y: number, h: number, cam: Cam, base: number) {
  const X = x - 50, Z = y - 50, Y = h;
  const yaw = (cam.yaw * Math.PI) / 180, pitch = (cam.pitch * Math.PI) / 180;
  const x1 = X * Math.cos(yaw) - Z * Math.sin(yaw);
  const z1 = X * Math.sin(yaw) + Z * Math.cos(yaw);
  const sy = z1 * Math.sin(pitch) - Y * Math.cos(pitch);
  const depth = z1 * Math.cos(pitch) + Y * Math.sin(pitch);
  const s = base * cam.zoom;
  return { sx: x1 * s, sy: sy * s, depth };
}
const FILL: Record<string, [string, string]> = { available: ['#6EE7B7', '#059669'], reserved: ['#FCD34D', '#B45309'], blocked: ['#D6D3D1', '#78716C'], sold: ['#94A3B8', '#334155'] };
export function Tour07() {
  const t = useClock();
  const plots = useMemo(() => {
    const out: { n: string; st: string; pts: { x: number; y: number }[] }[] = [];
    const st = ['available', 'available', 'reserved', 'available', 'available', 'sold', 'available', 'reserved', 'available', 'blocked', 'available', 'available', 'reserved', 'available', 'available'];
    let k = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const x0 = 12 + c * 15.5, y0 = r === 0 ? 14 : r === 1 ? 40 : 62;
      out.push({ n: String(k + 1), st: st[k], pts: [{ x: x0, y: y0 }, { x: x0 + 14, y: y0 }, { x: x0 + 14, y: y0 + 18 }, { x: x0, y: y0 + 18 }] });
      k++;
    }
    return out;
  }, []);
  const p = Math.min(1, t / 6.5);
  const e = 1 - Math.pow(1 - p, 2);
  const cam: Cam = { yaw: -48 + 34 * e, pitch: 72 - 20 * e, zoom: 1.0 + 0.12 * e };
  const SL = 1.6, B = 6;
  const faces: { k: string; d: string; f: string; s: string; depth: number; lab?: { x: number; y: number; n: string } }[] = [];
  plots.forEach((pl, i) => {
    const [top, side] = FILL[pl.st];
    pl.pts.forEach((a, j) => {
      const b = pl.pts[(j + 1) % 4];
      const q = [project(a.x, a.y, 0, cam, B), project(b.x, b.y, 0, cam, B), project(b.x, b.y, SL, cam, B), project(a.x, a.y, SL, cam, B)];
      faces.push({ k: `s${i}${j}`, d: 'M' + q.map((v) => `${v.sx},${v.sy}`).join('L') + 'Z', f: side, s: '#1C1917', depth: q.reduce((s2, v) => s2 + v.depth, 0) / 4 - 0.01 });
    });
    const tp = pl.pts.map((v) => project(v.x, v.y, SL, cam, B));
    const c = project(pl.pts[0].x + 7, pl.pts[0].y + 9, SL, cam, B);
    faces.push({ k: `t${i}`, d: 'M' + tp.map((v) => `${v.sx},${v.sy}`).join('L') + 'Z', f: top, s: '#44403C', depth: tp.reduce((s2, v) => s2 + v.depth, 0) / 4, lab: { x: c.sx, y: c.sy, n: pl.n } });
  });
  faces.sort((a, b) => a.depth - b.depth);
  const roads = [[{ x: 5, y: 36 }, { x: 95, y: 36 }], [{ x: 5, y: 85 }, { x: 95, y: 85 }]].map((r) => r.map((v) => project(v.x, v.y, 0, cam, B)));
  return (
    <Scene className="s-sand">
      <motion.div className="bp-wrap" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease }}>
        <svg viewBox="-400 -260 800 520" className="bp-svg">
          {roads.map((r, i) => <path key={i} d={`M${r[0].sx},${r[0].sy}L${r[1].sx},${r[1].sy}`} stroke="#44403C" strokeWidth={9} strokeLinecap="round" opacity={0.75} />)}
          {faces.map((f) => (
            <g key={f.k}>
              <path d={f.d} fill={f.f} stroke={f.s} strokeWidth={0.6} strokeLinejoin="round" />
            </g>
          ))}
          {faces.filter((f) => f.lab).map((f) => <text key={'l' + f.k} x={f.lab!.x} y={f.lab!.y + 4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#1C1917" stroke="#FBF8F1" strokeWidth={3} paintOrder="stroke">{f.lab!.n}</text>)}
          <g transform="translate(340,-200)"><circle r={26} fill="#FFFBEB" stroke="#B45309" /><g transform={`rotate(${-cam.yaw - 30})`}><line x1={0} y1={12} x2={0} y2={-16} stroke="#92400E" strokeWidth={2.6} /><text y={-19} textAnchor="middle" fontSize={10} fontWeight={800} fill="#92400E">N</text></g></g>
        </svg>
      </motion.div>
      <motion.div className="bp-legend" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }}>
        {[['Available', '#6EE7B7'], ['Booked / reserved', '#FCD34D'], ['Blocked', '#D6D3D1'], ['Sold / registered', '#94A3B8']].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
      </motion.div>
      <motion.div className="bp-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}>Illustrative 3D of confirmed blueprint geometry · uniform slab, not a survey</motion.div>
      <Caption eyebrow="LAYOUT BLUEPRINT" title="Your layout, in 3D." side="right" delay={0.7} />
    </Scene>
  );
}

/* 08 ─ marketing link */
export function Tour08() {
  const t = useClock();
  const link = t > 2.6;
  return (
    <Scene className="s-light">
      <motion.div className="float-card share" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
        <h4>Share plot portal</h4>
        <small className="muted">Demo Venture Phase-1 · personal link per agent</small>
        <label>Agent name<span>{typed('Demo Agent', t, 0.8, 12)}</span></label>
        <label>Agent mobile<span>{typed('97XXX XXXXX', t, 1.6, 14)}</span></label>
        <div className="link-field">{t > 2.1 && !link ? 'Creating link…' : link ? 'sos.example.in/marketing?invite=•••••••••' : ''}</div>
        <motion.div className="wa" animate={{ opacity: link ? 1 : 0.35, scale: t > 3.6 && t < 3.9 ? 0.93 : 1 }}>Send to the agent on WhatsApp</motion.div>
      </motion.div>
      <svg className="share-path" viewBox="0 0 100 100" preserveAspectRatio="none"><motion.path d="M40 70 C 55 85, 60 30, 68 40" fill="none" stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="1.5 1.2" initial={{ pathLength: 0 }} animate={{ pathLength: t > 3.8 ? 1 : 0 }} transition={{ duration: 0.8 }} /></svg>
      <motion.div className="phone mk" initial={{ y: '60vh', rotate: 6 }} animate={{ y: t > 4.0 ? 0 : '60vh', rotate: t > 4.0 ? -3 : 6 }} transition={{ type: 'spring', stiffness: 90, damping: 18 }}>
        <div className="ph-screen">
          <div className="mk-head"><span className="sos">S<em>OS</em></span><b>Plot portal · Demo Agent</b></div>
          <small className="muted">Available plots · Demo Venture Phase-1</small>
          {[6, 7, 8, 9, 10].map((n) => <div className="mk-row" key={n}><b>Plot {n}</b><span>East · 150 Sq.Yds</span><em>₹15,00,000</em></div>)}
        </div>
      </motion.div>
      <Caption eyebrow="MARKETING LINKS" title="A link for every agent." />
    </Scene>
  );
}

/* 09 ─ partner mobile, notification, reminder */
export function Tour09() {
  const t = useClock();
  const tab = t < 3.2 ? 0 : t < 6.0 ? 1 : 2;
  return (
    <Scene className="s-light s-partner">
      <motion.div className="phone big" initial={{ y: '70vh' }} animate={{ y: t > 10.4 ? '-8vh' : 0, opacity: t > 10.4 ? 0.6 : 1 }} transition={{ type: 'spring', stiffness: 80, damping: 18 }}>
        <div className="ph-screen">
          <AppHeader role="Partner" badge={t > 1.6 ? 3 : 2} tab={tab} tabs={['Dashboard', 'Plots', 'Project Statements']} project="Demo Venture Phase-1" />
          {t > 1.6 && t < 5 && <motion.div className="notif" initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}><b>Expense posted</b><span>Site materials · ₹18,500 · Project Bank</span></motion.div>}
          <motion.div key={tab} className="ph-body" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            {tab === 0 && <>
              <div className="mcard"><small>PROJECT ACCOUNT BALANCE</small><b>₹12,40,500.00</b><span>Bank ₹11.90 L · Cash ₹0.50 L</span></div>
              <div className="mcard"><small>INVENTORY</small><b>36</b><span>33 available · 3 booked · 0 sold</span></div>
              <div className="mcard"><small>EXPECTED ALLOTTED LAND AREA</small><b>3,000 Sq.Yds</b><div className="bar"><i style={{ transform: 'scaleX(.5)' }} /></div></div>
            </>}
            {tab === 1 && <>{[1, 2, 3, 4].map((n) => <div className="mk-row" key={n}><b>Plot {n}</b><span>East · 150 Sq.Yds</span><em className={n === 3 ? 'amb' : 'grn'}>{n === 3 ? 'TOKEN BOOKED' : 'AVAILABLE'}</em></div>)}</>}
            {tab === 2 && <>
              <div className="pass-tiles sm"><div><small>INFLOW</small><b className="g">18,21,500</b></div><div><small>OUTFLOW</small><b className="r">81,500</b></div><div><small>NET</small><b>17,40,000</b></div></div>
              <div className="mk-row"><b>Site materials</b><span>Expense · Project Bank</span><em className="r">−18,500</em></div>
              <div className="mk-row"><b>Customer receipt</b><span>Plot 3 · Booking</span><em className="g">+1,00,000</em></div>
            </>}
          </motion.div>
        </div>
      </motion.div>
      <motion.div className="side-chip left" initial={{ opacity: 0, x: -30 }} animate={{ opacity: t > 2.0 ? 1 : 0, x: t > 2.0 ? 0 : -30 }}>In-app notification <b>·</b> new entry posted</motion.div>
      <motion.div className="float-card remind" initial={{ opacity: 0, x: 60 }} animate={{ opacity: t > 5.0 ? 1 : 0, x: t > 5.0 ? 0 : 60 }} transition={{ type: 'spring', stiffness: 140, damping: 20 }}>
        <h4>Registration appointment</h4>
        <p><span>Plot</span><b>3 · Demo Buyer</b></p>
        <p><span>Date &amp; time</span><b>Tomorrow · 11:00 AM</b></p>
        <p><span>Location</span><b>Sub-Registrar Office (demo)</b></p>
        <div className="rem-pill">Reminder · 60 min before</div>
      </motion.div>
      <Caption eyebrow="PARTNERS ON MOBILE" title="Always in the loop." />
    </Scene>
  );
}

/* 10 ─ close */
export function Tour10() {
  const feats = ['Multiple projects', 'Accountant dashboard', 'Partner dashboard', 'Expense tracking', 'Open plotting & booking', 'Blueprint 3D', 'Marketing links', 'Notifications & reminders', 'Web & mobile'];
  return (
    <Scene className="s-close">
      <motion.div className="close-ring" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.4, ease }} />
      <div className="close-center">
        <motion.img src={logo} alt="SyndicateOS" className="close-logo" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8, ease }} />
        <motion.h1 className="close-title" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.8, ease }}>Your partnership projects, <em>in real time.</em></motion.h1>
        <div className="close-feats">{feats.map((f, i) => <motion.span key={f} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4 + i * 0.28 }}>{f}</motion.span>)}</div>
        <motion.small className="close-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 6.2 }}>Screens shown with test data for demonstration only.</motion.small>
      </div>
    </Scene>
  );
}
