import { useCallback, useEffect, useState } from "react"
import { useFocusEffect } from "expo-router"
import type { Plan } from "@/src/flows/shared/types"
import { ensureDevice, ensureDeviceId, initBilling, wallet } from "./billing"

export type WalletState = { plan: Plan; credits: number; maxMinutes: number }

/** The signed-out / offline face of the wallet: trial terms, never invented tickets. */
const FALLBACK: WalletState = { plan: "trial", credits: 0, maxMinutes: 1 }

/**
 * The one wallet the UI renders. The billing worker is authoritative, so every screen that
 * shows tickets or plan caps reads this hook instead of the design mock, and re-reads it on
 * focus (returning from the paywall or a finished film must not show stale numbers).
 */
export function useWallet(): WalletState & { refresh: () => Promise<WalletState> } {
  const [state, setState] = useState<WalletState>(FALLBACK)

  const refresh = useCallback(async (): Promise<WalletState> => {
    try {
      await initBilling()
      const { device, idfv } = await ensureDeviceId()
      await ensureDevice(device, idfv)
      const w = await wallet()
      const next: WalletState = {
        plan: (w.plan as Plan) ?? FALLBACK.plan,
        credits: w.credits ?? FALLBACK.credits,
        maxMinutes: w.maxMinutes ?? FALLBACK.maxMinutes,
      }
      setState(next)
      return next
    } catch {
      // A device that cannot reach billing keeps trial terms rather than a fabricated balance.
      return FALLBACK
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  return { ...state, refresh }
}
