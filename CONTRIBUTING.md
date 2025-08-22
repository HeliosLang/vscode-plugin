# Contributing

Information for developers who want to contribute to this extension.

## Views

Each view is a separate React app, and can communicate with the ExtensionContext by posting messages, and receiving message events.
Ideally a view can do anything with the context it wants, but the messaging interface makes that difficult. Instead messaging events must be well defined for each view.

On the React side, messages can come in via a hook, and all components can react to new messages. In this case messages contain a representation of the context:

### ArgsView

```ts
type FileViewContext = {
    kind: "FileViewContext"
    filePath: string
    purpose: string
    allValidatorNames: string[]
    errorLocations: string[] // paths to helios scripts containing compilation errors
    isLoading: boolean
    entryPoints: string[]
}
```

```ts
type EntryPointViewContext = {
    kind: "EntryPointViewContext"
    filePath: string // if the filePath differs from the FileViewContext.filePath, we can hide the current args form
    entryPointName: string // string name of the entryPoint, including type prefix for methods
    argNames: string[]
    requiresScriptContext: boolean
    requiresCurrentValidator: boolean
}
```

```ts
type SelectEntryPointEvent = {
    kind: "SelectEntryPointEvent"
    entryPointName: string
}
```

```ts
type SelectCurrentValidatorEvent = {
    kind: "SelectCurrentValidatorEvent"
    currentValidator: string
}
```

The following event is sent regardless of form validation state:

```ts
type ChangeArgValueEvent = {
    kind: "ChangeArgValueEvent"
    filePath: string
    entryPointName: string
    argName: string
    argValue: string
}
```

The following event is sent regardless of form validation state:

```ts
type ChangeScriptContextValueEvent = {
    kind: "ChangeScriptContextValueEvent"
    filePath: string
    entryPointName: string
    scriptContext: string
}
```
