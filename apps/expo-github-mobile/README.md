# GitHub Mobile App - Expo

A React Native mobile app inspired by Claude Code, built with Expo. This is a port of the SwiftUI iOS app to React Native/Expo for cross-platform support.

## Features

- Session list view with repository info and status
- Chat view with collapsible tool executions (Write, Bash, Read, Edit, Glob, Grep)
- Message input with model/repo/branch selection chips
- PR creation flow simulation
- Dark theme matching Claude Code aesthetic
- Mock data for repos, sessions, and tool calls

## Tech Stack

- React Native with Expo SDK 54
- TypeScript
- React Context for state management
- Expo Vector Icons (Ionicons)

## Project Structure

```
src/
├── components/       # Reusable components
│   ├── MessageInputView.tsx
│   ├── SessionRow.tsx
│   ├── MessageView.tsx
│   ├── ToolCallView.tsx
│   ├── Chip.tsx
│   └── NewSessionSheet.tsx
├── contexts/         # React Context providers
│   └── AppContext.tsx
├── models/           # TypeScript types and data
│   └── types.ts
├── theme/            # Colors, spacing, styling
│   ├── colors.ts
│   └── types.ts
└── views/            # Screen components
    ├── SessionListView.tsx
    └── ChatView.tsx
```

## Running the App

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

## Colors & Theme

The app uses a dark theme matching Claude Code's aesthetic:
- Background: `#141414`
- Card: `#292929`
- Accent (warm orange): `#D98C33`
- Tool colors: Write (green), Bash (blue), Read (purple)

## Models & Data

Mock data includes:
- 6 repositories (clawdbot, systemss, Awesome-Prompts, etc.)
- 7 sessions with various titles
- Active session with tool call examples (Write, Bash commands)

## Port Notes

This is a direct port of the SwiftUI app at `../ios-github-mobile/`. Key differences:
- Uses React Native components instead of SwiftUI
- Ionicons instead of SF Symbols
- React Context instead of `@Observable`
- Modal-based sheets instead of SwiftUI sheets
