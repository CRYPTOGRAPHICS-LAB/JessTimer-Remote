# Publishing to the Companion module store

Verified against Bitfocus's current docs (August 2026). The process changed with
Companion 4.0 — modules are now installed on demand from Bitfocus's API rather
than being bundled into Companion releases.

The one surprise worth knowing up front: **you do not create the GitHub
repository.** Bitfocus creates it for you under the `bitfocus` organisation and
grants you access. Everything else follows from that.

---

## Step 0 — Module name (done)

Bitfocus wants module names in **`manufacturer-product`** format. Settled as:

**`cryptographics-jesstimer-remote`**

Already applied to `companion/manifest.json` (`id`, `name`, `repository`,
`bugs`), `package.json` (`name`), and `manufacturer` / `shortname`. Companion
will list it as **CRYPTOGRAPHICS: JessTimer Remote**.

`legacyIds` carries `"jesstimer"`, so the connection you already have configured
migrates rather than breaking when you load the renamed module.

Renaming after publication requires a formal rename process, so this is worth
being sure about now rather than later.

---

## Step 1 — Request the repository

Join the Bitfocus Slack and post in **`#module-development`**:

- your GitHub username
- the module name: `cryptographics-jesstimer-remote`

Invite: https://bfoc.us/ke7e9dqgaz

They create `github.com/bitfocus/companion-module-cryptographics-jesstimer-remote`
and give you write access. Wait for this before pushing anything — you do not
create the repo yourself, and a personal repo will not be accepted.

---

## Step 2 — Manifest (done, one optional field)

`repository` and `bugs` already point at the URL the repo will have. Nothing to
change once it exists.

`maintainers` is deliberately minimal — name only, no email — since the manifest
ships to every user. Adding your GitHub username is optional and is how issue
triagers know who to tag:

```json
"maintainers": [{ "name": "CRYPTOGRAPHICS", "github": "<your-username>" }]
```

Your GitHub username becomes public through the repo request anyway, so this
leaks nothing new. Skip it if you would rather not.

---

## Step 3 — Verify the packaged build

This is the step most likely to surprise you. Companion does not run your source
files in production — it runs a webpack bundle, and bundling occasionally breaks
things that work fine in development.

```
npm install
npm run release-check
```

That runs the unit checks, the end-to-end protocol test, Bitfocus's own module
validator, and the real packaging step. It produces `pkg/` and a
`<name>-<version>.tgz`.

**Then install that .tgz in Companion and test it**, rather than trusting the
dev-path version you have been using. Companion's Modules page can load a `.tgz`
directly. Work through the same list you already used: connection goes green,
countdown live, end-action indicators, Companion restart resync, JessTimer hard
kill.

One specific thing to watch: the build **overwrites** `runtime.apiVersion` in the
packaged manifest with the version of `@companion-module/base` actually
installed — currently `1.13.6`, not the `1.13.0` in the source manifest. Since
API 1.13 is the ceiling for Companion 4.1, confirm the packaged module still
loads on your 4.1.4 before submitting. This is the same class of failure as the
original `1.14.1` rejection.

If you need to debug the bundle rather than the source, create an empty file
named `DEBUG-PACKAGED` in the module folder and Companion will run `pkg/`
instead. `npx companion-module-build --dev` produces a readable, unminified
bundle for that purpose.

---

## Step 4 — Tag a version

`package.json` is the source of truth for the version number; the build copies it
into the manifest. Use `major.minor.patch`.

```
git tag v1.0.0
git push origin v1.0.0
```

Or create a GitHub Release, which makes the tag for you.

---

## Step 5 — Submit for review

Go to **https://developer.bitfocus.io/** and sign in with GitHub.

1. Sidebar → **My Connections** → select the module
2. **Submit Version** at the bottom of the page
3. Choose the git tag
4. Tick **Is Prerelease** for a beta, otherwise leave it
5. **Submit** — status becomes "Pending"

Only versions submitted through the portal get reviewed. Reviews are done by
volunteers, so timing depends on availability and how much code changed. Feedback
comes back through the portal. Once approved, it is immediately downloadable by
anyone on Companion 4.0+.

---

## Licensing notes

The module is MIT, which is what Bitfocus expects and what nearly every module in
the store uses. `LICENSE` is in place.

Two things worth a moment's thought before you publish:

**The artwork is MIT too, by choice.** All 19 button PNGs are embedded as base64
in `src/images.js` and ship inside the bundle, so the same MIT grant covers them —
anyone may reuse the button graphics for anything. This was a deliberate decision,
recorded here so it is not mistaken for an oversight later. Note that once a
release goes out under MIT, that release stays MIT; terms can only change going
forward.

**The copyright line** in `LICENSE` reads "CRYPTOGRAPHICS". Adjust if you would
rather it name a different legal entity.

**Personal identifiers have been scrubbed** from everything that ships: no email
address in the manifest, no personal name in the license or comments, no machine
names in the generated file headers. The only occurrences of "Jess" are inside
the product name itself. If you re-run `tools/import-page.mjs`, the generated
banners stay generic — the export filename is deliberately not recorded.

---

## After publication

- Bug reports arrive as GitHub issues on the bitfocus repo
- Ship fixes by bumping `package.json`, tagging, and submitting again
- Watch the [API changelog](https://companion.free/for-developers/module-development/api-changes/)
  — moving to API 1.14 or 2.x later means raising the minimum Companion version,
  so there is no rush while 4.1 users matter to you

## Reference

- Releasing: https://companion.free/for-developers/module-development/module-lifecycle/releasing-your-module
- Packaging: https://companion.free/for-developers/module-development/module-lifecycle/module-packaging
- Developer portal: https://developer.bitfocus.io/
