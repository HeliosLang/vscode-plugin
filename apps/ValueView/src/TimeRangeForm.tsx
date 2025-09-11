import { IntLikeInput, Select, useContextKey, useVsCodeApi } from "components"
import { ChangeEvent, useCallback, useMemo } from "react"
import { ChangeFieldValueEvent } from "schemas"
import {
    decodeUplcData,
    expectConstrData,
    makeConstrData
} from "@helios-lang/uplc"
import { bytesToHex } from "@helios-lang/codec-utils"

type TimeRangeFormProps = {
    fields: Record<string, string>
}

const BOUND_OPTIONS: string[] = [
    "Negative infinity",
    "Finite",
    "Positive infinity"
]

export function TimeRangeForm({ fields }: TimeRangeFormProps) {
    const vscode = useVsCodeApi()
    const contextKey = useContextKey()

    const startKind: string = useMemo(() => {
        return BOUND_OPTIONS[parseInt(fields.start_tag)]
    }, [fields])

    const endKind: string = useMemo(() => {
        return BOUND_OPTIONS[parseInt(fields.end_tag)]
    }, [fields])

    const includeStart = useMemo(() => {
        return expectConstrData(decodeUplcData(fields.include_start)).tag == 1
    }, [fields])

    const includeEnd = useMemo(() => {
        return expectConstrData(decodeUplcData(fields.include_end)).tag == 1
    }, [fields])

    const handleChangeStartTag = useCallback(
        (newStartKind: string) => {
            const startTag = BOUND_OPTIONS.indexOf(newStartKind)

            if (startTag == -1) {
                return
            }

            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                fieldName: "start_tag",
                fieldType: "",
                fieldValue: startTag.toString()
            } satisfies ChangeFieldValueEvent)
        },
        [vscode, contextKey]
    )

    const handleChangeIncludeStart = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const b = event.target.checked

            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                fieldName: "include_start",
                fieldType: "Bool",
                fieldValue: bytesToHex(makeConstrData(b ? 1 : 0, []).toCbor())
            } satisfies ChangeFieldValueEvent)
        },
        [vscode, contextKey]
    )

    const handleChangeEndTag = useCallback(
        (newEndKind: string) => {
            const endTag = BOUND_OPTIONS.indexOf(newEndKind)

            if (endTag == -1) {
                return
            }

            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                fieldName: "end_tag",
                fieldType: "",
                fieldValue: endTag.toString()
            } satisfies ChangeFieldValueEvent)
        },
        [vscode, contextKey]
    )

    const handleChangeIncludeEnd = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const b = event.target.checked

            vscode.postMessage({
                kind: "ChangeFieldValue",
                contextKey,
                fieldName: "include_end",
                fieldType: "Bool",
                fieldValue: bytesToHex(makeConstrData(b ? 1 : 0, []).toCbor())
            } satisfies ChangeFieldValueEvent)
        },
        [vscode, contextKey]
    )

    return (
        <>
            <h3>Start</h3>

            <Select
                value={startKind}
                options={BOUND_OPTIONS}
                onChange={handleChangeStartTag}
            />

            {startKind == "Finite" && (
                <IntLikeInput
                    fieldValue={fields.start_value}
                    fieldName="start_value"
                    typeName="Time"
                />
            )}

            <label>Include bound?</label>
            <input
                type="checkbox"
                checked={includeStart}
                onChange={handleChangeIncludeStart}
            />

            <h3>End</h3>

            <Select
                value={endKind}
                options={BOUND_OPTIONS}
                onChange={handleChangeEndTag}
            />

            {endKind == "Finite" && (
                <IntLikeInput
                    fieldValue={fields.end_value}
                    fieldName="end_value"
                    typeName="Time"
                />
            )}

            <label>Include bound?</label>
            <input
                type="checkbox"
                checked={includeEnd}
                onChange={handleChangeIncludeEnd}
            />
        </>
    )
}
