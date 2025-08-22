import {
    decodeUplcData,
    decodeUplcProgramV2FromCbor,
    makeUplcDataValue,
    type UplcData
} from "@helios-lang/uplc"
import {
    DebugSession,
    InitializedEvent,
    TerminatedEvent,
    OutputEvent
} from "@vscode/debugadapter"
import { DebugProtocol } from "@vscode/debugprotocol"

// Very basic debug session
class HeliosDebugSession extends DebugSession {
    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {}
        this.sendResponse(response)
        this.sendEvent(new InitializedEvent())
    }

    protected launchRequest(
        response: DebugProtocol.LaunchResponse,
        argsObj: any
    ): void {
        // Just say hello
        const { uplcProgram: rawUplcProgram, args: rawArgs } = argsObj

        const uplcProgram = decodeUplcProgramV2FromCbor(rawUplcProgram)
        const args: UplcData[] | undefined = rawArgs
            ? rawArgs.map((ra: string) => decodeUplcData(ra))
            : []

        const result = uplcProgram.eval(
            args ? args.map((a) => makeUplcDataValue(a)) : undefined,
            {
                logOptions: new DebugLogger(this)
            }
        )

        if ("left" in result.result) {
            this.sendEvent(new OutputEvent(result.result.left.error))
        } else {
            this.sendEvent(new OutputEvent(result.result.right.toString()))
        }

        this.sendResponse(response)

        // End immediately
        this.sendEvent(new TerminatedEvent())
    }
}

class DebugLogger {
    adapter: HeliosDebugSession
    lastMessage_: string

    constructor(adapter: HeliosDebugSession) {
        this.adapter = adapter
        this.lastMessage_ = ""
    }

    logPrint(msg: string) {
        this.adapter.sendEvent(new OutputEvent(msg + "\n"))
    }

    get lastMessage() {
        return this.lastMessage_
    }
}

// Run the session
DebugSession.run(HeliosDebugSession)
