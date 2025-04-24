// src/types.ts
import type { Player } from 'hytopia'; // Import Player type from 'hytopia'

// Structure for data stored in/retrieved from the database
export interface DbPlayerState {
    sats: number;
    completedLessons: string[]; // Stored as array in DB
    completedQuizzes: string[]; // Stored as array in DB
}

// Structure for tracking active quiz details in memory
export interface ActiveQuizState {
    quizId: string;
    questionIndex: number;
    // timerId: NodeJS.Timeout | null; // Removed timerId
    questionStartTime: number; // Timestamp when the current question was asked
    answeredCurrentQuestion: boolean; // Flag to prevent re-answering (now used to gate timeout processing)
    score: number; // Track correct answers
    lastPlatformIndex: number | null; // Index of platform player was last on during the question time
    lastTimerMessageSent: number; // Timestamp when the last timer chat message was sent
}

// Structure for the player state held in memory during runtime
export interface InMemoryPlayerState {
    sats: number;
    completedLessons: Set<string>; // Use Set for efficient lookups
    completedQuizzes: Set<string>; // Use Set for efficient lookups
    activeQuiz: ActiveQuizState | null; // Track the current quiz state
    isGuest: boolean; // Flag to indicate if player data was loaded from DB
    isAuthenticated: boolean; // Flag to indicate if the player has successfully logged in
    loggedInUsername: string | null; // Stores the username the player is authenticated as, null if guest/not logged in
    pendingQuizId: string | null; // ID of the quiz the player intends to start via /confirmquiz
    playerObject?: Player; // Reference to the player object (transient, only valid while connected)
    lastProximityPlatformIndex?: number | null; // Track last platform proximity message sent
    showingKnowledgeNpcId?: number | null; // Track which knowledge NPC's UI is currently shown
}

// --- Shared Definitions ---

export interface QuizQuestion {
    q: string;
    a: string[]; // Array of possible answers
    correct: string; // The correct answer text
}

export interface Quiz {
    id: string;
    npcName: string; // Keep for display purposes
    topic: string;
    cost: number;
    questions: QuizQuestion[];
    // timeLimit per question is handled in askQuestion timer (30s)
    reward: number; // Reward for completing the whole quiz
}

export interface Lesson {
    id: string;
    npcName: string; // Keep for display purposes
    text: string; // Renamed from 'content' for consistency with index.ts usage
    reward: number; // Reward for completing the lesson once
}