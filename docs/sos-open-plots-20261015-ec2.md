# SyndicateOS — consolidated Open Plotting EC2 update

Release: sos-consolidated-20261015-open-plots

This one archive contains the matched API, original web application and mobile browser application. Install API/web first, then the included mobile package. Do not install only the mobile files over the old API.

## Included changes

- Compact mobile firm/project header and existing project actions.
- Open Plotting top actions: Marketing Portal & Share Link remains visible.
- Venture layout and Project Layout Summary are independently collapsed by default. Inventory, search, facing/status filters and plot cards remain visible.
- Optional original plan; editable layout generated from project inventory without requiring a file. Plot blocks, roads and open spaces can be adjusted and reviewed.
- Compact saved 3D presentation, with an explicit edit/recreate flow and touch gestures instead of a zoom/rotate button toolbar.
- Hiding the editor preserves unsaved changes; navigation still checks for unsaved edits.
- Personal project/employee marketing invitations through the existing backend, with separate marketing credentials and mandatory initial PIN change.
- Actual server-issued activation deadline in IST on both sharing screens and in invitation messages. Default policy: 168 hours to activate; activated access remains enabled until access is disabled. Sign-in sessions expire separately (currently 12 hours).
- Existing mobile booking-form rules, partner project-account movements card, branding and keyboard-aware forms are retained.

Only confirmed, permitted layout data is shared with marketing users. Private originals, draft geometry, customer contacts and financial dashboards are not made public. The layout remains illustrative, not a surveyed or legally approved plan.

## APK / over-the-air update limitation

This updates https://sos.krishisetu9.in/ and https://sos.krishisetu9.in/mobile/ and their shared API. It does not replace the screens bundled inside an installed native APK.

The current Android build has expo.modules.updates.ENABLED=false, no EAS Update URL/runtime version, and no update channel in its build profile. OTA cannot be added remotely to that installed binary. Some current changes also include native Expo patches, splash and keyboard configuration, which are not JavaScript-only OTA changes.

Recommendation: use the updated mobile browser version immediately. For future OTA delivery, explicitly approve a one-time OTA-enabled replacement APK with a compatible runtime and channel. No new APK, EAS update publication, iOS build or app-store submission is performed by this package.

## Safety and prerequisites

- This is an update of the existing installation, not a fresh install. Live baseline checked before packaging: database version 22, web sos-consolidated-20261013-registration-label, mobile sos-mobile-20261013-partner-account.
- The installer supports the existing supported schema versions through 23 and applies the additive version 23 layout migration when needed. It does not reset or seed production data.
- Schedule a maintenance window: the API is stopped while the lowercase sos database schema and private upload files are backed up together, then migrations and runtime permissions are applied.
- Existing owners, firms, projects, credentials, bank accounts, bookings, payments and private uploads are preserved. New versioned directories are used; the checksummed original release is not overwritten.
- Retain a current RDS snapshot as an additional recovery measure. Keep enough EC2 disk space for the release and backups; the installer checks free space.
- Required: existing working EC2 setup, Java 21+, Python 3.11+, Nginx, systemd, curl and PostgreSQL client tools matching or newer than the RDS server. No Node/Expo/Gradle installation is required on EC2.
- Have the existing sos_deploy database password ready for the hidden EC2 prompt. Do not paste it or your PEM key contents into chat. Do not substitute the runtime database account.
- Do not use any bootstrap, initialize, clean, fresh-install or database-reset commands.

## 1. Windows PowerShell — upload the single archive

Download sos-consolidated-20261015-open-plots.tar.gz to Downloads. Adjust the PEM path if necessary. Use PowerShell, not the Linux SSH terminal:

```powershell
$Key = "$env:USERPROFILE\Downloads\SOS.pem"
$Archive = "$env:USERPROFILE\Downloads\sos-consolidated-20261015-open-plots.tar.gz"
if (!(Test-Path $Key)) { throw "SSH key not found. Correct the Key path." }
if (!(Test-Path $Archive)) { throw "Release archive not found in Downloads." }
$Expected = "{{SHA256}}"
if ((Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) {
  throw "Archive checksum mismatch. Download the archive again; do not install this copy."
}
scp -i "$Key" "$Archive" ubuntu@3.111.185.116:/home/ubuntu/
if ($LASTEXITCODE -ne 0) { throw "Upload failed." }
ssh -i "$Key" ubuntu@3.111.185.116
```

## 2. EC2 SSH terminal — install API/web, then mobile

Paste the entire parenthesized block below. The fail-fast setting stays in a subshell and will not close your SSH session. It validates the archive before extraction and all packaged files before installation.

```bash
(
  set -eu
  cd /home/ubuntu
  printf '%s  %s\n' '{{SHA256}}' 'sos-consolidated-20261015-open-plots.tar.gz' | sha256sum -c -
  STAGE="$(mktemp -d /home/ubuntu/sos-open-plots-stage.XXXXXX)"
  tar -xzf sos-consolidated-20261015-open-plots.tar.gz -C "$STAGE"
  cd "$STAGE/sos-consolidated-20261015-open-plots"
  sha256sum -c FILES.sha256
  printf 'Keep this installer directory for verification/recovery:\n%s\n' "$PWD"
  sudo python3 update.py inspect
  sudo python3 update.py install
  sudo python3 update.py verify
  sudo python3 mobile-package/install.py install
  sudo python3 mobile-package/install.py verify
)
```

At the hidden prompt, enter the existing sos_deploy database password. At confirmation type UPDATE SOS. Keep both printed backup paths and the installer directory.

The first installer verifies and installs API/web with schema 23. The second checks that this exact new API/web release is active before switching /mobile. It verifies mobile HTML and the actual JavaScript, font and image bytes, including pnpm export asset paths.

If either command fails, stop and share the error text without credentials. Do not continue by running older fresh-install commands. A refusal or cancellation of the first installer must not be followed by manually forcing mobile installation.

## 3. Verify from the EC2 terminal

```bash
curl --fail --silent --show-error https://sos.krishisetu9.in/api/readyz
curl --fail --silent --show-error https://sos.krishisetu9.in/release.json
curl --fail --silent --show-error https://sos.krishisetu9.in/mobile/release.json
sudo nginx -t
sudo systemctl is-active nginx
sudo systemctl is-active syndicateos-api
```

Expected:

- API: status ready, databaseReachable true and targetVerified true.
- Web: schema_version "23", frontend_fix "sos-consolidated-20261015-open-plots".
- Mobile: release "sos-mobile-20261015-open-plots", with existingWebRelease matching the new web metadata.
- Nginx syntax successful; both services active.

Reload the mobile browser page, or close and reopen its tab if old files are cached. Both layout disclosures should start closed. The marketing action and inventory must remain visible. Expiry appears after deliberately creating/copying/sharing an invitation; opening the sheet alone creates nothing.

For a real deployment check, sign in with an authorized accountant, select the intended project, check its actual saved layout and inventory, and verify partner access remains read-only. Do not create a test booking or payment in production.

## Recovery

If failure occurs before migration starts, the API/web installer restores the previous service configuration. Once migration has started, it leaves the API stopped if installation fails, so the deployment can be diagnosed safely. Do not repeatedly retry, delete migration history or automatically restore the entire shared RDS database.

For API/web recovery use the exact printed private backup directory and installer; the documented rollback restores prior routing/service configuration but deliberately leaves the API stopped. Database/uploads restoration needs a reviewed recovery decision, especially if any new writes occurred.

The mobile installer automatically restores its prior routing/target if activation verification fails. After a successful mobile installation, its explicit rollback command is:

```bash
sudo python3 mobile-package/install.py rollback /var/backups/syndicateos-mobile/EXACT-PRINTED-DIRECTORY
```

Run that from the retained installer directory and replace the placeholder only with the actual printed mobile backup path. This rolls back the mobile frontend only, not the API, database or web release.
