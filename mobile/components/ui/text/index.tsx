import { Text as RNText, type TextProps } from "react-native"

export type TextPropsUi = TextProps & { className?: string; size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" }

const SIZES: Record<NonNullable<TextPropsUi["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
}

export function Text({ className, size = "md", ...rest }: TextPropsUi) {
  return <RNText className={[SIZES[size], "text-gray-900", className].filter(Boolean).join(" ")} {...rest} />
}
