import { useCallback, useEffect, useState } from "react"
import { useFocusEffect } from "expo-router"
import type { Plan } from "@/src/flows/shared/types"
import { ensureDevice, ensureDeviceId, initBilling, wallet } from "./billing"

export type WalletState = { plan: Plan; credits: number; maxMinutes: number }
/** `loading` covers the first fetch only; `error` tracks the last one. */
export type WalletStatus = { loading: boolean; error: boolean }

/** The signed-out / offline face of the wallet: trial terms, never invented tickets. */
const FALLBACK: WalletState = { plan: "trial", credits: 0, maxMinutes: 1 }

/**
 * The one wallet the UI renders. The billing worker is authoritative, so every screen that
 * shows tickets or plan caps reads this hook instead of the design mock, and re-reads it on
 * focus (returning from the paywall or a finished film must not show stale numbers).
 *
 * The fallback terms are a placeholder, not a balance: until the first `/wallet` answer lands
 * `loading` is true, and screens must render a "checking" state rather than "0 tickets". If the
 * last fetch failed `error` is true and the balance is *unknown*, not zero, so Make a film must
 * stay disabled with the billing-unreachable copy instead of claiming the book is short.
 */
export function useWallet(): WalletState & WalletStatus & { refresh: () => Promise<WalletState> } {
  const [state, setState] = useState<WalletState>(FALLBACK)
  const [status, setStatus] = useState<WalletStatus>({ loading: true, error: false })

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
      setStatus({ loading: false, error: false })
      return next
    } catch {
      // A device that cannot reach billing keeps the last known numbers but marks the book
      // unavailable, so no screen presents the fallback as a real (zero) balance.
      setStatus({ loading: false, error: true })
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

  return { ...state, ...status, refresh }
}
