# Helios VS Code Extension

Features:

- Syntax highlighting for .hl/.helios files.
- Syntax error diagnostics
- Helios Runner available in the Debug view
- Source breakpoints, expression stepping, step over/out, and selectable caller scopes
- Helios expressions in Debug Console and Watch, including conditional breakpoints

See the [reproducible time-lock debugger demonstration](docs/debugger-milestone.md) for exact cursor positions, scope values, and launch arguments. Backstepping is not supported.

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
