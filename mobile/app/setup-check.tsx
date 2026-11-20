import { Button, ButtonText } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { Box } from "@/components/ui/box"
import { VStack } from "@/components/ui/vstack"
import { SafeAreaView } from "react-native"

export default function SetupCheck() {
  return (
    <SafeAreaView className="flex-1">
      <Box className="flex-1 items-center justify-center bg-white p-8">
        <VStack className="w-full items-center" space="md">
          <Text className="text-2xl font-bold text-gray-900">Environment check</Text>
          <Box className="w-full rounded-xl bg-blue-50 p-4">
            <Text className="text-sm text-blue-700">
              NativeWind: this box is blue when className styles are applied
            </Text>
          </Box>
          <Button className="w-full">
            <ButtonText>Gluestack-style button: shows brand color when components work</ButtonText>
          </Button>
          <Text className="text-xs text-gray-400">When both look right, send "continue" to start Flow A.</Text>
        </VStack>
      </Box>
    </SafeAreaView>
  )
}
