import { ReactNode } from "react"
import styles from "./styles.module.css"

type IconButtonProps = {
    children: ReactNode
    disabled?: boolean
    tooltip?: string
    onClick: () => void
}

export function IconButton({
    children,
    disabled,
    tooltip,
    onClick
}: IconButtonProps) {
    return (
        <button
            className={styles.genericInputAction}
            onClick={onClick}
            title={tooltip}
            disabled={disabled}
        >
            {children}
        </button>
    )
}
