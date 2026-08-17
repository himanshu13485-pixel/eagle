# Eagle agent on macOS — PPPC (silent Screen Recording via MDM)

macOS makes Screen Recording a **user-consent** privacy control. There is **no script/owner
bypass** on a normal Mac — the only sanctioned way to grant it *without a prompt* is an **MDM
PPPC profile** on managed devices. `eagle-agent-pppc.mobileconfig` is that profile (template).

This does not defeat any security control; it records the organization's decision to trust its
own management software on the Macs it manages — the Apple-approved equivalent of the Windows
Defender exclusion.

## Requirements
1. **Macs enrolled in an MDM** (Jamf, Kandji, Mosyle, Intune, Addigy, …). Best results on
   **supervised / Automated Device Enrollment (ADE)** devices.
2. The agent **signed with your Apple Developer ID** and packaged as a **.app bundle** with
   `CFBundleIdentifier = com.eagle.agent`. Bare SEA binaries have no bundle id / stable code
   identity, which PPPC needs. (Signing + notarization also gives you a clean Gatekeeper install.)

## Fill in the template
1. **UUIDs** — replace `__UUID_PAYLOAD__` and `__UUID_PROFILE__`, each with a fresh value:
   ```bash
   uuidgen
   ```
2. **Team ID** — your Apple Developer Team ID (Developer portal → Membership).
3. **Code requirement** — after signing the app, capture its designated requirement:
   ```bash
   codesign -dr - "Eagle Agent.app"        # prints:  designated => <requirement>
   ```
   Paste the `<requirement>` string into every `__CODE_REQUIREMENT__`. It typically looks like:
   ```
   identifier "com.eagle.agent" and anchor apple generic and certificate leaf[subject.OU] = "YOURTEAMID"
   ```

## Deploy
- **Jamf Pro**: Computers → Configuration Profiles → Upload → select the `.mobileconfig`
  (or build it in the *Privacy Preferences Policy Control* payload UI and paste these values).
- **Kandji / Mosyle / Addigy / Intune**: upload as a **custom configuration profile** (.mobileconfig).
- Scope it to the Macs running the agent. On next check-in, the profile installs and the agent
  gets its access silently.

## Honest caveats
- **ScreenCapture via PPPC**: works to *Allow* on **macOS 11+** for managed/supervised Macs, but
  Apple's behavior has varied by version. If a given macOS build doesn't honor the silent Allow,
  the profile still **pre-lists** the app so the user only flips one toggle. Test on your fleet's
  OS version.
- **Camera / Microphone can never be Allowed by MDM** (Apple always requires user consent) — so
  the optional webcam feature will always prompt on macOS, by design.
- The agent must stay signed with the **same** identity referenced by `__CODE_REQUIREMENT__`;
  re-signing with a different cert requires updating the profile.

## Related build/signing steps
- Build the Mac binary: run the **Build agent binaries** GitHub Action (macOS runner) or
  `npm run build:exe -w @eagle/agent` on a Mac, then place `eagle-agent` on the server
  (`apps/agent/dist-bin/eagle-agent` or `AGENT_EXE_MAC_PATH`).
- For production, wrap it in a signed **.app** + **notarize** (`xcrun notarytool`) so both
  Gatekeeper *and* this PPPC profile work cleanly.
