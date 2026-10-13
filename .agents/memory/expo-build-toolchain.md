---
name: Expo remote build toolchain
description: Keep remote package-manager versions consistent with validated workspace security settings.
---

Pin the remote Expo package-manager version to the version validated in this workspace instead of relying on a mutable build image's default.

**Why:** The remote image selected pnpm 11 while the workspace used pnpm 10. The remote install rejected esbuild's install script despite the workspace's explicit pnpm 10 build-script allowlist.

**How to apply:** Check the failed build's actual toolchain before changing dependency permissions. Preserve the minimum release age, frozen lockfile, and targeted build-script approvals; do not enable every dependency script or disable strict checks to make an install pass. Validate the pinned version with a non-interactive frozen-lockfile install before triggering another remote build.
