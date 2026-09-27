import { request as httpsRequest } from "node:https"
import { request as httpRequest } from "node:http"
import { type CaptureProfile } from "./captureConfig"

export type CaptureEvaluation = {
    plutusVersion: string
    scriptHash: string
    arguments: string[]
    sourceMap?: { sourceNames?: string[] }
    companion?: { sourceMap?: { sourceNames?: string[] } }
}
export type Capture = {
    version: number
    captureId: string
    status: string
    evaluations: CaptureEvaluation[]
    sources?: Record<string, string>
}
export type CaptureIndex = {
    captureId: string
    status: string
    createdAt: number
    seq: number
}
export type CaptureRow = {
    id: string
    projectId: string
    project: string
    captureId: string
    timestamp: number
    validator: string
    evaluationIndex: number
    error?: string
}
export class ServiceError extends Error {
    constructor(readonly status: number) {
        super(
            status === 401 || status === 403
                ? "API key rejected. Run helios login to update your projects."
                : `Debugger service returned HTTP ${status}`
        )
    }
}
// Node transport works in the extension's minimum VS Code runtime; no webview networking.
export function requestJson(
    profile: CaptureProfile,
    path: string,
    signal: AbortSignal
): Promise<any> {
    return new Promise((resolve, reject) => {
        const url = new URL(path, profile.endpoint)
        const request = (
            url.protocol === "https:" ? httpsRequest : httpRequest
        )(
            url,
            {
                headers: {
                    Authorization: `Bearer ${profile.apiKey}`,
                    Accept: "application/json"
                },
                signal
            },
            (response) => {
                if (response.statusCode !== 200) {
                    response.resume()
                    reject(new ServiceError(response.statusCode ?? 0))
                    return
                }
                const chunks: Buffer[] = []
                let size = 0
                response.on("data", (chunk: Buffer) => {
                    size += chunk.length
                    if (size > 10 * 1024 * 1024) {
                        request.destroy(new Error("Capture exceeds 10 MiB"))
                        return
                    }
                    chunks.push(chunk)
                })
                response.on("error", reject)
                response.on("end", () => {
                    try {
                        resolve(
                            JSON.parse(Buffer.concat(chunks).toString("utf8"))
                        )
                    } catch {
                        reject(new Error("Invalid debugger service response"))
                    }
                })
            }
        )
        const timeout = setTimeout(
            () => request.destroy(new Error("Debugger service timed out")),
            10000
        )
        request.on("close", () => clearTimeout(timeout))
        request.on("error", () =>
            reject(
                signal.aborted
                    ? new Error("Cancelled")
                    : new Error("Debugger service unavailable")
            )
        )
        request.end()
    })
}
export function validatorName(
    capture: Capture,
    evaluation: CaptureEvaluation
): string | undefined {
    const names = new Set([
        ...(evaluation.sourceMap?.sourceNames ?? []),
        ...(evaluation.companion?.sourceMap?.sourceNames ?? [])
    ])
    const validators = new Set<string>()
    for (const name of names) {
        const match = capture.sources?.[name]?.match(
            /^\s*(?:spending|minting|staking|mixed|certifying|rewarding)\s+([A-Za-z_]\w*)\b/
        )
        if (match) validators.add(match[1])
    }
    return validators.size === 1 ? [...validators][0] : undefined
}
export function validateCapture(value: any, id: string): Capture {
    if (
        !value ||
        value.version !== 1 ||
        value.captureId !== id ||
        value.status !== "failed" ||
        !Array.isArray(value.evaluations) ||
        value.evaluations.length > 10000
    )
        throw new Error("Invalid capture v1 response")
    for (const e of value.evaluations) {
        if (
            !e ||
            !Array.isArray(e.arguments) ||
            !e.arguments.every(
                (a: unknown) =>
                    typeof a === "string" && /^(?:[a-f0-9]{2})+$/i.test(a)
            ) ||
            typeof e.plutusVersion !== "string"
        )
            throw new Error("Invalid capture evaluation")
        for (const m of [e.sourceMap, e.companion?.sourceMap])
            if (
                m?.sourceNames &&
                (!Array.isArray(m.sourceNames) ||
                    !m.sourceNames.every((n: unknown) => typeof n === "string"))
            )
                throw new Error("Invalid source metadata")
    }
    if (
        value.sources &&
        (typeof value.sources !== "object" ||
            Array.isArray(value.sources) ||
            !Object.values(value.sources).every((s) => typeof s === "string"))
    )
        throw new Error("Invalid captured sources")
    return value
}

type FeedState = {
    profile: CaptureProfile
    cursor: string
    entries: CaptureIndex[]
    failures: number
    retryAt: number
    name: string
    named: boolean
    disabled: boolean
    error?: string
}
export class CaptureFeed {
    private feeds = new Map<string, FeedState>()
    private payloads = new Map<string, Capture>()
    errors: string[] = []
    rows: CaptureRow[] = []
    constructor(
        private readonly request = requestJson,
        private readonly now = Date.now
    ) {}
    configure(profiles: CaptureProfile[]) {
        const next = new Map<string, FeedState>()
        for (const p of profiles) {
            const old = this.feeds.get(p.id)
            if (
                old &&
                old.profile.apiKey === p.apiKey &&
                old.profile.endpoint === p.endpoint
            ) {
                old.profile = p
                next.set(p.id, old)
            } else {
                next.set(p.id, {
                    profile: p,
                    cursor: "0",
                    entries: [],
                    failures: 0,
                    retryAt: 0,
                    name: p.name,
                    named: false,
                    disabled: false
                })
                for (const k of this.payloads.keys())
                    if (k.startsWith(p.id + ":")) this.payloads.delete(k)
            }
        }
        this.feeds = next
        for (const k of this.payloads.keys())
            if (!next.has(k.split(":")[0])) this.payloads.delete(k)
    }
    capture(row: CaptureRow): Capture | undefined {
        return this.payloads.get(`${row.projectId}:${row.captureId}`)
    }
    async poll(signal: AbortSignal, force = false): Promise<void> {
        this.errors = []
        for (const feed of this.feeds.values()) {
            if (signal.aborted) return
            if (!force && (feed.disabled || feed.retryAt > this.now())) continue
            try {
                if (!feed.named) {
                    const project = await this.request(
                        feed.profile,
                        "/v1/project",
                        signal
                    )
                    if (typeof project.name !== "string")
                        throw new Error("Invalid project response")
                    feed.name = project.name
                    feed.named = true
                }
                // Bound each poll. More index pages are picked up on the next tick.
                for (let page = 0; page < 4; page++) {
                    const result = await this.request(
                        feed.profile,
                        `/v1/captures?cursor=${feed.cursor}`,
                        signal
                    )
                    if (
                        !Array.isArray(result.captures) ||
                        result.captures.length > 100 ||
                        !/^\d{1,15}$/.test(result.cursor) ||
                        Number(result.cursor) < Number(feed.cursor)
                    )
                        throw new Error("Invalid capture feed response")
                    for (const c of result.captures)
                        if (
                            !c ||
                            !/^[a-f0-9-]{36}$/.test(c.captureId) ||
                            !Number.isSafeInteger(c.createdAt) ||
                            !Number.isSafeInteger(c.seq) ||
                            c.seq <= Number(feed.cursor) ||
                            c.seq > Number(result.cursor) ||
                            !["failed", "succeeded"].includes(c.status)
                        )
                            throw new Error("Invalid capture index")
                    if (
                        result.captures.length &&
                        Number(result.cursor) <= Number(feed.cursor)
                    )
                        throw new Error("Capture cursor did not advance")
                    const entries = new Map(
                        feed.entries.map((c) => [c.captureId, c])
                    )
                    for (const c of result.captures)
                        if (c.status === "failed") entries.set(c.captureId, c)
                    feed.entries = [...entries.values()]
                        .sort((a, b) => b.seq - a.seq)
                        .slice(0, 100)
                    feed.cursor = result.cursor
                    if (result.captures.length < 100) break
                }
                feed.failures = 0
                feed.retryAt = 0
                feed.disabled = false
                feed.error = undefined
            } catch (error) {
                if (signal.aborted) return
                this.failed(feed, error)
            }
        }
        const recent = [...this.feeds.values()]
            .flatMap((feed) => feed.entries.map((entry) => ({ feed, entry })))
            .sort(
                (a, b) =>
                    b.entry.createdAt - a.entry.createdAt ||
                    b.entry.seq - a.entry.seq
            )
            .slice(0, 100)
        const retained = new Set(
            recent.map(
                ({ feed, entry }) => `${feed.profile.id}:${entry.captureId}`
            )
        )
        for (const key of this.payloads.keys())
            if (!retained.has(key)) this.payloads.delete(key)
        const rows: CaptureRow[] = []
        let fetched = 0
        for (const { feed, entry } of recent) {
            if (signal.aborted) return
            const id = `${feed.profile.id}:${entry.captureId}`
            let capture = this.payloads.get(id)
            let error: string | undefined
            if (
                !capture &&
                fetched < 10 &&
                !feed.disabled &&
                (force || feed.retryAt <= this.now())
            ) {
                try {
                    fetched++
                    capture = validateCapture(
                        await this.request(
                            feed.profile,
                            `/v1/captures/${entry.captureId}`,
                            signal
                        ),
                        entry.captureId
                    )
                    this.payloads.set(id, capture)
                } catch (e) {
                    if (signal.aborted) return
                    error = (e as Error).message
                    this.failed(feed, e)
                }
            }
            const base = {
                projectId: feed.profile.id,
                project: feed.name,
                captureId: entry.captureId,
                timestamp: entry.createdAt
            }
            if (!capture || !capture.evaluations.length)
                rows.push({
                    ...base,
                    id,
                    evaluationIndex: -1,
                    validator: "—",
                    error:
                        error ??
                        (capture
                            ? "No script evaluations recorded"
                            : "Capture awaiting download")
                })
            else
                capture.evaluations.forEach((evaluation, i) =>
                    rows.push({
                        ...base,
                        id: `${id}:${i}`,
                        evaluationIndex: i,
                        validator:
                            validatorName(capture!, evaluation) ??
                            "Unknown validator"
                    })
                )
        }
        this.rows = rows
        this.errors = [...this.feeds.values()].flatMap((f) =>
            f.error ? [f.error] : []
        )
    }
    private failed(feed: FeedState, error: unknown) {
        feed.disabled =
            error instanceof ServiceError && [401, 403].includes(error.status)
        feed.retryAt = this.now() + Math.min(60000, 5000 * 2 ** ++feed.failures)
        feed.error = `${feed.name}: ${(error as Error).message}`
        this.errors.push(feed.error)
    }
}
