import { router } from "expo-router"
import PaywallFlow from "@/src/flows/flow2-paywall"

export default function PaywallScreen() {
  return <PaywallFlow onClose={() => router.back()} />
}
