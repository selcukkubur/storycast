import { TextInput, View, type TextInputProps, type ViewProps } from "react-native"

export type InputProps = ViewProps & { className?: string }

export function Input({ className, ...rest }: InputProps) {
  return <View className={["rounded-xl border border-gray-200 bg-white px-3", className].filter(Boolean).join(" ")} {...rest} />
}

export type InputFieldProps = TextInputProps & { className?: string }

export function InputField({ className, ...rest }: InputFieldProps) {
  return <TextInput className={["py-3 text-base text-gray-900", className].filter(Boolean).join(" ")} placeholderTextColor="#9ca3af" {...rest} />
}
