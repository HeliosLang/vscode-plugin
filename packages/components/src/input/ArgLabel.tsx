import styles from "./styles.module.css"

type ArgLabelProps = {
    name: string
    type: string
}

export function ArgLabel({ name, type }: ArgLabelProps) {
    return (
        <label className={styles.argLabel}>
            <span>{name}</span>: <span>{type}</span>
        </label>
    )
}
