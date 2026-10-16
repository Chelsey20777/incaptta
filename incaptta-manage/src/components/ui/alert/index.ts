import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Alert } from "./Alert.vue"
export { default as AlertDescription } from "./AlertDescription.vue"
export { default as AlertTitle } from "./AlertTitle.vue"

export const alertVariants = cva(
    "relative w-full rounded-lg border px-4 py-3 text-sm flex gap-3 [&>svg]:size-4 [&>svg]:shrink-0",
    {
        variants: {
            variant: {
                default: "bg-background text-foreground",
                destructive:
                    "bg-destructive/10 border-destructive/20 text-destructive dark:border-destructive/40 [&>svg]:text-destructive",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
)

export type AlertVariants = VariantProps<typeof alertVariants>
