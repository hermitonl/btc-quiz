import {
  startServer,
  Audio,
  PlayerEntity,
  PlayerEvent,
  Vector3,
  World,
  Player,
  Entity, // Import Entity
  // Raycast is not directly imported, use world.raycast
  // Input, // Removed unused import
  RigidBodyType, // Import RigidBodyType
  ColliderShape, // Import ColliderShape
  BlockType, // Import BlockType
  ChatEvent, // Import ChatEvent
} from 'hytopia';

// Use the specified boilerplate map
import worldMap from './assets/maps/boilerplate.json';

// --- Lesson & Quiz Data ---
interface Lesson {
  id: string;
  npcName: string; // For potential future use (e.g., NPC dialogue referencing)
  text: string;
}

// Updated Quiz interface to include questions
interface QuizQuestion {
    q: string;
    a: string[]; // Array of possible answers
    correct: string; // The correct answer text
}

interface Quiz { // Renamed from QuizMeta and expanded
  id: string;
  npcName: string;
  topic: string;
  cost: number;
  questions: QuizQuestion[];
}

const lessons: Lesson[] = [
  { id: 'lesson1', npcName: 'InfoSkeleton', text: 'Bitcoin is a decentralized digital currency, meaning no single entity controls it.' },
  { id: 'lesson2', npcName: 'DataBones', text: 'Transactions are recorded on a public ledger called the blockchain.' },
  { id: 'lesson3', npcName: 'InfoSkeleton', text: 'New bitcoins are created through a process called mining.' },
];

// Updated quizzes array with questions
const quizzes: Quiz[] = [
  {
    id: 'quiz1',
    npcName: 'QuizMind',
    topic: 'Bitcoin Basics',
    cost: 1,
    questions: [
      { q: 'What is Bitcoin primarily known as?', a: ['A physical coin', 'A decentralized digital currency', 'A government-backed asset'], correct: 'A decentralized digital currency' },
      { q: 'What is the maximum supply of Bitcoin?', a: ['100 Million', 'Unlimited', '21 Million'], correct: '21 Million' },
      { q: 'What technology underlies Bitcoin transactions?', a: ['Database', 'Blockchain', 'Spreadsheet'], correct: 'Blockchain' }
    ]
  },
  {
    id: 'quiz2',
    npcName: 'QuizMind',
    topic: 'Blockchain Fundamentals',
    cost: 2,
    questions: [
        { q: 'What is a block in a blockchain?', a: ['A type of cryptocurrency', 'A collection of transactions', 'A mining computer'], correct: 'A collection of transactions' },
        { q: 'How are blocks linked together?', a: ['With physical chains', 'Through cryptographic hashes', 'By email'], correct: 'Through cryptographic hashes' },
    ]
  },
];

// --- State Management ---
// Define the structure for active quiz state
interface ActiveQuizState {
    quizId: string;
    questionIndex: number;
    timerId: NodeJS.Timeout | null; // Store the timer ID
    score: number; // Track correct answers
}

// Updated PlayerState interface
interface PlayerState {
    sats: number;
    completedLessons: Set<string>;
    activeQuiz: ActiveQuizState | null; // Track the current quiz state
    completedQuizzes: Set<string>; // Track completed quizzes
}
// Map to track player state (using player.id as the key)
const playerStates = new Map<string, PlayerState>();

// --- NPC Management ---
interface NpcInfo {
    type: 'knowledge' | 'quiz';
    dataId: string; // Corresponds to Lesson.id or Quiz.id
}
const npcs = new Map<number, NpcInfo>(); // Key: Entity ID

// --- Helper Functions ---
function updateSats(playerId: string, amount: number): boolean {
    const state = playerStates.get(playerId);
    if (!state) {
        console.warn(`Attempted to update sats for unknown player ID: ${playerId}`);
        return false;
    }
    const newSats = state.sats + amount;
    if (newSats < 0) {
        // Optional: Send message to player they don't have enough sats
        // world.chatManager.sendPlayerMessage(...)
        console.log(`Player ${playerId} attempted transaction resulting in negative sats (${newSats}). Denied.`);
        return false; // Indicate transaction failed
    }
    state.sats = newSats;
    playerStates.set(playerId, state); // Update the map
    console.log(`Updated sats for player ${playerId}. New balance: ${state.sats}`);
    // Optional: Update player UI if displaying sats
    return true; // Indicate transaction succeeded
}
// --- Quiz Logic Functions ---

// Function to ask the next question or end the quiz
function askQuestion(world: World, player: Player, quizId: string, questionIndex: number) {
    const playerId = player.id;
    if (playerId === undefined) return; // Should not happen

    const playerState = playerStates.get(playerId);
    const quiz = quizzes.find(q => q.id === quizId);

    if (!playerState || !quiz || !playerState.activeQuiz || playerState.activeQuiz.quizId !== quizId) {
        console.error(`askQuestion called with invalid state for player ${player.username} (ID: ${playerId}), quizId: ${quizId}`);
        // Attempt to clear any lingering quiz state just in case
        if (playerState && playerState.activeQuiz) {
             if (playerState.activeQuiz.timerId) clearTimeout(playerState.activeQuiz.timerId);
             playerState.activeQuiz = null;
        }
        return;
    }

    // Check if quiz is finished
    if (questionIndex >= quiz.questions.length) {
        endQuiz(world, player, quizId, true); // Player won
        return;
    }

    // Get the current question *after* the bounds check
    const question = quiz.questions[questionIndex];

    // Explicitly check if the question exists (to satisfy TS and handle potential data issues)
    if (!question) {
        console.error(`Could not find question at index ${questionIndex} for quiz ${quizId}, although index is within bounds.`);
        world.chatManager.sendPlayerMessage(player, `[System]: Error loading question ${questionIndex + 1}. Ending quiz.`, 'FF0000');
        endQuiz(world, player, quizId, false); // End quiz due to error
        return;
    }

    // Now we know 'question' is valid, update the state and send messages
    playerState.activeQuiz.questionIndex = questionIndex;

    let answerText = question.a.map((ans, index) => `${index + 1}. ${ans}`).join('\n');
    world.chatManager.sendPlayerMessage(player, `Question ${questionIndex + 1}/${quiz.questions.length}: ${question.q}`, 'FFFFFF'); // White
    world.chatManager.sendPlayerMessage(player, answerText, 'ADD8E6'); // Light Blue
    world.chatManager.sendPlayerMessage(player, `Type /a <number> within 30 seconds!`, 'FFFF00'); // Yellow

    // Clear previous timer if any (safety measure)
    if (playerState.activeQuiz.timerId) {
        clearTimeout(playerState.activeQuiz.timerId);
    }

    // Start the timer
    playerState.activeQuiz.timerId = setTimeout(() => {
        // Re-fetch state inside the timer callback to ensure it's current
        const currentState = playerStates.get(playerId);
        // Check if the player is STILL in the same quiz and on the SAME question
        if (currentState?.activeQuiz?.quizId === quizId && currentState.activeQuiz.questionIndex === questionIndex) {
            world.chatManager.sendPlayerMessage(player, "Time's up!", 'FF0000'); // Red
            endQuiz(world, player, quizId, false); // Player lost due to timeout
        }
        // If the state changed (e.g., player answered correctly/incorrectly, or started another quiz), the timer does nothing.
    }, 30 * 1000); // 30 seconds

    playerStates.set(playerId, playerState); // Ensure state map is updated with timerId and index
}

// Function to end the quiz
function endQuiz(world: World, player: Player, quizId: string, won: boolean) {
    const playerId = player.id;
    if (playerId === undefined) return;

    const playerState = playerStates.get(playerId);
    const quiz = quizzes.find(q => q.id === quizId); // Find quiz for context (e.g., topic name)

    if (!playerState || !playerState.activeQuiz || playerState.activeQuiz.quizId !== quizId) {
        // Player might not be in this quiz anymore, or state is inconsistent. Log and exit.
        console.warn(`endQuiz called for player ${player.username} (ID: ${playerId}) for quiz ${quizId}, but they are not actively in it.`);
        return;
    }

    // Clear the timer if it's still active
    if (playerState.activeQuiz.timerId) {
        clearTimeout(playerState.activeQuiz.timerId);
    }

    // Clear the active quiz state
    playerState.activeQuiz = null;

    if (won) {
        playerState.completedQuizzes.add(quizId);
        const reward = 10;
        if (updateSats(playerId, reward)) {
            world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! You earned ${reward} sats. Your balance: ${playerState.sats} sats.`, '00FF00'); // Green
        } else {
             world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! Failed to award sats.`, 'FF0000'); // Red
        }
    } else {
        // Sats were already deducted at the start
        world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Failed. You lost the entry cost.`, 'FF0000'); // Red
    }

    playerStates.set(playerId, playerState); // Update the map with cleared activeQuiz and potentially added completedQuiz
}


// Removed external spawnNpc function. Spawning logic moved inline into JOINED_WORLD event.
// Removed external spawnNpc function. Spawning logic moved inline into JOINED_WORLD event.

// --- Server Start ---
startServer(world => {
  // world.simulation.enableDebugRendering(true); // Keep commented out

  world.loadMap(worldMap);
  // TODO: Replace with actual cyberpunk plaza map later

  // --- Spawn NPCs (Minimal, in startServer scope) ---
  try {
      // --- InfoSkeleton ---
      const infoSkeleton = new Entity({
          modelUri: 'models/npcs/skeleton.gltf', // Use original skeleton model
          // position removed from constructor
          // name: 'InfoSkeleton', // Keep commented for now
          rigidBodyOptions: {
              type: RigidBodyType.FIXED, // Use FIXED instead of STATIC
              colliders: [
                  // Physical collider to prevent falling
                  { shape: ColliderShape.CYLINDER, radius: 0.5, halfHeight: 1 },
                  // Sensor collider for interaction
                  {
                      shape: ColliderShape.CYLINDER,
                      radius: 1.5, // Larger radius for interaction zone
                      halfHeight: 1.5,
                      isSensor: true,
                      tag: 'interaction-sensor',
                      onCollision: (other: Entity | BlockType, started: boolean) => { // Type should be correct now
                          // Trigger only when collision starts and the other entity is a PlayerEntity
                          if (started && other instanceof PlayerEntity && other.player) {
                              handleNpcInteraction(world, other.player, infoSkeleton.id);
                          }
                      }
                  }
              ]
          }
      });
      // Pass position as second argument to spawn
      infoSkeleton.spawn(world, { x: 5, y: 3, z: 5 }); // Lower spawn height
      if (infoSkeleton.id !== undefined) {
          npcs.set(infoSkeleton.id, { type: 'knowledge', dataId: 'lesson1' });
          console.log(`Spawned knowledge NPC: InfoSkeleton (ID: ${infoSkeleton.id})`);
      } else {
           console.error(`Failed to get ID for spawned NPC: InfoSkeleton`);
           if (infoSkeleton.world) infoSkeleton.despawn();
      }

      // --- DataBones ---
      const dataBones = new Entity({
          modelUri: 'models/npcs/skeleton.gltf',
          // position removed from constructor
          // name: 'DataBones', // Keep commented for now
          rigidBodyOptions: {
              type: RigidBodyType.FIXED, // Use FIXED instead of STATIC
              colliders: [
                  { shape: ColliderShape.CYLINDER, radius: 0.5, halfHeight: 1 },
                  {
                      shape: ColliderShape.CYLINDER,
                      radius: 1.5,
                      halfHeight: 1.5,
                      isSensor: true,
                      tag: 'interaction-sensor',
                      onCollision: (other: Entity | BlockType, started: boolean) => { // Type should be correct now
                          if (started && other instanceof PlayerEntity && other.player) {
                              handleNpcInteraction(world, other.player, dataBones.id);
                          }
                      }
                  }
              ]
          }
      });
      dataBones.spawn(world, { x: -5, y: 3, z: 5 }); // Lower spawn height
      if (dataBones.id !== undefined) {
          npcs.set(dataBones.id, { type: 'knowledge', dataId: 'lesson2' });
          console.log(`Spawned knowledge NPC: DataBones (ID: ${dataBones.id})`);
      } else {
           console.error(`Failed to get ID for spawned NPC: DataBones`);
         if (dataBones.world) dataBones.despawn();
      }

      // --- QuizMind ---
      const quizMind = new Entity({
          modelUri: 'models/npcs/mindflayer.gltf',
          // position removed from constructor
          // name: 'QuizMind', // Keep commented for now
          rigidBodyOptions: {
              type: RigidBodyType.FIXED, // Use FIXED instead of STATIC
              colliders: [
                  { shape: ColliderShape.CYLINDER, radius: 0.5, halfHeight: 1 },
                  {
                      shape: ColliderShape.CYLINDER,
                      radius: 1.5,
                      halfHeight: 1.5,
                      isSensor: true,
                      tag: 'interaction-sensor',
                      onCollision: (other: Entity | BlockType, started: boolean) => { // Type should be correct now
                          if (started && other instanceof PlayerEntity && other.player) {
                              handleNpcInteraction(world, other.player, quizMind.id);
                          }
                      }
                  }
              ]
          }
      });
      quizMind.spawn(world, { x: 0, y: 3, z: -5 }); // Lower spawn height
      if (quizMind.id !== undefined) {
          // Associate QuizMind with the first quiz by default on spawn
          npcs.set(quizMind.id, { type: 'quiz', dataId: 'quiz1' });
          console.log(`Spawned quiz NPC: QuizMind (ID: ${quizMind.id}) associated with quiz1`);
      } else {
           console.error(`Failed to get ID for spawned NPC: QuizMind`);
         if (quizMind.world) quizMind.despawn();
      }
  } catch (error) {
      console.error("Error during initial NPC spawning:", error); // Keep this for debugging
  }

  // --- Player Join Logic ---
  world.on(PlayerEvent.JOINED_WORLD, ({ player, world }) => { // Add world to destructuring
    const playerEntity = new PlayerEntity({
      player,
      name: player.username, // Use player's username for the entity name
      modelUri: 'models/players/robocop.gltf', // Use default player model
      // modelLoopedAnimations: ['idle'], // Optional: Add if model has idle animation
      // modelScale: 0.5, // Optional: Adjust scale if needed
    });

    // Spawn the player entity at the specified starting location
    // Adjust Y coordinate (5) if needed based on the boilerplate map's ground level
    playerEntity.spawn(world, new Vector3(0, 5, 0));

    // Initialize player sat balance AFTER spawning and confirming ID
    if (playerEntity.player?.id === undefined) {
        console.error(`Player entity for ${player.username} has no player ID after spawn. Cannot track state.`);
        // Attempt to despawn if possible, though spawn might have failed
        if (playerEntity.world) playerEntity.despawn();
        return; // Stop processing this player
    }

    const playerId = playerEntity.player.id;
    // Initialize player state with new fields
    playerStates.set(playerId, {
        sats: 5,
        completedLessons: new Set<string>(),
        activeQuiz: null, // Start with no active quiz
        completedQuizzes: new Set<string>() // Start with no completed quizzes
    });
    console.log(`Player ${player.username} (ID: ${playerId}) joined. Initialized state.`);

    // Send welcome messages
    world.chatManager.sendPlayerMessage(player, 'Welcome to the Bitcoin Learning Game!', '00FF00'); // Green
    world.chatManager.sendPlayerMessage(player, `You start with 5 sats. Interact with NPCs to learn and take quizzes!`, 'FFFF00'); // Yellow
    // Removed delayed NPC spawning logic

// Optional: Load UI if needed later
// player.ui.load('ui/some-ui.html');

}); // END JOINED_WORLD

  // --- Player Leave Logic ---
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    // Clear any active quiz timer if the player leaves mid-quiz
    const playerId = player.id;
    if (playerId !== undefined) {
        const playerState = playerStates.get(playerId);
        if (playerState?.activeQuiz?.timerId) {
            clearTimeout(playerState.activeQuiz.timerId);
            console.log(`Cleared active quiz timer for leaving player ${player.username}`);
        }
    }

    // Despawn all entities associated with the player
    const entitiesToDespawn = world.entityManager.getPlayerEntitiesByPlayer(player);
    console.log(`Player ${player.username} left. Despawning ${entitiesToDespawn.length} associated entities.`);
    entitiesToDespawn.forEach(entity => {
        if (entity.world) {
             console.log(`Despawning entity ${entity.id} for leaving player ${player.username}`);
             entity.despawn();
        }
    });

    // Remove player's sat state when they leave
    if (player.id !== undefined) {
        if (playerStates.delete(player.id)) {
            console.log(`Removed state for player ${player.username} (ID: ${player.id}).`);
        } else {
             console.warn(`Could not find state for leaving player ${player.username} (ID: ${player.id}).`);
        }
    } else {
        console.error(`Leaving player ${player.username} has undefined ID. Cannot remove state.`);
    }
  }); // END LEFT_WORLD

  // --- Ambient Audio (Optional) ---
  // Keep or modify as needed for the new game's atmosphere
  new Audio({
    uri: 'audio/music/hytopia-main.mp3', // Consider changing this later
    loop: true,
    volume: 0.1,
  }).play(world);

// --- NPC Interaction Logic (Called by Sensor Colliders) ---
function handleNpcInteraction(world: World, player: Player, npcEntityId: number | undefined) {
    if (npcEntityId === undefined) return;

    const npcInfo = npcs.get(npcEntityId);
    if (!npcInfo) {
        console.warn(`Collision with unknown NPC entity ID: ${npcEntityId}`);
        return;
    }

    const playerId = player.id;
    if (playerId === undefined) {
        console.error(`Player ${player.username} has undefined ID during interaction.`);
        return;
    }
    const playerState = playerStates.get(playerId);
    if (!playerState) {
        console.error(`Player state not found for player ${player.username} (ID: ${playerId}) during interaction.`);
        return; // Should not happen if JOINED_WORLD logic is correct
    }

    console.log(`Player ${player.username} collided with known NPC ID: ${npcEntityId}, type: ${npcInfo.type}`);

    if (npcInfo.type === 'knowledge') {
        const lesson = lessons.find(l => l.id === npcInfo.dataId);
        if (lesson) {
            world.chatManager.sendPlayerMessage(player, `[${lesson.npcName}]: ${lesson.text}`, 'ADD8E6'); // Light Blue

            if (!playerState.completedLessons.has(lesson.id)) {
                playerState.completedLessons.add(lesson.id);
                if (updateSats(playerId, 1)) { // Award 1 sat
                    world.chatManager.sendPlayerMessage(player, `+1 Sat! Lesson complete. Your balance: ${playerState.sats} sats.`, '00FF00'); // Green
                } else {
                    world.chatManager.sendPlayerMessage(player, `Lesson complete, but failed to update sats.`, 'FF0000'); // Red
                }
            } else {
                world.chatManager.sendPlayerMessage(player, `You have already learned this lesson.`, 'FFFF00'); // Yellow
            }
        } else {
            console.error(`Knowledge NPC (ID: ${npcEntityId}) has invalid dataId: ${npcInfo.dataId}`);
            world.chatManager.sendPlayerMessage(player, `[System]: Error retrieving lesson data.`, 'FF0000');
        }
    } else if (npcInfo.type === 'quiz') {
        const quiz = quizzes.find(q => q.id === npcInfo.dataId);
        if (quiz) {
            // Check if already completed
            if (playerState.completedQuizzes.has(quiz.id)) {
                 world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: You have already completed the ${quiz.topic} quiz!`, 'FFFF00'); // Yellow
            } else if (playerState.activeQuiz) {
                 world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: Finish your current quiz before starting another!`, 'FFA500'); // Orange
            } else {
                // Inform the player about the quiz on collision using the shortest command format
                const shortQuizId = quiz.id.replace('quiz', 'q'); // e.g., quiz1 -> q1
                world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: This is the ${quiz.topic} quiz. Type /q ${shortQuizId} to begin (Cost: ${quiz.cost} sat).`, 'FFA500'); // Orange
            }
        } else {
            console.error(`Quiz NPC (ID: ${npcEntityId}) has invalid dataId: ${npcInfo.dataId}`);
            world.chatManager.sendPlayerMessage(player, `[System]: Error retrieving quiz data.`, 'FF0000');
        }
    }
}

// --- Chat Command Handling ---
  world.chatManager.on(ChatEvent.BROADCAST_MESSAGE, ({ player, message }) => { // Revert to using 'message'
      if (!player || player.id === undefined) return; // Ignore non-player messages or players without ID
      const playerId = player.id; // Get player ID once

      // --- /q (start quiz) Command ---
      if (message.startsWith('/q ')) {
          let rawQuizArg = message.substring('/q '.length).trim();
          let quizId = rawQuizArg; // Assume full ID by default

          // Check if it matches the short format (e.g., q1, q23)
          if (/^q\d+$/.test(rawQuizArg)) {
              quizId = 'quiz' + rawQuizArg.substring(1); // Reconstruct full ID (q1 -> quiz1)
          }

          const quiz = quizzes.find(q => q.id === quizId);
          const playerState = playerStates.get(playerId);

          if (!playerState) {
              world.chatManager.sendPlayerMessage(player, `[System]: Your state could not be found. Please rejoin.`, 'FF0000');
              return;
          }

          if (!quiz) {
              world.chatManager.sendPlayerMessage(player, `Quiz with ID "${quizId}" not found.`, 'FF0000');
              return;
          }

          // Check if already in a quiz
          if (playerState.activeQuiz) {
              world.chatManager.sendPlayerMessage(player, `You are already in a quiz! Finish it first.`, 'FFA500');
              return;
          }

          // Check if already completed this quiz
          if (playerState.completedQuizzes.has(quizId)) {
              world.chatManager.sendPlayerMessage(player, `You have already completed the "${quiz.topic}" quiz.`, 'FFFF00');
              return;
          }

          // Check cost
          if (playerState.sats < quiz.cost) {
              world.chatManager.sendPlayerMessage(player, `You don't have enough sats to start the "${quiz.topic}" quiz. Cost: ${quiz.cost} sats. You have: ${playerState.sats} sats.`, 'FF0000');
              return;
          }

          // Deduct cost and start quiz
          if (updateSats(playerId, -quiz.cost)) {
              world.chatManager.sendPlayerMessage(player, `Starting quiz "${quiz.topic}"... Cost: ${quiz.cost} sats deducted. Your balance: ${playerState.sats} sats.`, '00FF00');

              // Set active quiz state
              playerState.activeQuiz = {
                  quizId: quizId,
                  questionIndex: 0, // Start at the first question
                  timerId: null,    // Timer will be set by askQuestion
                  score: 0          // Start score at 0
              };
              playerStates.set(playerId, playerState); // Update the map

              // Ask the first question
              askQuestion(world, player, quizId, 0);

          } else {
              // This case should ideally not happen if the check above passed, but good practice
              world.chatManager.sendPlayerMessage(player, `Failed to deduct sats for quiz "${quiz.topic}". Please try again.`, 'FF0000');
          }

      // --- /a (answer) Command ---
      } else if (message.startsWith('/a ')) {
          const playerState = playerStates.get(playerId);

          // Check if player is in a quiz
          if (!playerState || !playerState.activeQuiz) {
              world.chatManager.sendPlayerMessage(player, `You are not currently in a quiz.`, 'FFA500');
              return;
          }

          const activeQuiz = playerState.activeQuiz;
          const quiz = quizzes.find(q => q.id === activeQuiz.quizId);

          if (!quiz) {
              console.error(`Active quiz state points to non-existent quiz ID: ${activeQuiz.quizId}`);
              world.chatManager.sendPlayerMessage(player, `[System]: Error finding your current quiz data. Ending quiz.`, 'FF0000');
              endQuiz(world, player, activeQuiz.quizId, false); // End quiz due to error
              return;
          }

          const currentQuestion = quiz.questions[activeQuiz.questionIndex];
          if (!currentQuestion) {
               console.error(`Active quiz state points to invalid question index: ${activeQuiz.questionIndex} for quiz ${activeQuiz.quizId}`);
               world.chatManager.sendPlayerMessage(player, `[System]: Error finding your current question data. Ending quiz.`, 'FF0000');
               endQuiz(world, player, activeQuiz.quizId, false); // End quiz due to error
               return;
          }

          const choiceStr = message.substring('/a '.length).trim();
          const choiceNumber = parseInt(choiceStr, 10);

          // Validate choice number
          if (isNaN(choiceNumber) || choiceNumber < 1 || choiceNumber > currentQuestion.a.length) {
              world.chatManager.sendPlayerMessage(player, `Invalid choice "${choiceStr}". Please enter a number between 1 and ${currentQuestion.a.length}.`, 'FF0000');
              return; // Let the player try again within the time limit
          }

          // Clear the timer since an answer was submitted
          if (activeQuiz.timerId) {
              clearTimeout(activeQuiz.timerId);
              activeQuiz.timerId = null; // Important: clear the stored ID
          }

          const chosenAnswer = currentQuestion.a[choiceNumber - 1];

          // Check if correct
          if (chosenAnswer === currentQuestion.correct) {
              world.chatManager.sendPlayerMessage(player, `Correct!`, '00FF00');
              activeQuiz.score++; // Increment score
              // Ask next question (or end if it was the last one)
              askQuestion(world, player, activeQuiz.quizId, activeQuiz.questionIndex + 1);
          } else {
              world.chatManager.sendPlayerMessage(player, `Incorrect! The correct answer was: ${currentQuestion.correct}`, 'FF0000');
              endQuiz(world, player, activeQuiz.quizId, false); // End quiz due to incorrect answer
          }
          // No need to playerStates.set here, askQuestion/endQuiz handles state updates
      }
      // Add other command handlers here if needed
  });


  // --- Ambient Audio (Optional) --- - REMOVED DUPLICATE
  // Keep or modify as needed for the new game's atmosphere
  // new Audio({
  //   uri: 'audio/music/hytopia-main.mp3', // Consider changing this later
  //   loop: true,
  //   volume: 0.1,
  // }).play(world);

  console.log("Bitcoin Learning Game server initialized with NPCs, quiz logic, and chat commands.");
}); // END startServer
