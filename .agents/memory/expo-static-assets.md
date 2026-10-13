---
name: Expo static asset routing
description: Public Expo web exports can contain hidden-looking pnpm directory segments.
---

Expo web exports from pnpm workspaces can preserve `.pnpm` directory segments in public asset URLs. Do not treat every hidden-looking URL segment as a private file: route intentionally published assets explicitly while retaining hidden-file protection elsewhere.

**Why:** A blanket Nginx dot-path denial can block legitimate bundled fonts even when HTML, JavaScript, HTTPS and API readiness all work. An HTML or readiness check alone does not verify asset delivery.

**How to apply:** Inspect actual exported asset URLs when configuring a web server. Reserve the public assets directory for trusted export output, never full dependency installations, credentials or private uploads. Verify a representative asset returns its actual file rather than a forbidden response or SPA HTML fallback.

An Expo export succeeding does not prove that the application's routes were bundled. Verify representative application screens and assets, especially after changing the export's working directory or workspace context.

**Why:** An isolated copy of this pnpm app exported successfully but contained only Expo Router's empty module context, without the real login, dashboard, or booking screens. Merely checking the base-path prefix would have accepted a broken release.

**How to apply:** Keep exports in the validated workspace context. Before packaging a release, confirm that its bundles include known application screens and its fonts and branding assets; do not rely on process exit status or HTML existence alone.
