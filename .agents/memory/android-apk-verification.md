---
name: Android APK verification
description: Avoid misleading archive-tool errors when diagnosing Android installation failures.
---

Do not diagnose APK corruption from Info-ZIP's extra-field warnings alone. Aligned native-library entries can trigger those warnings even when an independent ZIP reader validates every entry's CRC.

**Why:** The completed Expo APK produced extra-field errors in the container's unzip tool while Python's ZIP integrity check passed.

**How to apply:** Distinguish archive integrity, cryptographic signing, Android-version compatibility, and the downloaded copy on the user's phone. A successful CRC check or the presence of a signing block alone does not establish that Android will accept the APK.

Recheck temporary diagnostic inputs in the active runtime before interpreting compiler or class-loader failures as an application toolchain problem.

**Why:** A previously prepared diagnostic JAR and ignored verifier source were no longer available when the subsequent validation command ran; regenerating the isolated diagnostic inputs allowed verification to succeed without changing application dependencies.

**How to apply:** Treat missing diagnostic files separately from incompatible Java versions. Keep these checks isolated from the app's build and dependency configuration.
