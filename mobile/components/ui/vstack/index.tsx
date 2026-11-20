import { View, type ViewProps } from "react-native"

export type StackProps = ViewProps & { className?: string; space?: "xs" | "sm" | "md" | "lg" | "xl"; reversed?: boolean }

const GAP: Record<NonNullable<StackProps["space"]>, string> = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
}

export function VStack({ className, space = "md", ...rest }: StackProps) {
  return <View className={["flex-col", GAP[space], className].filter(Boolean).join(" ")} {...rest} />
}
