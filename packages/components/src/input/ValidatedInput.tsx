import { ChangeEvent } from "react"
import styles from "./styles.module.css"

type ValidatedInputProps = {
    value: string
    onChange: (evt: ChangeEvent<HTMLInputElement>) => void
    error: string
    placeholder?: string
}

export function ValidatedInput({
    value,
    onChange,
    error,
    placeholder
}: ValidatedInputProps) {
    const isValid = error == ""

    return (
        <div className={styles.validatedInputWrapper}>
            <input
                className={[
                    isValid ? "" : styles.invalidInput,
                    styles.customInput
                ].join(" ")}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
            />
            <p
                className={
                    isValid
                        ? styles.invisibleInputError
                        : styles.visibleInputError
                }
            >
                {error}
            </p>
        </div>
    )
}
