export type LogoLoadState = { loaded: boolean; failed: boolean }

export const initialLogoLoadState: LogoLoadState = { loaded: false, failed: false }

export function logoLoadedState(): LogoLoadState {
  return { loaded: true, failed: false }
}

export function logoFailedState(): LogoLoadState {
  return { loaded: false, failed: true }
}

export function showLogoInitials(state: LogoLoadState) {
  return !state.loaded || state.failed
}
