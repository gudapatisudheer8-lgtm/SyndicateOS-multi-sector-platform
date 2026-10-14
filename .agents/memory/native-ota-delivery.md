---
name: Native OTA delivery
description: Separate production OTA updates from previews and preserve native runtime compatibility.
---

Keep production and preview native update channels separate, use fingerprint-based
runtime compatibility, and publish production updates only deliberately.

**Why:** The user requested a one-time replacement APK that supports future OTA
updates after learning their existing binary could not receive them. Customer
financial workflows must not be interrupted by automatic forced reloads.

**How to apply:** Use background launch checks and apply on a subsequent launch.
Native changes still require a replacement binary. Publish from a clean CNG
checkout, not stale local generated Android files, and match the API domain in
the EAS update environment explicitly. EC2 releases are not native OTA releases.
