// vscode.d.ts
// Minimal types for the VS Code Webview API available inside webview scripts.
// Add this file to your project (e.g., at repo root) and ensure it's included by tsconfig.json.
// Example tsconfig:
// {
//   "compilerOptions": { "strict": true, "module": "esnext", "target": "es2020" },
//   "include": ["src", "vscode.d.ts"]
// }

declare global {
    /**
     * The VS Code API object returned by `acquireVsCodeApi()`.
     * You can parameterize State to your persisted state shape.
     */
    interface VSCodeAPI<State = unknown> {
        /**
         * Post a message to the extension host. The message will be received in the
         * extension via `webview.onDidReceiveMessage`.
         */
        postMessage(message: unknown): void

        /**
         * Get the persisted state for this webview, or `undefined` if none was set.
         * The generic type defaults to the `State` parameter of `VSCodeAPI`.
         */
        getState<T = State>(): T | undefined

        /**
         * Persist state for this webview. Returned value equals the provided state.
         * The state is restored when the webview is recreated.
         */
        setState<T = State>(newState: T): T
    }

    /**
     * Acquire the VS Code API object. Only available at runtime inside a VS Code webview.
     */
    function acquireVsCodeApi<State = unknown>(): VSCodeAPI<State>

    /**
     * Message events posted from the extension are delivered via `window.postMessage`
     * and can be listened to with:
     *   window.addEventListener('message', (e: VSCodeMessageEvent<YourMessageType>) => { ... });
     * Use the generic parameter to type the `data` payload.
     */
    interface VSCodeMessageEvent<T = unknown> extends MessageEvent<T> {}
}

export {}
