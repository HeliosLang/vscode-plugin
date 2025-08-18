import {
    DebugSession,
    InitializedEvent,
    TerminatedEvent,
    OutputEvent
} from "@vscode/debugadapter"
import { DebugProtocol } from "@vscode/debugprotocol"

// Very basic debug session
class HelloDebugSession extends DebugSession {
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
        args: any
    ): void {
        // Just say hello
        this.sendEvent(new OutputEvent(`hello from debug adapter!\n${JSON.stringify(args)}\n`))

        this.sendResponse(response)

        // End immediately
        this.sendEvent(new TerminatedEvent())
    }
}

// Run the session
DebugSession.run(HelloDebugSession)
