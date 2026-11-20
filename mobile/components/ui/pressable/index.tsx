import { Pressable, type PressableProps } from "react-native"

export type PressableUiProps = PressableProps & { className?: string }

export function PressableUi({ className, ...rest }: PressableUiProps) {
  return <Pressable className={className} {...rest} />
}
