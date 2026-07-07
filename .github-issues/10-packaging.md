## Summary
Configure **electron-builder** to produce distributable installers for Windows, macOS, and Linux, and document the release process.

## Motivation
The app is only useful once users can install it. We need real artifacts: an `.exe`/NSIS installer (Windows), a `.dmg`/`.zip` (macOS), and `AppImage`/`.deb` (Linux).

## Requirements
- Add an `electron-builder` configuration (in `package.json` under `build`, or a separate `electron-builder.yml`) with:
  - `appId`, `productName` (CueDeck), and per-platform targets:
    - Windows: `nsis`
    - macOS: `dmg` + `zip` (universal or x64+arm64)
    - Linux: `AppImage` + `deb`
  - App icons for each platform (add placeholder icons under `build/` if none exist, and note where to replace them).
- `npm run package` produces installers into `release/` (already gitignored).
- Ensure the packaged app loads the built renderer + preload correctly (the app already handles dev vs prod loading; verify prod paths).
- Document the build/release steps in `README.md` (or `RELEASING.md`), including how to build per-OS and any signing caveats (note that code-signing/notarization is out of scope but call it out).

## Implementation notes
- Verify `files`/`asar` settings include `out/**` and exclude source.
- Cross-OS packaging on a single machine is limited (e.g. building Windows on Linux). It's acceptable for this issue to configure all three and verify the **Linux AppImage** actually builds in the environment; document the others as configured-but-unverified with instructions.
- Add optional GitHub Actions release workflow (`.github/workflows/release.yml`) that builds artifacts on tag push — nice-to-have, note if deferred.

## Acceptance criteria
- [ ] `electron-builder` config covers Windows, macOS, Linux targets with icons.
- [ ] `npm run package` builds at least the Linux AppImage successfully in this environment.
- [ ] Release/build process is documented.
- [ ] `npm run typecheck` and `npm run build` still pass.
