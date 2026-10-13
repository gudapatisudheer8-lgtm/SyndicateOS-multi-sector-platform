# SyndicateOS — Product Tour (Revision 3, full redesign)

## Director's treatment
- **Promise:** SyndicateOS is one complete solution for partnership projects: multiple projects, accountant and partner dashboards, expenses, open plotting, booking, 3D layout, marketing links, notifications and reminders, on web and mobile.
- **Reference read:** The supplied 10s sample is a bright, airy software tour: off-white UI, orange accents, a slow virtual camera gliding over the dashboard while single cards lift off the surface as floating callouts. We follow that: light, classic, professional, no dark tech look.
- **Identity:** Warm porcelain background (#F4F2EE), SyndicateOS navy (#0F172A tabs as in the app), amber (#F59E0B, the app's primary button colour), emerald/rose for inflow/outflow like the app. Fraunces (serif) for the narrated captions, giving the classic feel; Plus Jakarta Sans for interface reproductions; JetBrains Mono for small labels.
- **Hero:** Faithful recreations of the real app screens (accountant Dashboard KPIs, Project Statement passbook, Open Plotting cards, Fast Customer Booking, Blueprint 3D, marketing portal link, partner mobile app), redrawn from the user's screenshots and source code, filled only with TEST/DEMO data.
- **Motion:** (1) Virtual camera: slow push/pan over the screen, then a punch-in on the feature. (2) Floating lift: one card rises off the UI with a soft shadow, like the reference. (3) Live micro-actions: dropdown opens, fields type, statuses flip, numbers count.
- **Arc:** Brand promise → accountant's daily work (projects, dashboard, expenses, plots, booking) → extended reach (3D, marketing, partner mobile, alerts) → calm brand close.
- **Payoff:** Closing card collects all features as a quiet list around the logo, a different structure from every screen shot.
- **Format/runtime:** 16:9, 90.0 s, 10 scenes.

## Product facts verified in code (claims allowed)
- Multiple projects: header Firm + Project/Venture selectors and "+ Add Project" (AddProjectModal.tsx; screenshot).
- Accountant tabs: Dashboard, Partners & Equity, Open Plotting, Project Statement. KPI cards: Project Cost, Projected Sales, Inventory, Project Account with posted cash movements (screenshot).
- Expenses: Project Statement / passbook with Inflow/Outflow/Net, Enroll Investment, Enroll Project Expenses, Place Drawing Request (partner mobile screenshot).
- Open plotting: sector plot cards with facing, extent, rate, total, AVAILABLE / TOKEN BOOKED (screenshot).
- Booking: Fast Customer Booking, rate per sq.yd, amount received, quick token chips, "Book plot & record payment" (screenshots).
- 3D: Blueprint3DView / NativeBlueprint View3D — illustrative orthographic 3D of CONFIRMED geometry, uniform slab, status colours (available/reserved/blocked/sold/reference). Film states "once a layout blueprint is confirmed" and "illustrative".
- Marketing link: MarketingPlotPortalModal + MarketingAccessPage + MarketingController — personal portal link per agent, "Send to the agent on WhatsApp".
- Notifications: in-app bell with badge in Header (screenshots show badge). Reminders: RegistrationAppointment + V22 registration_reminders (date/time/location + reminder minutes). Film says "in-app notifications and registration reminders"; no background push claim.
- Mobile: Expo native app (syndicateos-mobile) and the /mobile web view; partner tabs Dashboard / Plots / Project Statements.
- No claims of approvals, automatic approvals, background push, or guarantees.

## Privacy
Every screen shows invented values: "Demo Firm", "Demo Venture Phase-1", partners "Partner A / Partner B", buyer "Demo Buyer", phone "98XXX XXXXX", agent "Demo Agent", link token masked. A persistent top-right badge reads "TEST DATA · FOR DEMONSTRATION ONLY" in every frame. No real names, phone numbers, account numbers or amounts from the screenshots.

## Audio
- Narrator: ElevenLabs "Sana Narration Match" (SCafTCyvAd3StlExwV4j), eleven_multilingual_v2, stability 0.55, similarity 0.8, style 0.15, speaker boost, speed 1.0 — the same settings as the approved narrator-preview.mp3. Similar voice to the reference, not a clone.
- Music: generated `tour_music.mp3` — classic corporate cinematic, piano + soft strings, trimmed to 90 s with a 4 s fade-out.
- Mix: `public/audio/tour_composite.mp3` (90.04 s, peak -0.1 dBFS after limiter 0.9, mean -17.4 dB). Each VO clip starts 0.6 s after its scene start: 0.6, 7.6, 17.1, 27.1, 36.1, 45.6, 54.6, 62.1, 70.1, 81.6 s.
- Old 60s clips (composite_audio.mp3, vo_*.mp3) retained, unused.

## Timeline
| # | Time | Dur | Screen | VO (exact) |
|---|---|---|---|---|
| 01 | 0.0–7.0 | 7.0 | Brand open | "SyndicateOS. One complete solution for your partnership projects." (5.04s) |
| 02 | 7.0–16.5 | 9.5 | Projects switcher + Add Project | "Run every firm and every venture from one place. Switch between projects, or add a new one in seconds." (8.07s) |
| 03 | 16.5–26.5 | 10.0 | Accountant Dashboard | "The accountant's dashboard brings project cost, projected sales, inventory and the live project account together, at a glance." (8.62s) |
| 04 | 26.5–35.5 | 9.0 | Project Statement / expenses | "Every investment, expense and drawing is enrolled into the project passbook, so spending is tracked as it happens." (7.65s) |
| 05 | 35.5–45.0 | 9.5 | Open Plotting | "Open plotting lays out each sector, plot by plot, with facing, rate and status, from available to token booked." (8.12s) |
| 06 | 45.0–54.0 | 9.0 | Fast Customer Booking | "Book a plot and record the payment in a single step. Collections and balances update straight away." (7.37s) |
| 07 | 54.0–61.5 | 7.5 | Blueprint 3D | "Once a layout blueprint is confirmed, explore it in an illustrative 3D view." (5.62s) |
| 08 | 61.5–69.5 | 8.0 | Marketing portal link | "Create a personal plot portal link for each marketing agent, and share it straight to WhatsApp." (6.40s) |
| 09 | 69.5–81.0 | 11.5 | Partner mobile, notification, reminder | "Partners follow their own dashboard, plots and statements on mobile, with in-app notifications and registration reminders keeping everyone on time." (9.74s) |
| 10 | 81.0–90.0 | 9.0 | Brand close | "SyndicateOS. Your partnership projects, in real time." (4.41s) |

## Shot-by-shot

### 01 / 0.0–7.0 — Brand open
Composition: porcelain field, faint app shell tilted in perspective at 120% blurred behind; logo centred top-third. Choreography: 0.0 blurred shell visible and drifting up; 0.25 logo scales 0.86→1 (stiff spring); 0.8 amber rule draws under logo; 1.3 serif line "One complete solution" unmasks, 1.8 "for your partnership projects." ; 2.6 six feature chips pop one by one every 0.35s (Multi-project · Accountant · Partner · Expenses · Plots · Mobile); 5.4–7.0 camera pushes into the background shell, which sharpens — handoff. Caption content exactly as above. Sound: music opens with piano.

### 02 / 7.0–16.5 — Multiple projects
Composition: the app header (SOS mark, "SyndicateOS", "Demo Firm · Accountant", bell badge 2), Firm & Project selectors, tabs. Camera starts wide, pushes to the selector. 1.2 dropdown opens with "Demo Venture Phase-1 · MVP-01", "Demo Township Phase-2 · MVP-02", "Demo Farm Plots · MVP-03"; highlight moves row 1→2 at 2.4, back 3.6; 4.4 "+ Add Project" pressed; 4.8 Add Project card floats up right with fields Project name "Demo Venture Phase-3" typed, Location "Demo Village", Extent "12 Acres"; 7.2 "Project created" toast; 8.0 camera eases out. Caption lower-left: eyebrow "MULTI-PROJECT", headline "Every firm. Every venture."

### 03 / 16.5–26.5 — Accountant dashboard
Four KPI cards as in the real app (Project Cost ₹4,80,00,000.00 Partner A/B 50%; Projected Sales ₹6,00,00,000.00, surplus, Return on cost 25.0%; Inventory 36 total, 33 available, booked 3; Project Account ₹12,40,500.00 with posted cash movements). Camera drifts across; at 3.2 Project Account card lifts off and scales 1.25 toward the viewer (reference float); rows reveal one per 0.3s; net counts up. 7.8 card settles back. Caption "ACCOUNTANT DASHBOARD / Everything, at a glance."

### 04 / 26.5–35.5 — Expenses & passbook
"Project Passbook & Live Bank Statements": Inflow/Outflow/Net tiles, three amber buttons. 1.4 "Enroll Project Expenses" pressed; 1.8 entry card floats in: Category "Site materials", Amount "₹ 18,500", Account "Project Bank"; 4.0 a new row slides into the ledger at top "Site materials · Project Bank · −18,500 · POSTED"; Outflow ticks 63,000→81,500 and Net updates. Caption "EXPENSE TRACKING / Spending, as it happens."

### 05 / 35.5–45.0 — Open plotting
Sector heading "SECTOR A · EAST FACING", 10 plot cards (facing East, 150 Sq.Yds, rate ₹10,000.00, total ₹15,00,000.00, AVAILABLE green); one TOKEN BOOKED (amber) with buyer "Demo Buyer". Road band "INTERNAL SECTOR ROAD". Camera pans left→right; 4.2 card 7 flips AVAILABLE→TOKEN BOOKED with a ring pulse; status counter "Available 33 → 32". Caption "OPEN PLOTTING / Plot by plot."

### 06 / 45.0–54.0 — Booking
Fast Customer Booking modal centred over dimmed plotting: "7 · Fast Customer Booking AVAILABLE", facts row (East, 150 Sq.Yds, 29'×46', 30 Ft Main Road), customer "Demo Buyer" types, phone "98XXX XXXXX", rate 10000, quick token chips; 3.0 "₹1,00,000.00" chip selects; amount fills; 4.2 button "Book plot & record payment" presses; 4.8 summary card floats right: Total ₹15,00,000 · Collected ₹1,00,000 · Balance ₹14,00,000 with progress bar growing. Caption "BOOKING & COLLECTIONS / One step."

### 07 / 54.0–61.5 — Blueprint 3D
Full-bleed sand panel; SVG slabs computed with the app's own projection math on a demo 3×5 parcel layout with roads; yaw rotates −45°→−15°, pitch 70°→50° over 6s; plot statuses use the app's legend colours; N compass; legend; note "Illustrative 3D of confirmed blueprint geometry · not a survey". Caption "LAYOUT IN 3D".

### 08 / 61.5–69.5 — Marketing link
Left: "Share plot portal" card — Agent name types "Demo Agent", "Creating link…", then link field "sos.example/marketing?invite=••••••" and green "Send to the agent on WhatsApp" pill pressed. Right: phone rises showing marketing inventory (available plots with rates). A dashed amber path draws from pill to phone. Caption "MARKETING LINKS / For every agent."

### 09 / 69.5–81.0 — Partner on mobile
Centred phone: partner app header "Demo Firm · Partner", tabs; Dashboard (Project Account Balance ₹12,40,500.00, inventory 36) → 3.2 Plots → 6.0 Project Statements. 1.6 notification banner drops in from phone top: "Expense posted · Site materials ₹18,500"; bell badge 2→3. 5.0 Reminder card floats right of phone: "Registration · Plot 3 · Demo Buyer · Tomorrow 11:00 AM · Sub-Registrar Office · Reminder 60 min before". Left floating chip "In-app notification". Caption "PARTNERS ON MOBILE / Always in the loop." Phone slides out up at 10.6.

### 10 / 81.0–90.0 — Close
Logo centred, serif line "Your partnership projects, in real time." Feature list in two rows fades in one by one. 6.5 "Demo screens use test data only." small. Final hold, music fades to 90s; loop restarts at the blurred shell of 01.
