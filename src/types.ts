// src/types.ts

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
    timerId: NodeJS.Timeout | null; // Store the timer ID
    score: number; // Track correct answers
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