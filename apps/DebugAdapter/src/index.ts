import { DebugSession } from "@vscode/debugadapter"
import { HeliosDebugSession } from "./session"

DebugSession.run(HeliosDebugSession)
