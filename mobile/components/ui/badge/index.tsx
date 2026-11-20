import { Text as RNText, View, type TextProps, type ViewProps } from "react-native"

type Action = "info" | "success" | "warning" | "error" | "muted"

const ACTIONS: Record<Action, string> = {
  info: "bg-blue-50",
  success: "bg-emerald-50",
  warning: "bg-amber-50",
  error: "bg-red-50",
  muted: "bg-gray-100",
}

const TEXT: Record<Action, string> = {
  info: "text-blue-700",
  success: "text-emerald-700",
  warning: "text-amber-700",
  error: "text-red-700",
  muted: "text-gray-600",
}

export type BadgeProps = ViewProps & { className?: string; action?: Action }

export function Badge({ className, action = "muted", ...rest }: BadgeProps) {
  return <View className={["self-start rounded-full px-2.5 py-1", ACTIONS[action], className].filter(Boolean).join(" ")} {...rest} />
}

export type BadgeTextProps = TextProps & { className?: string; action?: Action }

export function BadgeText({ className, action = "muted", ...rest }: BadgeTextProps) {
  return <RNText className={["text-xs font-medium", TEXT[action], className].filter(Boolean).join(" ")} {...rest} />
}
