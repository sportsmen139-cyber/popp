export type SessionAdaptationAction =
  | 'keep_as_planned'
  | 'hold_load'
  | 'reduce_accessory_volume'
  | 'increase_rest'
  | 'use_lighter_variant'
  | 'shorten_session'

export type SessionAdaptation = {
  actions: SessionAdaptationAction[]

  reason: string

  requiresConfirmation: boolean

  targetMinutes?: number
}