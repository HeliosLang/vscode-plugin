import { ExtensionContext, Uri, Webview, workspace } from "vscode"

export async function loadWebview(
    context: ExtensionContext,
    relPath: string[],
    webview: Webview
): Promise<void> {
    return workspace.fs
        .readFile(Uri.joinPath(context.extensionUri, ...relPath))
        .then((content) => {
            webview.html = new TextDecoder("utf-8").decode(content)
        })
}
