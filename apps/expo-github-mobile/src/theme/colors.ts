// Theme colors matching SwiftUI AppTheme
export const Colors = {
  // Background colors
  background: '#141414', // rgb(0.08, 0.08, 0.08)
  surfaceBackground: '#1E1E1E', // rgb(0.12, 0.12, 0.12)
  cardBackground: '#292929', // rgb(0.16, 0.16, 0.16)
  inputBackground: '#242424', // rgb(0.14, 0.14, 0.14)

  // Text colors
  primaryText: '#FFFFFF',
  secondaryText: '#999999', // rgb(0.6, 0.6, 0.6)
  tertiaryText: '#737373', // rgb(0.45, 0.45, 0.45)

  // Accent colors
  accent: '#D98C33', // rgb(0.85, 0.55, 0.35) - Warm orange like Claude
  accentLight: '#F3C08D', // rgb(0.95, 0.75, 0.55)

  // Status colors
  success: '#4DB366', // rgb(0.3, 0.7, 0.4)
  warning: '#E6B34D', // rgb(0.9, 0.7, 0.3)
  error: '#E66666', // rgb(0.9, 0.4, 0.4)

  // Tool colors
  toolWrite: '#66B266', // rgb(0.4, 0.7, 0.4)
  toolBash: '#8099CC', // rgb(0.5, 0.6, 0.8)
  toolRead: '#B299B2', // rgb(0.7, 0.6, 0.8)

  // Chip/Tag colors
  chipBackground: '#333333', // rgb(0.2, 0.2, 0.2)
  chipBorder: '#4D4D4D', // rgb(0.3, 0.3, 0.3)

  // Button colors
  buttonPrimary: '#F2F2F2', // rgb(0.95, 0.95, 0.95)
  buttonPrimaryText: '#000000',
} as const

// Spacing
export const Spacing = {
  XS: 4,
  SM: 8,
  MD: 12,
  LG: 16,
  XL: 24,
} as const

// Corner radius
export const Radius = {
  SM: 6,
  MD: 10,
  LG: 16,
  XL: 24,
  Full: 100,
} as const
