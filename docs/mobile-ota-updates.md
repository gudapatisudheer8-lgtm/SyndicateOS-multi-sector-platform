# Native Android updates

The replacement Android APK uses EAS Update. Install this replacement once over
the existing app; do not uninstall the existing app first. Remote EAS signing
credentials and the Android application ID remain unchanged.

## Release rules

- The `apk` build receives only the `production` update channel.
- The `apk-preview` build receives only the `preview` channel.
- Runtime compatibility uses Expo's fingerprint policy. A different native
  runtime requires a new APK; do not force an incompatible runtime to match.
- Updates download in the background at launch and apply on a subsequent launch.
  Offline launches use the installed/cached bundle. Do not force a reload during
  a booking, payment, or unsaved form.
- EC2 deployments update the backend and browser applications only. Native
  JavaScript updates must also be explicitly published through EAS Update.
- Do not automatically publish production updates whenever GitHub changes.

## Before publishing an OTA update

1. Use a clean GitHub checkout with the frozen pnpm lockfile and the pinned pnpm
   version from `eas.json`. Native directories are generated on EAS, not committed.
   Do not publish from a checkout containing old, locally generated Android files.
2. Configure the public `EXPO_PUBLIC_DOMAIN` in the selected EAS environment as
   `sos.krishisetu9.in`. Build-profile `env` entries alone do not configure the
   environment used by the separate EAS Update command.
3. Check types and export the Android bundle. Check runtime compatibility with
   the intended installed APK before publishing.
4. Publish to preview first, using the correct EAS environment, and verify on a
   matching preview APK. Publish to production only after approval.
5. Keep the previous known-good update available for rollback. Do not roll back
   database migrations as part of an OTA rollback.

An actual OTA delivery test needs the new APK installed on a device and a
subsequent compatible published update; configuration and export checks alone
do not establish end-to-end OTA delivery.
