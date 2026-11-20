import { ActivityIndicator, type ActivityIndicatorProps } from "react-native"

export type SpinnerProps = ActivityIndicatorProps & { className?: string }

export function Spinner({ className, ...rest }: SpinnerProps) {
  return <ActivityIndicator className={className} color="#f59e0b" {...rest} />
}
