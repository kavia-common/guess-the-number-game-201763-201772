import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type DifficultyKey = 'easy' | 'medium' | 'hard';

type DifficultyConfig = {
  key: DifficultyKey;
  label: string;
  min: number;
  max: number;
  maxAttempts: number;
};

type LeaderboardEntry = {
  id: string;
  playerName: string;
  difficulty: DifficultyKey;
  attempts: number;
  rangeMax: number;
  dateISO: string;
};

const THEME = {
  background: '#f9fafb',
  surface: '#ffffff',
  text: '#111827',
  mutedText: '#64748b',
  primary: '#3b82f6',
  success: '#06b6d4',
  error: '#EF4444',
  border: '#e5e7eb',
};

const LEADERBOARD_STORAGE_KEY = 'guess_the_number__leaderboard_v1';

const DIFFICULTIES: DifficultyConfig[] = [
  { key: 'easy', label: 'Easy', min: 1, max: 20, maxAttempts: 6 },
  { key: 'medium', label: 'Medium', min: 1, max: 50, maxAttempts: 8 },
  { key: 'hard', label: 'Hard', min: 1, max: 100, maxAttempts: 10 },
];

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// PUBLIC_INTERFACE
export default function App() {
  /** Root component for the Guess the Number game, including gameplay and local leaderboard. */
  const [difficultyKey, setDifficultyKey] = useState<DifficultyKey>('easy');
  const difficulty = useMemo(
    () => DIFFICULTIES.find((d) => d.key === difficultyKey) ?? DIFFICULTIES[0],
    [difficultyKey],
  );

  const [target, setTarget] = useState<number>(() => randomIntInclusive(difficulty.min, difficulty.max));
  const [attempts, setAttempts] = useState<number>(0);
  const [hint, setHint] = useState<string>('Pick a difficulty, then guess the number.');
  const [guessText, setGuessText] = useState<string>('');
  const [gameOver, setGameOver] = useState<boolean>(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState<boolean>(false);

  const [nameModalOpen, setNameModalOpen] = useState<boolean>(false);
  const [playerName, setPlayerName] = useState<string>('');
  const [pendingWinAttempts, setPendingWinAttempts] = useState<number | null>(null);

  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    // Load leaderboard once at startup.
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LEADERBOARD_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as LeaderboardEntry[];
        if (Array.isArray(parsed)) setLeaderboard(parsed);
      } catch {
        // Ignore corrupt storage; app should remain usable.
      }
    })();
  }, []);

  useEffect(() => {
    // Start a fresh game when difficulty changes.
    startNewGame(difficulty.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficultyKey]);

  async function persistLeaderboard(next: LeaderboardEntry[]) {
    try {
      await AsyncStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort persistence; do not block gameplay on storage failures.
    }
  }

  function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    return [...entries].sort((a, b) => {
      if (a.difficulty !== b.difficulty) {
        const order: Record<DifficultyKey, number> = { easy: 0, medium: 1, hard: 2 };
        return order[a.difficulty] - order[b.difficulty];
      }
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      return b.dateISO.localeCompare(a.dateISO);
    });
  }

  function startNewGame(nextDifficultyKey: DifficultyKey) {
    const config = DIFFICULTIES.find((d) => d.key === nextDifficultyKey) ?? DIFFICULTIES[0];
    setTarget(randomIntInclusive(config.min, config.max));
    setAttempts(0);
    setGuessText('');
    setGameOver(false);
    setHint(`Guess a number between ${config.min} and ${config.max}.`);
    setPendingWinAttempts(null);
    setNameModalOpen(false);

    // Focus the input after layout settles.
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function parseGuess(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  }

  function attemptLimitReached(nextAttempts: number): boolean {
    return nextAttempts >= difficulty.maxAttempts;
  }

  function handleSubmitGuess() {
    if (gameOver) return;

    const guess = parseGuess(guessText);
    if (guess === null) {
      setHint('Please enter a whole number.');
      return;
    }
    if (guess < difficulty.min || guess > difficulty.max) {
      setHint(`Your guess must be between ${difficulty.min} and ${difficulty.max}.`);
      return;
    }

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (guess === target) {
      setGameOver(true);
      setHint(`Correct! You guessed it in ${nextAttempts} attempt${nextAttempts === 1 ? '' : 's'}.`);
      setPendingWinAttempts(nextAttempts);
      setNameModalOpen(true);
      Keyboard.dismiss();
      return;
    }

    // Not correct: provide higher/lower hint.
    if (guess < target) {
      setHint('Higher.');
    } else {
      setHint('Lower.');
    }

    if (attemptLimitReached(nextAttempts)) {
      setGameOver(true);
      setHint(`Game over. The number was ${target}.`);
      Keyboard.dismiss();
    }
  }

  async function handleSaveWin() {
    const winAttempts = pendingWinAttempts;
    const name = playerName.trim();
    if (winAttempts == null) {
      setNameModalOpen(false);
      return;
    }
    if (!name) {
      Alert.alert('Name required', 'Please enter your name to save your score.');
      return;
    }

    const entry: LeaderboardEntry = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      playerName: name,
      difficulty: difficulty.key,
      attempts: winAttempts,
      rangeMax: difficulty.max,
      dateISO: new Date().toISOString(),
    };

    const next = sortLeaderboard([entry, ...leaderboard]).slice(0, 50); // keep top 50
    setLeaderboard(next);
    await persistLeaderboard(next);

    setNameModalOpen(false);
    setPlayerName('');
    setPendingWinAttempts(null);
    setLeaderboardOpen(true);
  }

  async function handleClearLeaderboard() {
    Alert.alert('Clear leaderboard?', 'This will remove all saved scores on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setLeaderboard([]);
          try {
            await AsyncStorage.removeItem(LEADERBOARD_STORAGE_KEY);
          } catch {
            // ignore
          }
        },
      },
    ]);
  }

  const attemptsLeft = Math.max(0, difficulty.maxAttempts - attempts);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={Platform.select({ ios: 8, android: 0 })}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Guess the Number</Text>
            <Text style={styles.subtitle}>Hints, attempts, and a local leaderboard.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Difficulty</Text>
            <View style={styles.difficultyRow}>
              {DIFFICULTIES.map((d) => {
                const active = d.key === difficultyKey;
                return (
                  <Pressable
                    key={d.key}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                    onPress={() => setDifficultyKey(d.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${d.label} difficulty`}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                      {d.label}
                    </Text>
                    <Text style={[styles.chipMeta, active ? styles.chipTextActive : styles.chipTextInactive]}>
                      {d.min}-{d.max} • {d.maxAttempts} tries
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Attempts</Text>
                <Text style={styles.statValue}>{attempts}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Left</Text>
                <Text style={styles.statValue}>{attemptsLeft}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Range</Text>
                <Text style={styles.statValue}>
                  {difficulty.min}-{difficulty.max}
                </Text>
              </View>
            </View>

            <View style={styles.hintBox}>
              <Text style={styles.hintText}>{hint}</Text>
            </View>

            <View style={styles.inputRow}>
              <TextInput
                ref={(r) => {
                  inputRef.current = r;
                }}
                style={[styles.input, gameOver ? styles.inputDisabled : undefined]}
                value={guessText}
                onChangeText={(t) => setGuessText(t.replace(/[^\d]/g, ''))}
                placeholder={`Enter ${difficulty.min}-${difficulty.max}`}
                placeholderTextColor={THEME.mutedText}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleSubmitGuess}
                editable={!gameOver}
                accessibilityLabel="Your guess input"
              />
              <Pressable
                style={[styles.primaryButton, gameOver ? styles.buttonDisabled : undefined]}
                onPress={handleSubmitGuess}
                disabled={gameOver}
                accessibilityRole="button"
                accessibilityLabel="Submit guess"
              >
                <Text style={styles.primaryButtonText}>Guess</Text>
              </Pressable>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => startNewGame(difficulty.key)}
                accessibilityRole="button"
                accessibilityLabel="Start new game"
              >
                <Text style={styles.secondaryButtonText}>New Game</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={() => setLeaderboardOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open leaderboard"
              >
                <Text style={styles.secondaryButtonText}>Leaderboard</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.footerNote}>
            Tip: change difficulty anytime to start a fresh round. Scores save only on this device.
          </Text>
        </View>

        {/* Win name prompt */}
        <Modal visible={nameModalOpen} transparent animationType="fade" onRequestClose={() => setNameModalOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setNameModalOpen(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>You won!</Text>
              <Text style={styles.modalSubtitle}>Save your score to the leaderboard.</Text>

              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Name</Text>
                <TextInput
                  style={styles.modalInput}
                  value={playerName}
                  onChangeText={setPlayerName}
                  placeholder="Your name"
                  placeholderTextColor={THEME.mutedText}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveWin}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.secondaryButton} onPress={() => setNameModalOpen(false)}>
                  <Text style={styles.secondaryButtonText}>Skip</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={handleSaveWin}>
                  <Text style={styles.primaryButtonText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Leaderboard */}
        <Modal
          visible={leaderboardOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setLeaderboardOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setLeaderboardOpen(false)}>
            <Pressable style={styles.leaderboardSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.leaderboardHeader}>
                <Text style={styles.modalTitle}>Leaderboard</Text>
                <Pressable onPress={() => setLeaderboardOpen(false)} accessibilityRole="button">
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <View style={styles.leaderboardActions}>
                <Pressable style={styles.secondaryButtonSmall} onPress={handleClearLeaderboard}>
                  <Text style={styles.secondaryButtonText}>Clear</Text>
                </Pressable>
              </View>

              {leaderboard.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No scores yet</Text>
                  <Text style={styles.emptySubtitle}>Win a round to add your first entry.</Text>
                </View>
              ) : (
                <FlatList
                  data={leaderboard}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item, index }) => (
                    <View style={styles.row}>
                      <Text style={styles.rank}>#{index + 1}</Text>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {item.playerName}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {item.difficulty.toUpperCase()} • {item.attempts} tries • 1-{item.rangeMax}
                        </Text>
                      </View>
                      <Text style={styles.rowDate}>{new Date(item.dateISO).toLocaleDateString()}</Text>
                    </View>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: THEME.background },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: THEME.background,
  },
  header: { marginBottom: 14 },
  title: { fontSize: 28, fontWeight: '800', color: THEME.text, letterSpacing: -0.3 },
  subtitle: { marginTop: 6, color: THEME.mutedText, fontSize: 14 },

  card: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },

  sectionTitle: { color: THEME.text, fontSize: 14, fontWeight: '700' },
  difficultyRow: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },

  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 105,
  },
  chipActive: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' },
  chipInactive: { backgroundColor: '#fff', borderColor: THEME.border },
  chipText: { fontSize: 13, fontWeight: '800' },
  chipTextActive: { color: THEME.primary },
  chipTextInactive: { color: THEME.text },
  chipMeta: { marginTop: 4, fontSize: 11, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  statLabel: { color: THEME.mutedText, fontSize: 12, fontWeight: '700' },
  statValue: { color: THEME.text, fontSize: 18, fontWeight: '900', marginTop: 4 },

  hintBox: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.25)',
    backgroundColor: 'rgba(6,182,212,0.10)',
    padding: 12,
  },
  hintText: { color: THEME.text, fontSize: 14, fontWeight: '700' },

  inputRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' },
  input: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
    color: THEME.text,
    fontWeight: '700',
  },
  inputDisabled: { opacity: 0.6 },

  primaryButton: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  buttonDisabled: { opacity: 0.55 },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonSmall: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  secondaryButtonText: { color: THEME.text, fontWeight: '800' },

  footerNote: { marginTop: 14, color: THEME.mutedText, fontSize: 12, lineHeight: 18 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: THEME.text },
  modalSubtitle: { marginTop: 6, color: THEME.mutedText, fontSize: 13 },
  modalRow: { marginTop: 12 },
  modalLabel: { color: THEME.text, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  modalInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },

  leaderboardSheet: {
    marginTop: 'auto',
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
    maxHeight: '80%',
  },
  leaderboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeText: { color: THEME.primary, fontWeight: '900' },
  leaderboardActions: { marginTop: 10, marginBottom: 8 },

  emptyState: { paddingVertical: 26 },
  emptyTitle: { color: THEME.text, fontSize: 16, fontWeight: '900' },
  emptySubtitle: { marginTop: 6, color: THEME.mutedText, fontSize: 13 },

  listContent: { paddingBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rank: { width: 48, color: THEME.mutedText, fontWeight: '900' },
  rowMain: { flex: 1, paddingRight: 10 },
  rowName: { color: THEME.text, fontSize: 14, fontWeight: '900' },
  rowMeta: { marginTop: 2, color: THEME.mutedText, fontSize: 12, fontWeight: '700' },
  rowDate: { color: THEME.mutedText, fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: THEME.border },
});
