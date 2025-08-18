"use strict";

// src/debugAdapter.ts
var import_debugadapter = require("@vscode/debugadapter");
var HelloDebugSession = class extends import_debugadapter.DebugSession {
  initializeRequest(response, args) {
    response.body = response.body || {};
    this.sendResponse(response);
    this.sendEvent(new import_debugadapter.InitializedEvent());
  }
  launchRequest(response, args) {
    this.sendEvent(new import_debugadapter.OutputEvent(`\u{1F44B} Hello, ${args.name || "World"}!
`));
    this.sendResponse(response);
    this.sendEvent(new import_debugadapter.TerminatedEvent());
  }
};
import_debugadapter.DebugSession.run(HelloDebugSession);
