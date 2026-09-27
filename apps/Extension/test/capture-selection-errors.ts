import * as vscode from "vscode"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

/** Exercise real providers and persisted values in an isolated time_lock workspace. */
export async function checkSelectionErrors(
    rowId: string,
    checkpoint: (
        phase: string,
        error?: string
    ) => Promise<void> = async () => {}
) {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath
    const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(join(root, "time_lock.hl"))
    )
    const original = doc.getText()
    const storePath = join(root, ".vscode", "heliosdebugger.json")
    const before = await readFile(storePath, "utf8")
    const replace = async (text: string) => {
        const edit = new vscode.WorkspaceEdit()
        edit.replace(
            doc.uri,
            new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(doc.getText().length)
            ),
            text
        )
        assert.ok(await vscode.workspace.applyEdit(edit))
        assert.ok(await doc.save())
    }
    const select = () =>
        vscode.commands.executeCommand<{ success: boolean; error?: string }>(
            "helios.loadCapturedTx",
            rowId
        )
    try {
        assert.ok(original.includes("struct Datum {"))
        await replace(
            original.replace("struct Datum {", "struct Datum {\n    extra: Int")
        )
        const changed = await select()
        assert.equal(changed?.success, false)
        assert.match(changed!.error!, /local types for validator "time_lock"/)
        assert.match(changed!.error!, /Revert the local type changes/)
        assert.match(changed!.error!, /Cannot import datum/)
        assert.equal(
            await readFile(storePath, "utf8"),
            before,
            "incompatible types must not change saved arguments"
        )
        await vscode.commands.executeCommand("helios.refreshCapturedTxs")
        await checkpoint("changed-types", changed!.error)

        await replace(
            original.replace("spending time_lock", "spending renamed_time_lock")
        )
        const missing = await select()
        assert.equal(missing?.success, false)
        assert.match(
            missing!.error!,
            /Validator "time_lock" can't be found in the local workspace/
        )
        assert.equal(
            await readFile(storePath, "utf8"),
            before,
            "missing validator must not change saved arguments"
        )
        await vscode.commands.executeCommand("helios.refreshCapturedTxs")
        await checkpoint("missing-validator", missing!.error)
    } finally {
        await replace(original)
    }
    const restored = await select()
    assert.equal(
        restored?.success,
        true,
        "restoring the source must allow capture selection again"
    )
    assert.deepEqual(
        JSON.parse(await readFile(storePath, "utf8")),
        JSON.parse(before),
        "restoring and reimporting must reuse values"
    )
    await checkpoint("restored")
}
