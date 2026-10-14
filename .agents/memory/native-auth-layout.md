---
name: Native launch and login layout
description: Android splash masking and keyboard behavior that browser previews cannot validate.
---

Use a separate padded launch asset for Android's system splash; retain the full original logo for the in-app welcome screen.

**Why:** Android's system splash mask clipped both outer letters of the wordmark even though the same logo displayed correctly in the application. Image containment alone did not protect the artwork from that mask.

**How to apply:** Check the generated native drawable against the system splash's safe circle when changing the logo. Browser previews do not verify the system launch screen.

Native authentication forms must follow the focused input when the keyboard opens, including company-code entry, mobile/PIN sign-in, and credential changes.

**Why:** The installed Android app's regular scrolling layout left its fields behind the keyboard; automatic keyboard insets were not sufficient on Android.

**How to apply:** Preserve keyboard-aware scrolling and safe-area handling in the shared authentication frame. Verify on a replacement APK before claiming physical-device keyboard behavior is tested; a web screenshot cannot establish it.
