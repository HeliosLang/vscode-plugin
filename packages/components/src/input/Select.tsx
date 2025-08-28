import { ChangeEvent, useCallback, useState } from "react"
import styles from "./styles.module.css"

type SelectProps = {
    id?: string
    className?: string
    value?: string
    disabled?: boolean
    options: readonly string[] // has at least one entry
    onChange: (value: string) => void
}

export function Select({
    id,
    className,
    disabled,
    value,
    options,
    onChange
}: SelectProps) {
    const firstOption = options[0]
    const [selected, setSelected] = useState(firstOption) // prefer external value

    const handleChange = useCallback(
        (e: ChangeEvent<HTMLSelectElement>) => {
            const v = e.target.value
            if (!value) {
                setSelected(v)
            }
            onChange(v)
        },
        [onChange, setSelected, value]
    )

    return (
        <select
            id={id}
            value={value || selected}
            onChange={handleChange}
            disabled={disabled}
            className={[styles.customSelect, className ?? ""].join(" ")}
        >
            {options.map((opt) => (
                <option key={opt} value={opt}>
                    {opt}
                </option>
            ))}
        </select>
    )
}
