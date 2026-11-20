import { Pressable, Text as RNText, type PressableProps, type TextProps } from "react-native"

type Variant = "solid" | "outline" | "link"
type Size = "sm" | "md" | "lg"

const VARIANTS: Record<Variant, string> = {
  solid: "bg-amber-500 active:bg-amber-600",
  outline: "border border-amber-500 bg-transparent active:bg-amber-50",
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
      className={["items-center justify-center rounded-xl", SIZE[size], VARIANTS[variant], (isDisabled ?? disabled) && "opacity-40", className].filter(Boolean).join(" ")}
      {...rest}
    />
  )
}

export type ButtonTextProps = TextProps & { className?: string }

export function ButtonText({ className, ...rest }: ButtonTextProps) {
  return <RNText className={["text-base font-semibold text-white", className].filter(Boolean).join(" ")} {...rest} />
}
