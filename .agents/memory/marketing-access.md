---
name: Personal marketing access
description: Why marketing access uses individual invitations and separate credentials rather than the accountant entry.
---

Use a personal invitation for each marketing mobile and project, not a shared public signup link. Opening a marketing link must never restore or display the accountant dashboard.

**Why:** The user selected personal invitations and reported that the previous marketing link opened the accountant dashboard.

**How to apply:** Keep the marketing entry independent of normal firm login. Verify the invited mobile and require the initial credential change before inventory access.

Marketing credentials must remain separate from accountant and partner credentials, even when the same person uses the same mobile in both contexts.

**Why:** Marketing enrollment must not reset or weaken an existing financial user's login.

**How to apply:** Keep authentication authority separate; marketing access permits scoped inventory and booking proposals, never financial dashboards or ledger posting. Re-invitations must preserve an activated marketing credential.

Do not use the new-PIN length policy to reject a temporary or previously stored login credential.

**Why:** The shorter temporary marketing credential was blocked when the first login screen reused permanent-PIN validation. A policy change must also not lock out existing credentials.

**How to apply:** Validate the stored credential at sign-in; apply the current length policy only when setting a new credential.

Marketing presentations may share the current confirmed illustrative layout and approved plot labels/statuses only. Drafts, private originals, buyer contacts and financial data must stay out of that presentation.

**Why:** Marketing employees need to present the accountant-approved venture layout to customers without receiving financial access or anonymous public sharing.

**How to apply:** Preserve personal project invitations, initial credential change and live revocation checks for any new presentation surface. Treat nested drawing extensions as private unless explicitly approved for sharing.

Describe invitation deadlines as first-use activation deadlines, not automatic termination of already activated access. Keep activation, session expiry and access revocation distinct.

**Why:** The user asked to see when marketing links expire, not to change the access policy. Calling the activation deadline a fixed access cutoff would mislead both staff and employees.

**How to apply:** Display the server-issued deadline with a timezone, never a deadline invented from development defaults. Renewing a link must not reset an activated employee's PIN or claim that the previous activated link was revoked.
