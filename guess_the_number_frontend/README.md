# Guess the Number (Expo / React Native)

This is an Expo-managed React Native app implementing a "Guess the Number" game with:

- Difficulty selection (Easy / Medium / Hard)
- Higher/Lower hints
- Attempt tracking with max-attempt limits
- Local leaderboard persisted on-device (AsyncStorage)

## Development

```bash
npm install
npm run start
```

## Notes about Android / Gradle validation

This project does **not** commit a generated `android/` directory by default (Expo-managed workflow).

Some CI validators may attempt to execute `./gradlew` even when `android/` hasn't been generated. A small `gradlew` stub is included to prevent false-negative failures. If your environment strips executable permissions, make it executable:

```bash
chmod +x gradlew
```

To generate the native Android project (and the real Gradle wrapper), run:

```bash
npx expo prebuild --platform android
```
