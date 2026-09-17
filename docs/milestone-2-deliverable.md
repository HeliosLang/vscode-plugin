# Helios Debugger demo: stepping through a time-lock validator

Project Catalyst project 1100155 — Helios debugger plugin for VSCode  
Milestone 2 — Stepping debugger

This walkthrough demonstrates how to use the Helios extension with VSCode's built-in debugger to set breakpoints, step through a script one expression at a time, inspect variables, and move between call-stack frames.

The demo builds on the time-lock validator used in milestone 1. The owner can always cancel and unlock the assets, while the beneficiary can only unlock the assets after the configured deadline. For this demonstration, the two checks in the Unlock branch are placed in a separate function, `validate_unlock`. This preserves the validation logic and gives us a caller and a callee to inspect in the debugger.

The procedure below addresses the [milestone 2 acceptance criteria](https://milestones.projectcatalyst.io/projects/1100155/milestones/2). Its numbered steps follow the style of the [milestone 1 walkthrough](https://docs.google.com/document/d/1zyemJexMB55eD-feSywnz6xvfOIkQnBWfRhC9Pw0vbI/edit).

## Prerequisites

- VSCode installed.
- The Helios extension, published by HeliosLang, with stepping-debugger support. This walkthrough targets version **0.2.3** of the extension in this repository.
- A local folder in which to save the demonstration script.

The demonstration runs locally. It does not require a wallet, funds, or a connection to a Cardano node.

## 1. Install the Helios VSCode extension

1. Open VSCode.
2. Open the Extensions view from the left sidebar, or press Ctrl+Shift+X.
3. Search for **Helios**.
4. Select the extension named **Helios**, published by **HeliosLang**, and install or update it.
5. Check the installed version in the extension details. Use version 0.2.3 for the reference trace below.
6. Reload VSCode if prompted.

The extension's Marketplace page is [Helios — Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=HeliosLang.helios).

If installing a supplied package for local verification, open the Extensions view's **…** menu, select **Install from VSIX…**, and choose `helios-0.2.3.vsix`.

## 2. Create the Helios script

Open your demonstration folder in VSCode using **File → Open Folder**. Create a file named `time_lock.hl` and paste the following code, starting on line 1:

```helios
spending time_lock

import { tx } from ScriptContext

struct Datum {
    lock_until: Time
    owner: PubKeyHash
    beneficiary: PubKeyHash
}

enum Redeemer {
    Cancel
    Unlock
}

func validate_unlock(datum: Datum, now: Time) -> () {
    assert(now > datum.lock_until, "time lock not yet expired");
    assert(tx.is_signed_by(datum.beneficiary), "not signed by beneficiary")
}

func main(datum: Datum, redeemer: Redeemer) -> () {
    redeemer.switch {
        Cancel => {
            assert(tx.is_signed_by(datum.owner), "not signed by owner")
        },
        Unlock => {
            now: Time = tx.time_range.start;
            validate_unlock(datum, now)
        }
    }
}
```

Save the file. Keep the blank lines and four-space indentation exactly as shown: the expected line and column positions depend on them. You can also use the repository's [time_lock.hl fixture](https://github.com/HeliosLang/vscode-plugin/blob/27cb9ac5bf09e7a87aae0f0fd61babf789a2fe68/examples/time_lock.hl).

## 3. Select the entry point and create the datum

1. Open **Run and Debug** from the left sidebar.
2. Select the **Helios: Run Current** launch configuration.
3. Open **Helios Entry Point & Arguments** and select `main` as the entry point.
4. In the dropdown below `datum: Datum`, select **Create a new Datum value**.
5. In the value editor, set `lock_until: Time` to `1000`.
6. Under `owner: PubKeyHash`, create a new PubKeyHash value, name it `owner`, and enter the owner hash below.
7. Return to the Datum editor. Under `beneficiary: PubKeyHash`, create another PubKeyHash value, name it `beneficiary`, and enter the beneficiary hash below.

| Field | Value |
| --- | --- |
| `lock_until` | `1000` |
| `owner` | `11111111111111111111111111111111111111111111111111111111` |
| `beneficiary` | `22222222222222222222222222222222222222222222222222222222` |

Each hash is a 56-character hexadecimal string. The time values in this guide are fixed test inputs so that every run produces the same result.

## 4. Create the redeemer and ScriptContext

1. Return to **Helios Entry Point & Arguments**.
2. Under `redeemer: Redeemer`, create a new Redeemer value and select **Unlock** in its **Variant** dropdown.
3. Under **ScriptContext**, select **Create a new ScriptContext value**.
4. In its **Fields** section, create a new `Tx` value for `tx: Tx`.
5. In the Tx editor, create a `TimeRange` value for `time_range`. Set **Start** to **Finite**, enter `2000`, and enable **Include bound?**. Set **End** to **Positive infinity**.
6. Return to the Tx editor. Under `signatories: []PubKeyHash`, create a new list value.
7. In the list editor's **Items** section, click **+** and select the previously created `beneficiary` value.
8. Set the context's `purpose` to a **Spending** ScriptPurpose. Use a TxOutputId with an all-zero 32-byte transaction ID and output index `0`.
9. Return to **Helios Entry Point & Arguments** and confirm that the datum, Unlock redeemer, and ScriptContext values are selected for `main`.

For the reference context, the other Tx lists and maps are empty, the fee and minted value are zero, and the Tx ID is an all-zero 32-byte hash. This is a synthetic context for local evaluation; it is not a transaction prepared for submission.

The important inputs for this validator are `lock_until = 1000`, `tx.time_range.start = 2000`, and the beneficiary's hash in `tx.signatories`. Together, they allow both Unlock checks to succeed.

## 5. Set two breakpoints

Return to `time_lock.hl` and click in the editor gutter to set ordinary, unconditional breakpoints on:

- **Line 17:** the check that the time lock has expired.
- **Line 18:** the check that the beneficiary has signed.

Before launch, the breakpoints may appear pending. They become verified after the script is compiled. Use the executable assertion lines above; blank lines and function declarations without an executable expression do not provide equivalent breakpoint locations.

**Expected state:** there is no paused call stack, no paused variable scope, and no debugger execution cursor yet. The normal text-editing cursor may remain wherever you last clicked.

## 6. Run the script and hit the first breakpoint

Press **F5**, or click the green Run button in the Run and Debug panel.

Execution pauses in `validate_unlock` at **line 17, column 11** of `time_lock.hl`.

In **Call Stack**, the frames appear in this order:

1. `validate_unlock` — line 17, column 11.
2. `main` — line 28, column 28.

Select `validate_unlock`. In **Variables**, expand the **User** scope. It contains `datum` and `now`. The value of `now` is `integer 2000`.

The datum is displayed in its underlying data representation:

```text
(list data) [(I 1000), (B #11111111111111111111111111111111111111111111111111111111), (B #22222222222222222222222222222222222222222222222222222222)]
```

Expand `datum` to inspect the three indexed components: the deadline, owner hash, and beneficiary hash. The **Internal** scope contains evaluator implementation bindings and can remain collapsed throughout this walkthrough.

## 7. Step through the evaluation one expression at a time

With `validate_unlock` selected, press **F11 — Step Into** four times. Check the debugger's highlighted source position after each press.

All positions below use VSCode's one-based line and column numbering. The file is `time_lock.hl` throughout.

| Action | Selected frame and source position | Call Stack, top to bottom | Expected User scope |
| --- | --- | --- | --- |
| First breakpoint, before stepping | `validate_unlock`, **17:11** | `validate_unlock` at 17:11; `main` at 28:28 | `datum`; `now = integer 2000` |
| F11 once | `validate_unlock`, **17:5** | `validate_unlock` at 17:5; `main` at 28:28 | Same `datum` and `now` |
| F11 twice | `validate_unlock`, **17:16** | `validate_unlock` at 17:16; `main` at 28:28 | Same `datum` and `now` |
| F11 three times | `validate_unlock`, **17:12** | `validate_unlock` at 17:12; `main` at 28:28 | Same `datum` and `now` |
| F11 four times | `validate_unlock`, **17:23** | `validate_unlock` at 17:23; `main` at 28:28 | Same `datum` and `now` |

Stepping follows nested source expressions, so several stops occur on the same line and the highlighted column can move backwards within the expression. The caller remains at 28:28 throughout these steps.

## 8. Move up and down the call stack

While paused after the fourth F11 press:

1. Click **main** in **Call Stack**.
2. Confirm that the selected-frame source highlight moves to **line 28, column 28**, where `validate_unlock(datum, now)` is called.
3. Expand **User** in the Variables view.

The caller's User scope contains:

| Variable | Expected value |
| --- | --- |
| `validate_unlock` | `<function datum>` |
| `datum` | The same datum data shown in step 6 |
| `redeemer` | `data (Constr 1 [])`, representing `Unlock` |
| `now` | `integer 2000` |

Now click **validate_unlock** in Call Stack again. The selected-frame highlight returns to **line 17, column 23**, and its User scope again contains only `datum` and `now = integer 2000`.

Selecting a frame changes the source and variables being inspected. It does not advance execution. The stack still contains `validate_unlock` at 17:23 and `main` at 28:28.

## 9. Evaluate Helios expressions in the Debug Console

Keep the script paused and select `validate_unlock`. Open **View → Debug Console**, or press Ctrl+Shift+Y.

Enter each expression below and press Enter:

| Helios expression | Expected result | Type |
| --- | --- | --- |
| `now > datum.lock_until` | `true` | `Bool` |
| `datum.lock_until` | `1000` | `Time` |
| `tx.is_signed_by(datum.beneficiary)` | `true` | `Bool` |

The same expressions can be added to the **Watch** panel. Select `main` in Call Stack and evaluate `now > datum.lock_until` again: it also returns `true`, using the caller's scope. Select `validate_unlock` again before continuing.

**Expected state:** execution remains paused at 17:23, the caller remains at 28:28, and the variables retain their values. Console evaluation does not advance the script. It supports inspecting and computing with scoped values; assigning new values to paused variables is not supported.

## 10. Continue to the second breakpoint

Press **F5 — Continue** once.

Execution pauses at the beneficiary-signature check on **line 18, column 11**.

**Expected Call Stack:** `validate_unlock` at **18:11**, followed by `main` at **28:28**. With `validate_unlock` selected, the User scope still contains the same `datum` and `now = integer 2000`.

## 11. Continue to the end

Press **F5 — Continue** again.

The script finishes successfully. The Debug Console displays `()`, the Unit return value.

**Expected state:** the debug session ends, the debugger execution cursor disappears, and there is no paused call stack or paused variable scope. There is no final paused line or column. The breakpoint markers can remain in the editor for the next run.

## Additional demo coverage

### Conditional breakpoints

The milestone's conditional-breakpoint stretch goal is supported using Helios expressions that return `Bool`.

1. Right-click the breakpoint on line 17 and choose **Edit Breakpoint**.
2. Enter `now > datum.lock_until` as an expression condition.
3. Start a new run. The debugger stops at **17:11**, with the same stack and scope as step 6.
4. Stop the session, change the condition to `now < datum.lock_until`, and start another run.
5. The condition is false, so execution skips the line-17 breakpoint and stops at **18:11**, with the stack and scope described in step 10.

If a condition cannot be evaluated, the debugger stops at the breakpoint and reports the error in the Debug Console. Remove the condition to repeat the main walkthrough exactly.

**F10 — Step Over** and **Shift+F11 — Step Out** are also supported. Step Out runs to the caller's next source expression, or to completion for a tail call. Backstepping, the other stretch goal, is not supported.

## Supporting evidence

The reference source and automated checks are available in the [Helios VSCode extension repository](https://github.com/HeliosLang/vscode-plugin), at commit `27cb9ac5bf09e7a87aae0f0fd61babf789a2fe68`:

- [Time-lock demonstration script](https://github.com/HeliosLang/vscode-plugin/blob/27cb9ac5bf09e7a87aae0f0fd61babf789a2fe68/examples/time_lock.hl).
- [Debugger acceptance tests](https://github.com/HeliosLang/vscode-plugin/blob/27cb9ac5bf09e7a87aae0f0fd61babf789a2fe68/apps/DebugAdapter/test/debugger.test.ts), including the exact stepping trace, caller and callee scopes, and typed expressions.
- [Technical reproduction notes](https://github.com/HeliosLang/vscode-plugin/blob/27cb9ac5bf09e7a87aae0f0fd61babf789a2fe68/docs/debugger-milestone.md).

Local verification on 14 September 2026: `pnpm -C apps/DebugAdapter test` completed successfully, including the TypeScript check and all **11 debugger tests**. These checks exercise the adapter and source mappings; they do not establish Marketplace publication or replace the recorded VSCode demonstration.

Public release evidence: **[CONFIRM MARKETPLACE VERSION AND ADD RELEASE DATE OR RELEASE LINK]**

<!-- Author note: Before submission, replace the release-evidence placeholder, verify this procedure visually with the published extension, and remove this note. Marketplace publication was not verified while preparing this draft. The milestone's video evidence is being prepared separately. -->
