# Helios Debugger demo: recursive asset search across modules

This video walkthrough extends the time-lock example with a recursive search of transaction inputs. Unlocking requires an expired deadline, the beneficiary's signature, and an input containing the demonstration token. The search lives in a separate Helios module so the recording shows stepping across files and inspecting multiple recursive call frames.

Use the [example folder](../examples/time_lock_asset_search/), containing [time_lock.hl](../examples/time_lock_asset_search/time_lock.hl) and [asset_search.hl](../examples/time_lock_asset_search/asset_search.hl). The original single-file milestone acceptance example is unchanged.

The context is synthetic and evaluated locally. No wallet, funds, or Cardano node is required. The token check illustrates a debugger workflow; it is not a complete token-based authorization design.

## 1. Prepare VSCode

1. Build and install the extension containing this change.
2. In the VSCode window running that extension, use **File → Open Folder** to open `examples/time_lock_asset_search` itself. Open both `.hl` files, then select `time_lock.hl`.
3. Open **Run and Debug**, choose **Helios: Run Current**, and select `main` in **Helios Entry Point & Arguments**.
4. Enable editor line numbers and keep **Call Stack**, **Variables**, and **Debug Console** visible while recording.

Keep the fixture's line breaks and indentation unchanged. All positions below are one-based line:column positions in the checked-in files.

With this folder open, named values and their links are saved in `examples/time_lock_asset_search/.vscode/heliosdebugger.json`. Creating a value through a dropdown opens its editor; return to the parent editor's tab to continue configuring that parent. Use the pencil button beside a selected value to reopen its editor.

## 2. Set up the original time-lock arguments

In **Helios Entry Point & Arguments**, create a new `Datum` value. Set `lock_until` to `1000`. Create two `PubKeyHash` values from its fields:

| Name | Field | Hexadecimal value |
| --- | --- | --- |
| `owner` | `owner` | `11111111111111111111111111111111111111111111111111111111` |
| `beneficiary` | `beneficiary` | `22222222222222222222222222222222222222222222222222222222` |

Create a `Redeemer` value and select **Unlock** in its Variant dropdown.

Create a `ScriptContext` value, then create a `Tx` value from its `tx` field. In the Tx editor:

1. Create a `TimeRange` for `time_range`. Set **Start** to **Finite**, enter `2000`, and leave **Include bound?** checked. Set **End** to **Positive infinity**.
2. Create a `[]PubKeyHash` list for `signatories`. Click **+** in Items and select `beneficiary`.
3. Create a `TxId` for `id`, name it `demo_tx_id`, and enter 64 zeros:

   ```text
   0000000000000000000000000000000000000000000000000000000000000000
   ```

Leave other transaction lists and maps empty, and fee and minted value at zero. The `inputs` list is configured next.

## 3. Create three input values

In the Tx editor, create a new `[]TxInput` value for **inputs**, not `ref_inputs`. In its Items section, click **+**, then choose **Create new TxInput value** for the added item.

Build three independently named inputs in this order:

| Input name | Output index | Output value |
| --- | --- | --- |
| `input_ada` | `0` | 2,000,000 lovelace only |
| `input_other` | `1` | 2,000,000 lovelace and one OTHER token |
| `input_demo` | `2` | 2,000,000 lovelace and one DEMO token |

For each input:

1. Create a `TxOutputId` for its `output_id` field. Select `demo_tx_id` for its transaction ID and enter the index from the table.
2. Create a separate `TxOutput` for its `output` field. Keep the default synthetic address, no output datum, and no reference script.
3. Create a separate `Value` for the output's `value` field, named `value_ada`, `value_other`, or `value_demo` respectively.
4. Return to the inputs list before adding the next input. Do not reuse one TxOutput or Value for all three inputs: editing a shared value also updates its linked parents.

### Add the ADA entry to each Value

New Value editors already contain **Policy 0**, set to **ADA**, and one token entry with an empty name and quantity `0`. Keep the policy and empty token name, and change that quantity to `2000000`. Do not add a second ADA row.

ADA uses an empty policy hash and an empty token name. The quantity is in lovelace.

### Add OTHER and DEMO

For `value_other` and `value_demo`, add a second policy row. In `value_other`, use its policy dropdown to create a `MintingPolicyHash` value, name it `demo_policy`, and set its hash to:

```text
33333333333333333333333333333333333333333333333333333333
```

In `value_demo`, select the same `demo_policy` value for the second policy row. Add one token entry under that row in each Value:

| Value | Token-name bytes, entered as plain hex | Quantity |
| --- | --- | --- |
| `value_other` | `4f54484552` (OTHER) | `1` |
| `value_demo` | `44454d4f` (DEMO) | `1` |

The validator's `REQUIRED_ASSET` constant matches `demo_policy` plus DEMO. Matching a policy alone is insufficient: OTHER must be skipped.

## 4. Complete the context and check persistence

Return to the ScriptContext editor. Create a `ScriptPurpose` for `purpose`, choose **Spending**, and select the TxOutputId used by `input_ada` for its output reference.

Return to **Helios Entry Point & Arguments** and confirm that `main` has the configured Datum, Unlock redeemer, and ScriptContext selected. The transaction inputs must remain ordered `input_ada`, `input_other`, `input_demo`.

Check that `.vscode/heliosdebugger.json` has been created and contains the named values. Use **Developer: Reload Window**, reopen the Helios file and relevant value editors, and confirm the values and selections are restored. Tabs need not reopen automatically; the saved values should still be selectable.

## 5. Step from the validator into the module

Start with no breakpoints except an unconditional gutter breakpoint on **time_lock.hl line 25**, the asset assertion. Press **F5**.

Execution first stops in `validate_unlock` at **25:11**. The caller is `main` at **35:28**. Inspect `datum` and `now = integer 2000` in User scope; evaluate `now > datum.lock_until` in Debug Console to obtain `true`.

Press **F11 — Step Into** eight times:

| State | Selected source position |
| --- | --- |
| Initial breakpoint | `time_lock.hl` **25:11** |
| F11 once | `time_lock.hl` **25:5** |
| F11 twice | `time_lock.hl` **25:26** |
| F11 three times | `time_lock.hl` **25:12** |
| F11 four times | `time_lock.hl` **25:29** |
| F11 five times | `time_lock.hl` **25:30** |
| F11 six times | `time_lock.hl` **25:27** |
| F11 seven times | `time_lock.hl` **25:38** |
| F11 eight times | `asset_search.hl` **4:5**, in `contains_asset` |

The editor now shows the imported module. These are expression steps, so several stops occur on one line and columns do not necessarily increase.

Remove the validator's line-25 breakpoint while paused. Add an unconditional breakpoint on **asset_search.hl line 9**, after `input` and `quantity` have been bound. Press **F5** to reach it.

## 6. Follow the recursive calls

Each search stop is at **asset_search.hl 9:9**. Expand the top frame's **User** scope: it contains `inputs`, `asset`, `input`, and `quantity`. Use Debug Console or Watch for these readable Helios expressions:

```helios
inputs.length
quantity
input.output_id.index
input.output.value.get_safe(asset)
```

Press **F5** between stops:

| Stop | `inputs.length` | `quantity` | `input.output_id.index` | Why |
| --- | --- | --- | --- | --- |
| First | `3` | `0` | `0` | ADA-only input does not contain DEMO |
| Second | `2` | `0` | `1` | OTHER is not DEMO |
| Third | `1` | `1` | `2` | DEMO is present |

At the first stop, Call Stack is:

```text
contains_asset    asset_search.hl  9:9
validate_unlock   time_lock.hl    25:26
main              time_lock.hl    35:28
```

At the second stop, one earlier `contains_asset` frame appears at **asset_search.hl 12:27**. At the third stop the complete stack, from top to bottom, is:

| Frame | Position | Scoped `inputs.length` | Scoped `quantity` |
| --- | --- | --- | --- |
| Current `contains_asset` | `asset_search.hl` **9:9** | `1` | `1` |
| Previous `contains_asset` | `asset_search.hl` **12:27** | `2` | `0` |
| Original `contains_asset` | `asset_search.hl` **12:27** | `3` | `0` |
| `validate_unlock` | `time_lock.hl` **25:26** | — | — |
| `main` | `time_lock.hl` **35:28** | — | — |

Select each recursive frame and evaluate `inputs.length`. The different results demonstrate that each activation retains its own scope. Select `validate_unlock` and evaluate `now > datum.lock_until`: it returns `true`. Select the top `contains_asset` frame again; execution remains at **9:9**.

Press **F5** to finish. The search returns true, the assertion succeeds, and the Debug Console displays `()`. The paused stack and execution cursor disappear.

## 7. Stop only when a matching input is found

Right-click the module's line-9 breakpoint, choose **Edit Breakpoint**, and set the expression condition to:

```helios
quantity > 0
```

Start another run. The debugger skips the first two inputs and stops at **asset_search.hl 9:9** with `inputs.length = 1` and `quantity = 1`. The stack is the five-frame stack from the third stop above. Continue to successful completion.

For an explicit false-condition demonstration, change the condition to `quantity > 1` and rerun. None of the inputs satisfies it, so the script finishes without pausing. Restore `quantity > 0` afterwards.

## 8. Demonstrate the empty-list base case and validation failure

1. In the `value_demo` editor, change the DEMO token quantity from `1` to `0`. The link updates the output, input, inputs list, and ScriptContext.
2. Keep the line-9 condition `quantity > 0` and add an unconditional breakpoint on **asset_search.hl line 5**, the `false` base case.
3. Rerun. No positive match is found, so the debugger pauses at **5:9**.
4. Evaluate `inputs.length`: it is `0`. This frame has `inputs` and `asset`, but no `input` or `quantity`, because the nonempty branch was not entered.
5. Continue. The validator fails with **required asset not found** in Debug Console.
6. Restore the DEMO quantity to `1`, remove the base-case breakpoint, and rerun to end the recording with a successful evaluation.

## Verification

The debugger tests cover the exact cross-file stepping sequence, recursive breakpoint re-entry and caller scopes, scoped expressions, conditional stops, missing assets, empty inputs, zero quantity, and the unchanged Cancel branch. Run them from the repository root with:

```sh
pnpm -C apps/DebugAdapter test
```

Verification on 15 September 2026: all 16 debugger tests pass, the ValueView type check passes, and the full extension builds. The form workflow was exercised with the built webviews in a Playwright browser harness using the extension's real value-storage provider and a temporary workspace. The saved values and links were restored from disk; the resulting context evaluated successfully, failed with the expected message after the DEMO quantity was changed to zero, and succeeded again after restoring it. This checks the forms and stored data; the VSCode window and recording controls still need the final recording rehearsal.

This guide supplies the example and recording sequence. The video itself and publication of the updated extension are separate steps.
