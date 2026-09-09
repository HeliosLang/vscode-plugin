# Stepping debugger acceptance demonstration

The fixture is [time_lock.hl](../examples/time_lock.hl), based on the time-lock validator in the compiler README. The Unlock branch's two checks are extracted into `validate_unlock` so the demonstration has a real caller and callee to select in VS Code. The validation logic is unchanged. The original milestone-1 demonstration document was not present in this repository.

## Setup

1. Build the extension with `pnpm install --frozen-lockfile` and `pnpm build`. Install a packaged VSIX, or launch the Extension Development Host as described in the repository README.
2. In the window running this extension, open this repository's **examples** folder as the workspace.
3. Open `time_lock.hl`. This generates a minimal **Helios: Run Current** configuration in `examples/.vscode/launch.json`; the generated file is intentionally untracked. Existing non-Helios launch configurations are preserved, while stale Helios configurations are replaced.
4. Select `main` in **Helios Entry Point & Arguments** and set the datum, redeemer, and script-context values described below. The dropdown and Arguments menu are the sole source of the compiled entry point and its arguments.

The datum has `lock_until = Time::new(1000)`, an owner hash of 28 `11` bytes, and a beneficiary hash of 28 `22` bytes. The redeemer is `Unlock`. The transaction's validity range begins at `Time::new(2000)` and its signatories contain the beneficiary. The context is a deterministic synthetic spending context, sufficient for these checks; it is not a balanced transaction for submission.

Do not change fixture line breaks or indentation. All positions below are **one-based line:column**, as displayed in VS Code. Internal scope handles are session-local identifiers and are not acceptance values.

## Reproducible procedure

Set ordinary gutter breakpoints on **lines 17 and 18**, then press F5. Before launch they may appear pending; after compilation they are verified. Blank lines and function declaration lines with no executable expression remain unverified.

| Action                                  | Selected frame and cursor                               | Expected User scope                                                                                  |
| --------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Set the two breakpoints, before running | No execution cursor or call stack                       | No paused scope                                                                                      |
| F5: hit the first breakpoint            | `validate_unlock`, **17:11**                            | `datum`, `now = integer 2000`                                                                        |
| F11: Step Into once                     | `validate_unlock`, **17:5**                             | Same values                                                                                          |
| F11 again                               | `validate_unlock`, **17:16**                            | Same values                                                                                          |
| F11 again                               | `validate_unlock`, **17:12**                            | Same values                                                                                          |
| F11 again                               | `validate_unlock`, **17:23**                            | Same values                                                                                          |
| Select `main` in Call Stack             | `main`, **28:28**                                       | `validate_unlock = <function datum>`, `datum`, `redeemer = data (Constr 1 [])`, `now = integer 2000` |
| Select `validate_unlock` again          | `validate_unlock`, **17:23**                            | `datum`, `now = integer 2000`                                                                        |
| F5: continue to the second breakpoint   | `validate_unlock`, **18:11**                            | Same callee values                                                                                   |
| F5: continue to completion              | Debug session ends; no execution cursor or paused stack | Scopes disappear; evaluation succeeds with `()` in Debug Console                                     |

Throughout the paused callee steps, Call Stack contains exactly `validate_unlock` and `main`; the caller remains at **28:28**. Selecting a frame changes the displayed source/scope, not execution. The datum displays as:

```text
(list data) [(I 1000), (B #11111111111111111111111111111111111111111111111111111111), (B #22222222222222222222222222222222222222222222222222222222)]
```

Expand `datum` to inspect its three indexed components. **Internal** contains the CEK implementation's bindings and can remain collapsed.

Stepping follows evaluation of nested source expressions: application, function reference, comparison, and operands. Columns can move within an expression as its children are evaluated. Creating a closure and reducing a completed CEK frame do not count as new source-expression visits. In particular, finishing a function does not jump back to its declaration. F10 skips nested function bodies, and Shift+F11 runs to the caller's next source expression (or completion for a tail call).

## Debug Console, watches, and conditions

While paused in `validate_unlock`, evaluate these Helios expressions in Debug Console or Watch:

```helios
now > datum.lock_until
datum.lock_until
tx.is_signed_by(datum.beneficiary)
```

The results are `true` (`Bool`), `1000` (`Time`), and `true` (`Bool`). Select `main` and evaluate `now > datum.lock_until` again: it also returns `true` using the caller's environment. Expressions are compiled with the original lexical types and evaluated in a separate, bounded CEK machine. They can call available local closures and do not advance the paused script or mutate its variables. Malformed expressions and type errors are reported as evaluation errors.

VS Code supports conditional breakpoints. Right-click the line-17 breakpoint, choose **Edit Breakpoint**, and enter `now > datum.lock_until`. Relaunch: it stops at the first breakpoint. Change the condition to `now < datum.lock_until` and relaunch: it skips line 17 and stops at **18:11**. A condition must return `Bool`; an evaluation error stops at the breakpoint and explains the failure in Debug Console, allowing the condition to be corrected.

Raw UPLC launches without original Helios sources can step and inspect CEK values, but cannot evaluate typed Helios expressions. Variable assignment and backstepping are not supported.

## Automated verification and release

Run `pnpm -C apps/DebugAdapter test`. The tests compile the fixture, round-trip its full UPLC encoding, assert the exact positions/frame names/scopes above, check that the launch arguments match the generated context, and exercise real DAP messages over stdio. Additional cases cover step-in/over/out, conditional breakpoints, local closures, invalid expressions, expandable data, non-BMP Unicode columns, and zero-based DAP clients.

The extension and debug adapter bundle compiler v0.17.33, which includes the debugger compiler changes; no compiler patch or separate workspace compiler installation is needed. Workspace dependencies are left untouched; selecting a workspace-installed compiler is not currently supported. The UPLC dependency patch supplies CEK stepping/snapshots and caller environments and must be retained on a fresh install.

These checks verify the adapter and source mappings. A visual walkthrough in VS Code and publication to the public extension marketplace remain release steps; building or testing this branch does not publish it.
