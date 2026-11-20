import { Pressable, Text as RNText, type PressableProps, type TextProps } from "react-native"

type Variant = "solid" | "outline" | "link" | "dark"
type Size = "sm" | "md" | "lg"

const VARIANTS: Record<Variant, string> = {
  solid: "bg-brass active:opacity-80",
  dark: "bg-curtain active:opacity-90",
  outline: "border border-ink/15 bg-ticket active:bg-paper",
  link: "bg-transparent",
}

const SIZE: Record<Size, string> = {
  sm: "px-3 py-2",
  md: "px-4 py-3",
  lg: "px-6 py-4",
}

export type ButtonProps = PressableProps & {
  className?: string
  variant?: Variant
  size?: Size
  isDisabled?: boolean
}

export function Button({ className, variant = "solid", size = "md", isDisabled, disabled, ...rest }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled ?? disabled}
      className={["items-center justify-center rounded-xl", SIZE[size], VARIANTS[variant], (isDisabled ?? disabled) && "opacity-40", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  )
}

export type ButtonTextProps = TextProps & { className?: string }

export function ButtonText({ className, ...rest }: ButtonTextProps) {
  return <RNText className={["font-body-bold text-base text-ink", className].filter(Boolean).join(" ")} {...rest} />
}
