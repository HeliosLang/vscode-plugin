# Helios VS Code Extension

Features:

- Syntax highlighting for .hl/.helios files.
- Syntax error diagnostics
- Helios Runner available in the Debug view
- Source breakpoints, expression stepping, step over/out, and selectable caller scopes
- Helios expressions in Debug Console and Watch, including conditional breakpoints

See the [reproducible time-lock debugger demonstration](docs/debugger-milestone.md) for exact cursor positions, scope values, and launch arguments. Backstepping is not supported.

For a module-based recording example, use the [recursive asset-search walkthrough](docs/recursive-asset-search-demo.md). It covers creating transaction inputs in the forms, repeated recursive breakpoints, caller scopes, conditional breakpoints, and a missing-token failure.

## Running the extension in debug mode

Use VS Code's Extension Development Host when working on the plugin locally.

1. Open this repository in VS Code.
2. Install dependencies:

    ```sh
    pnpm install
    ```

3. Start the extension host by pressing `F5`, or by opening **Run and Debug**
   and selecting **Run Helios Extension**.

The `Run Helios Extension` launch configuration is defined in
`.vscode/launch.json`. Before the Extension Development Host opens, VS Code runs
the `prelaunch` task from `.vscode/tasks.json`, which builds the packages,
builds the webviews and debug adapter, packages the extension, and installs the
VSIX.

After the Extension Development Host opens:

1. Open a `.hl` or `.helios` file in that new VS Code window.
2. Open the **Run and Debug** sidebar.
3. Use **Helios: Run Current** to run the active Helios file.

The extension contributes the Helios debug adapter as `heliosdebugger`. The
minimal debug configuration is:

```json
{
    "type": "heliosdebugger",
    "request": "launch",
    "name": "Helios: Run Current"
}
```

The extension fills in the compiled UPLC program and arguments at runtime from
the active Helios document and the **Helios Entry Point & Arguments** debug
view.

### Debugging tips

If the extension host is already open after a code change, run **Developer:
Reload Window** in the Extension Development Host command palette.

To inspect syntax highlighting scopes, open a Helios file and run **Developer:
Inspect Editor Tokens And Scopes** from the command palette.

## Further reading

https://macromates.com/manual/en/language_grammars#naming-conventions

## Captured failed transactions

Run `helios login` with the Helios CLI, then open your validator workspace in
VS Code. In **Run and Debug**, expand **Helios Captured Failed Txs**. It shows
**Timestamp | Project | Validator**, newest first, across your configured projects.
The icon in the section title refreshes the feed. The view polls every five
seconds while visible, with backoff when the service is unavailable or rate limited.
Initial history loads progressively; the view retains the latest 100 failed
captures across projects, with one row per recorded script evaluation.

Selecting a row finds the validator by its declared name in `.hl` or `.helios`
workspace files, opens it, and selects `main`. Duplicate matches offer a file
picker; missing validators, compilation errors and incompatible captures report
an error above the captures table. Incompatible local types must be reverted to
match the capture before importing; failed imports leave saved arguments intact.
Sources are compiled with the extension's existing compiler **0.17.33**.
Manual captures can omit embedded source text. On selection, source-map names
are matched against the open workspace to identify the validator. Imported
modules are excluded; multiple matching validators remain an ambiguity error.
Without embedded sources, compatibility cannot be checked and a warning is shown.

Differences from captured sources produce a warning: Run uses your current local
source, allowing you to test fixes, rather than replaying production bytecode.

Captured Plutus V2 arguments populate the existing argument and value editors:
spending validators receive datum, redeemer and ScriptContext; non-spending
validators receive redeemer and ScriptContext. Values and nested structures are
persisted through the normal `values`/`links` store in the selected workspace
folder's `.vscode/heliosdebugger.json`. Existing values with matching type and CBOR
are reused, preserving their names. New values use the first capture-ID segment,
the type and a collision-free numeric suffix. Primitive nested fields stay inline; hashes and IDs receive named entries as required
by their existing dropdown editors.
Repeated capture selection does not create duplicate values. Editing a reused
value updates all its existing links, just like manually created values.

The extension reads credentials from the same `debugger.json` as the CLI:
`HELIOS_CONFIG_HOME` when set; otherwise `$XDG_CONFIG_HOME/helios` (or
`~/.config/helios`) on Linux, `~/Library/Application Support/Helios` on macOS,
and `%APPDATA%/Helios` on Windows. Credentials are read on the extension host;
for remote workspaces, run `helios login` on that host. Keys remain out of the
workspace value file and webviews. Refresh rereads the configuration after login.

**Helios script errors** is enabled by default in the Breakpoints section.
Failures pause at the failing expression with stack frames, variables and
exception details available. Continue finishes the failed run. Uncheck the
exception filter to restore immediate termination on errors.

### Capture integration checks

Run `pnpm test` and `pnpm build`. For an optional private, real-capture check:

```sh
HELIOS_CAPTURE_FIXTURE=/path/to/failed-capture.json pnpm -C apps/Extension test:unit
```

The fixture must be a time-lock capture compatible with `examples/time_lock.hl`
and `examples/asset_search.hl`. Its contents are not logged or committed.

The Extension Development Host test uses a fake HTTP service and fake API key.
Build it with `node apps/Extension/build-host-test.mjs`, copy both example `.hl`
files into an isolated temporary workspace, then launch VS Code with a private
`HELIOS_CONFIG_HOME`, separate `--user-data-dir` and `--extensions-dir`,
`--extensionDevelopmentPath` pointing to this repository, and
`--extensionTestsPath` pointing to `dist/extension-host.test.cjs`.
It verifies polling, refresh, imported values, repeat-selection reuse and a real
DAP exception stop, incompatible-type and missing-validator errors, and recovery
after restoring the source. It never uses a production key or submits transactions.

### Captured compilation context

New captures restore compile-time parameter overrides (including imported-module constants), network settings and validator dependencies before source debugging. Parameters and captured validator hash dependencies also apply to watch expressions, including imported address constants. The unoptimized compilation inputs contain the optimized validator hashes used by the deployment; watch evaluation never hashes the debug program to obtain an address. Missing hashes in legacy captures are reported explicitly. Local optimized hashes are checked against the captured validator; a mismatch is reported as a local reconstruction and does not prevent debugging. The captured and local compiler versions are shown.

Compilation context is saved with imported arguments in `.vscode/heliosdebugger.json`, scoped by source URI. **Helios: Show Captured Compilation Parameters** opens a read-only view of the captured context. **Helios: Clear Captured Compilation Context** restores local source defaults while preserving arguments. Legacy captures remain usable with a warning that compilation context is unavailable. No source constants are rewritten.

User-defined types keep short names when unique. If multiple modules define the same type name, the argument editor and saved values use qualified names such as `assets_validator::Action`. Existing entry-point values are relinked from their stored CBOR when selected; standalone ambiguous legacy values are preserved without guessing their owner.
