import {
  startServer,
  Audio,
  PlayerEntity,
  PlayerEvent,
  Vector3,
  World,
  Player,
  Entity,
  RigidBodyType,
  ColliderShape,
  BlockType,
  ChatEvent,
  // ChatEventArgs, // Removed - Not an exported type
} from 'hytopia';

import worldMap from './assets/maps/boilerplate.json';
import { initializeDatabase, loadPlayerData, savePlayerData, registerPlayer } from './src/database'; // Added registerPlayer
import type { InMemoryPlayerState, Lesson, Quiz, QuizQuestion, ActiveQuizState, DbPlayerState } from './src/types'; // Added DbPlayerState
import bcrypt from 'bcrypt'; // Added bcrypt

// --- Lesson & Quiz Data ---
const lessons: Lesson[] = [
  { id: 'lesson1', npcName: 'InfoSkeleton', text: 'Bitcoin is a decentralized digital currency, meaning no single entity controls it.', reward: 1 },
  { id: 'lesson2', npcName: 'DataBones', text: 'Transactions are recorded on a public ledger called the blockchain.', reward: 1 },
  { id: 'lesson3', npcName: 'InfoSkeleton', text: 'New bitcoins are created through a process called mining.', reward: 1 },
];

const quizzes: Quiz[] = [
  {
    id: 'quiz1',
    npcName: 'QuizMind',
    topic: 'Bitcoin Basics',
    cost: 1,
    reward: 10,
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
    reward: 10,
    questions: [
        { q: 'What is a block in a blockchain?', a: ['A type of cryptocurrency', 'A collection of transactions', 'A mining computer'], correct: 'A collection of transactions' },
        { q: 'How are blocks linked together?', a: ['With physical chains', 'Through cryptographic hashes', 'By email'], correct: 'Through cryptographic hashes' },
    ]
  },
];

// --- State Management ---
const playerStates = new Map<string, InMemoryPlayerState>(); // Key: player.username

// --- NPC Management ---
interface NpcInfo {
    type: 'knowledge' | 'quiz';
    dataId: string;
}
const npcs = new Map<number, NpcInfo>(); // Key: Entity ID

// --- Helper Functions ---
function updateSats(username: string, amount: number): boolean {
    const state = playerStates.get(username);
    if (!state) {
        console.warn(`Attempted to update sats for unknown player username: ${username}`);
        return false;
    }
    const newSats = state.sats + amount;
    if (newSats < 0) {
        console.log(`Player ${username} attempted transaction resulting in negative sats (${newSats}). Denied.`);
        return false;
    }
    state.sats = newSats;
    playerStates.set(username, state);
    console.log(`Updated sats for player ${username}. New balance: ${state.sats}`);
    return true;
}

// --- Quiz Logic Functions ---
function askQuestion(world: World, player: Player, quizId: string, questionIndex: number) {
    const username = player.username;
    const playerState = playerStates.get(username);
    const quiz = quizzes.find(q => q.id === quizId);

    if (!playerState || !quiz || !playerState.activeQuiz || playerState.activeQuiz.quizId !== quizId) {
        console.error(`askQuestion called with invalid state for player ${username}, quizId: ${quizId}`);
        if (playerState && playerState.activeQuiz) {
             if (playerState.activeQuiz.timerId) clearTimeout(playerState.activeQuiz.timerId);
             playerState.activeQuiz = null;
             playerStates.set(username, playerState); // Update state if cleared
        }
        return;
    }

    if (questionIndex >= quiz.questions.length) {
        endQuiz(world, player, quizId, true);
        return;
    }

    const question = quiz.questions[questionIndex];
    if (!question) {
        console.error(`Could not find question at index ${questionIndex} for quiz ${quizId}.`);
        world.chatManager.sendPlayerMessage(player, `[System]: Error loading question ${questionIndex + 1}. Ending quiz.`, 'FF0000');
        endQuiz(world, player, quizId, false);
        return;
    }

    playerState.activeQuiz.questionIndex = questionIndex;

    let answerText = question.a.map((ans, index) => `${index + 1}. ${ans}`).join('\n');
    world.chatManager.sendPlayerMessage(player, `Question ${questionIndex + 1}/${quiz.questions.length}: ${question.q}`, 'FFFFFF');
    world.chatManager.sendPlayerMessage(player, answerText, 'ADD8E6');
    world.chatManager.sendPlayerMessage(player, `Type /a <number> within 30 seconds!`, 'FFFF00');

    if (playerState.activeQuiz.timerId) {
        clearTimeout(playerState.activeQuiz.timerId);
    }

    playerState.activeQuiz.timerId = setTimeout(() => {
        const currentState = playerStates.get(username);
        if (currentState?.activeQuiz?.quizId === quizId && currentState.activeQuiz.questionIndex === questionIndex) {
            world.chatManager.sendPlayerMessage(player, "Time's up!", 'FF0000');
            endQuiz(world, player, quizId, false);
        }
    }, 30 * 1000);

    playerStates.set(username, playerState);
}

function endQuiz(world: World, player: Player, quizId: string, won: boolean) {
    const username = player.username;
    const playerState = playerStates.get(username);
    const quiz = quizzes.find(q => q.id === quizId);

    if (!playerState || !playerState.activeQuiz || playerState.activeQuiz.quizId !== quizId) {
        console.warn(`endQuiz called for player ${username} for quiz ${quizId}, but they are not actively in it.`);
        return;
    }

    if (playerState.activeQuiz.timerId) {
        clearTimeout(playerState.activeQuiz.timerId);
    }

    playerState.activeQuiz = null; // Clear active quiz state first

    if (won) {
        playerState.completedQuizzes.add(quizId);
        const reward = quiz?.reward ?? 10;
        if (updateSats(username, reward)) {
            world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! You earned ${reward} sats. Your balance: ${playerState.sats} sats.`, '00FF00');
        } else {
             world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! Failed to award sats.`, 'FF0000');
        }
    } else {
        world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Failed. You lost the entry cost.`, 'FF0000');
    }

    playerStates.set(username, playerState); // Update state map
}

// --- Server Start ---
startServer(async world => {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("FATAL: Database initialization failed. Server cannot start.", error);
    process.exit(1);
  }

  world.loadMap(worldMap);

  // --- Spawn NPCs ---
  try {
      const spawnNpc = (config: { model: string, pos: {x: number, y: number, z: number}, type: 'knowledge' | 'quiz', dataId: string, name: string }) => {
          const npcEntity = new Entity({
              modelUri: config.model,
              rigidBodyOptions: {
                  type: RigidBodyType.FIXED,
                  colliders: [
                      { shape: ColliderShape.CYLINDER, radius: 0.5, halfHeight: 1 }, // Physical
                      { // Interaction Sensor
                          shape: ColliderShape.CYLINDER, radius: 1.5, halfHeight: 1.5, isSensor: true, tag: 'interaction-sensor',
                          onCollision: (other: Entity | BlockType, started: boolean) => {
                              if (started && other instanceof PlayerEntity && other.player) {
                                  handleNpcInteraction(world, other.player, npcEntity.id);
                              }
                          }
                      }
                  ]
              }
          });
          npcEntity.spawn(world, config.pos);
          if (npcEntity.id !== undefined) {
              npcs.set(npcEntity.id, { type: config.type, dataId: config.dataId });
              console.log(`Spawned ${config.type} NPC: ${config.name} (ID: ${npcEntity.id}) associated with ${config.dataId}`);
          } else {
               console.error(`Failed to get ID for spawned NPC: ${config.name}`);
               if (npcEntity.world) npcEntity.despawn();
          }
      };

      spawnNpc({ model: 'models/npcs/skeleton.gltf', pos: { x: 5, y: 3, z: 5 }, type: 'knowledge', dataId: 'lesson1', name: 'InfoSkeleton' });
      spawnNpc({ model: 'models/npcs/skeleton.gltf', pos: { x: -5, y: 3, z: 5 }, type: 'knowledge', dataId: 'lesson2', name: 'DataBones' });
      spawnNpc({ model: 'models/npcs/mindflayer.gltf', pos: { x: 0, y: 3, z: -5 }, type: 'quiz', dataId: 'quiz1', name: 'QuizMind' });

  } catch (error) {
      console.error("Error during initial NPC spawning:", error);
  }

  // --- Player Join Logic ---
  world.on(PlayerEvent.JOINED_WORLD, async ({ player, world }) => {
    const playerEntity = new PlayerEntity({
      player,
      name: player.username,
      modelUri: 'models/players/robocop.gltf',
    });
    playerEntity.spawn(world, new Vector3(0, 5, 0));

    // Use username as the key
    const username = player.username;

    console.log(`Loading data for player ${username}...`);
    const loadedDbState = await loadPlayerData(username); // Returns DbPlayerState | null

    let inMemoryState: InMemoryPlayerState;
    let isGuest: boolean;

    if (loadedDbState === null) {
        // Error case during load
        console.error(`Error loading data for player ${username}. Treating as guest.`);
        isGuest = true;
        inMemoryState = {
            sats: 5, // Default sats on error
            completedLessons: new Set<string>(),
            completedQuizzes: new Set<string>(),
            activeQuiz: null,
            isGuest: true,
            isAuthenticated: false, // Initialize as not authenticated
        };
    } else {
        // Check if the loaded data matches the default state returned when player not found
        // Check if the loaded data has a password hash - if not, it's likely the default object
        // or an old record before passwords were added. Treat as guest initially.
        // The 'isGuest' flag now primarily means "does this username exist in the DB?".
        // Authentication determines if they *proved* they are that user.
        isGuest = !('passwordHash' in loadedDbState && loadedDbState.passwordHash !== null);

        // Create the in-memory state object from the loaded DB state
        inMemoryState = {
            sats: loadedDbState.sats,
            completedLessons: new Set(loadedDbState.completedLessons),
            completedQuizzes: new Set(loadedDbState.completedQuizzes),
            activeQuiz: null, // Initialize activeQuiz
            isGuest: isGuest, // Set the guest flag based on DB existence (presence of hash)
            isAuthenticated: false, // Initialize as not authenticated, requires /login
        };
    }

    playerStates.set(username, inMemoryState);
    console.log(`Player ${username} joined. ${isGuest ? 'New player (guest)' : 'Existing player loaded'}. Initial state:`, inMemoryState);

    world.chatManager.sendPlayerMessage(player, 'Welcome to the Bitcoin Learning Game!', '00FF00');
    world.chatManager.sendPlayerMessage(player, `Your current balance: ${inMemoryState.sats} sats. Interact with NPCs to learn and take quizzes!`, 'FFFF00');
    // Add instructions for register/login
    world.chatManager.sendPlayerMessage(player, `To save your progress, use: /register <username> <password>`, 'ADD8E6');
    world.chatManager.sendPlayerMessage(player, `If you already have an account, use: /login <username> <password>`, 'ADD8E6');
  });

  // --- Player Leave Logic ---
  world.on(PlayerEvent.LEFT_WORLD, async ({ player, world }) => { // Add world back
    const username = player.username;

    // Clear active quiz timer
    const playerState = playerStates.get(username);
    if (playerState?.activeQuiz?.timerId) {
        clearTimeout(playerState.activeQuiz.timerId);
        console.log(`Cleared active quiz timer for leaving player ${username}`);
    }

    // Despawn player entities
    const entitiesToDespawn = world.entityManager.getPlayerEntitiesByPlayer(player);
    console.log(`Player ${username} left. Despawning ${entitiesToDespawn.length} associated entities.`);
    entitiesToDespawn.forEach(entity => {
        if (entity.world) {
             console.log(`Despawning entity ${entity.id} for leaving player ${username}`);
             entity.despawn();
        }
    });

    // Save player state
    const finalState = playerStates.get(username);
    if (finalState) {
        // --- MODIFICATION START: Only save if not a guest ---
        // --- MODIFICATION START: Only save if authenticated ---
        if (finalState.isAuthenticated) {
            console.log(`Saving final state for non-guest player ${username}...`);
            try {
                await savePlayerData(username, finalState); // Pass the InMemoryPlayerState
            } catch (saveError) {
                console.error(`Failed to save data for player ${username} on leave:`, saveError);
            }
        } else {
            console.log(`Skipping save for non-authenticated player ${username}.`);
        }
        // --- MODIFICATION END: Only save if authenticated ---
    } else {
        console.warn(`Could not find final state for leaving player ${username} to save.`);
    }

    // Remove player state from memory AFTER saving attempt
    if (playerStates.delete(username)) {
        console.log(`Removed in-memory state for player ${username}.`);
    } else {
         console.warn(`Attempted to remove state for player ${username}, but it was already gone.`);
    }
  });

  // --- Ambient Audio ---
  new Audio({
    uri: 'audio/music/hytopia-main.mp3',
    loop: true,
    volume: 0.1,
  }).play(world);

  // --- Chat Command Handling ---
  // Type annotation removed, types will be inferred or default to any
  // World is accessed from the outer scope, not event args
  world.chatManager.on(ChatEvent.BROADCAST_MESSAGE, ({ player, message }) => {
      if (!player) return;
      const username = player.username;
      const playerState = playerStates.get(username); // Get state once for this handler

      if (!playerState) {
          // This might happen if a message comes through before JOINED_WORLD completes fully
          console.warn(`Received chat message from player ${username} but state not found.`);
          // Optionally send a message back telling them to wait or rejoin
          // world.chatManager.sendPlayerMessage(player, `[System]: Still initializing your state, please wait a moment.`, 'FFA500');
          return;
      }

      // --- /q (start quiz) Command ---
      if (message.startsWith('/q ')) {
          let rawQuizArg = message.substring('/q '.length).trim();
          let quizId = rawQuizArg;
          if (/^q\d+$/.test(rawQuizArg)) {
              quizId = 'quiz' + rawQuizArg.substring(1);
          }

          const quiz = quizzes.find(q => q.id === quizId);

          if (!quiz) {
              world.chatManager.sendPlayerMessage(player, `Quiz with ID "${quizId}" not found.`, 'FF0000');
              return;
          }

          if (playerState.completedQuizzes.has(quizId)) {
              world.chatManager.sendPlayerMessage(player, `You have already completed the "${quiz.topic}" quiz!`, 'FFFF00');
          } else if (playerState.activeQuiz) {
              world.chatManager.sendPlayerMessage(player, 'You are already in a quiz! Finish it first.', 'FFA500');
          } else if (updateSats(username, -quiz.cost)) { // Attempt to deduct cost using username
              world.chatManager.sendPlayerMessage(player, `Starting quiz "${quiz.topic}"... Cost: ${quiz.cost} sats deducted. Your balance: ${playerState.sats} sats.`, '00FF00');
              // Start the quiz
              playerState.activeQuiz = {
                  quizId: quizId,
                  questionIndex: 0,
                  timerId: null,
                  score: 0
              };
              playerStates.set(username, playerState); // Update state map
              askQuestion(world, player, quizId, 0); // Ask the first question
          } else {
              // updateSats failed (insufficient funds)
              world.chatManager.sendPlayerMessage(player, `You don't have enough sats to start the "${quiz.topic}" quiz. Cost: ${quiz.cost} sats. You have: ${playerState.sats} sats.`, 'FF0000');
          }
      }

      // --- /a (answer quiz) Command ---
      else if (message.startsWith('/a ')) {
          const activeQuiz = playerState.activeQuiz; // Use state fetched at start of handler

          if (!activeQuiz) {
              world.chatManager.sendPlayerMessage(player, 'You are not currently in a quiz.', 'FFA500');
              return;
          }

          const choiceStr = message.substring('/a '.length).trim();
          const choiceNum = parseInt(choiceStr, 10);

          const quiz = quizzes.find(q => q.id === activeQuiz.quizId);
          if (!quiz) {
              console.error(`[Chat /a] Active quiz data not found for ID: ${activeQuiz.quizId}`);
              world.chatManager.sendPlayerMessage(player, `[System]: Error finding your current quiz data. Ending quiz.`, 'FF0000');
              endQuiz(world, player, activeQuiz.quizId, false);
              return;
          }

          const questionIndex = activeQuiz.questionIndex;
          const currentQuestion = quiz.questions[questionIndex];
          if (!currentQuestion) {
               console.error(`[Chat /a] Active question data not found for quiz ${activeQuiz.quizId} at index ${questionIndex}`);
               world.chatManager.sendPlayerMessage(player, `[System]: Error finding your current question data. Ending quiz.`, 'FF0000');
               endQuiz(world, player, activeQuiz.quizId, false);
               return;
          }

          if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > currentQuestion.a.length) {
              world.chatManager.sendPlayerMessage(player, `Invalid choice "${choiceStr}". Please enter a number between 1 and ${currentQuestion.a.length}.`, 'FF0000');
              return;
          }

          const selectedAnswer = currentQuestion.a[choiceNum - 1];

          // Clear the timer for this question
          if (activeQuiz.timerId) {
              clearTimeout(activeQuiz.timerId);
              activeQuiz.timerId = null; // Important to clear it in state too
          }

          if (selectedAnswer === currentQuestion.correct) {
              activeQuiz.score += 1;
              world.chatManager.sendPlayerMessage(player, 'Correct!', '00FF00');
              // Ask next question or end quiz if finished
              askQuestion(world, player, activeQuiz.quizId, questionIndex + 1);
          } else {
              world.chatManager.sendPlayerMessage(player, `Incorrect! The correct answer was: ${currentQuestion.correct}`, 'FF0000');
              endQuiz(world, player, activeQuiz.quizId, false); // End quiz due to incorrect answer
          }
          // No need to set playerState here, askQuestion/endQuiz handles it
      }

      // --- /sats Command ---
      else if (message.trim() === '/sats') {
          // Use playerState fetched at start of handler
          world.chatManager.sendPlayerMessage(player, `Your current balance: ${playerState.sats} sats.`, 'FFFF00');
      }

      // Add other commands here if needed

      // --- /register Command ---
      else if (message.startsWith('/register ')) {
          // Check if player is already authenticated
          if (playerState.isAuthenticated) {
              world.chatManager.sendPlayerMessage(player, 'You are already logged in. Cannot register again.', 'FFA500');
              return;
          }

          const args = message.substring('/register '.length).trim().split(' ');
          if (args.length !== 2) {
              world.chatManager.sendPlayerMessage(player, 'Usage: /register <username> <password>', 'FFA500');
              return;
          }
          const [regUsername, regPassword] = args;

          // Basic validation (could add more checks like length, characters)
          if (!regUsername || !regPassword) {
               world.chatManager.sendPlayerMessage(player, 'Username and password cannot be empty.', 'FF0000');
               return;
          }

          // Prevent registration if already logged in with a different account? - Handled by the check above
          // For simplicity, allow registration attempt even if logged in. - Removed this comment, check added
          // The database check will prevent duplicate usernames.

          registerPlayer(regUsername, regPassword).then(result => {
              world.chatManager.sendPlayerMessage(player, `[Register]: ${result.message}`, result.success ? '00FF00' : 'FF0000');
              // --- Auto-login on successful registration ---
              if (result.success) {
                  // Update the current player's state to authenticated
                  playerState.isAuthenticated = true;
                  playerState.isGuest = false;
                  // Set initial state values (matching DB defaults on register)
                  playerState.sats = 5; // Default sats
                  playerState.completedLessons = new Set();
                  playerState.completedQuizzes = new Set();
                  playerStates.set(username, playerState); // Update the map

                  world.chatManager.sendPlayerMessage(player, `You have been automatically logged in as ${regUsername}.`, '00FF00');
                  console.log(`Player ${username} registered and automatically logged in as ${regUsername}.`);
              }
              // --- End Auto-login ---
          }).catch(err => {
              console.error(`[Register Command] Error during registration for ${regUsername}:`, err);
              world.chatManager.sendPlayerMessage(player, '[Register]: An unexpected error occurred.', 'FF0000');
          });
      }

      // --- /login Command ---
      else if (message.startsWith('/login ')) {
           const args = message.substring('/login '.length).trim().split(' ');
           if (args.length !== 2) {
               world.chatManager.sendPlayerMessage(player, 'Usage: /login <username> <password>', 'FFA500');
               return;
           }
           const [loginUsername, loginPassword] = args;

           if (!loginUsername || !loginPassword) {
               world.chatManager.sendPlayerMessage(player, 'Username and password cannot be empty.', 'FF0000');
               return;
           }

           // Check if already authenticated (can't log in again)
           if (playerState.isAuthenticated) {
               world.chatManager.sendPlayerMessage(player, 'You are already logged in.', 'FFA500');
               return;
           }

           // Attempt to load data for the provided username
           loadPlayerData(loginUsername).then(async loadedData => {
               // Check if data was found AND it has the passwordHash property
               if (loadedData && 'passwordHash' in loadedData && loadedData.passwordHash) {
                   try {
                       const match = await bcrypt.compare(loginPassword, loadedData.passwordHash);
                       if (match) {
                           // --- Login Successful ---
                           // Update the current player's state in the map
                           playerState.sats = loadedData.sats;
                           playerState.completedLessons = new Set(loadedData.completedLessons);
                           playerState.completedQuizzes = new Set(loadedData.completedQuizzes);
                           playerState.isAuthenticated = true;
                           playerState.isGuest = false; // No longer a guest after successful login
                           // Note: We are updating the state associated with the *current* player connection (player.username)
                           // If loginUsername is different from player.username (e.g., guest trying to log in),
                           // this correctly updates *their* session state.
                           playerStates.set(username, playerState); // Ensure map is updated

                           world.chatManager.sendPlayerMessage(player, `Login successful! Welcome back, ${loginUsername}.`, '00FF00');
                           world.chatManager.sendPlayerMessage(player, `Your balance: ${playerState.sats} sats.`, 'FFFF00');
                           console.log(`Player ${username} successfully logged in as ${loginUsername}. State updated.`);

                       } else {
                           // Password mismatch
                           world.chatManager.sendPlayerMessage(player, 'Invalid username or password.', 'FF0000');
                       }
                   } catch (compareError) {
                        console.error(`[Login Command] Error comparing password for ${loginUsername}:`, compareError);
                        world.chatManager.sendPlayerMessage(player, 'Error during login. Please try again.', 'FF0000');
                   }
               } else {
                   // User not found in DB or no password hash stored
                   world.chatManager.sendPlayerMessage(player, 'Invalid username or password.', 'FF0000');
               }
           }).catch(loadError => {
               console.error(`[Login Command] Error loading player data for ${loginUsername}:`, loadError);
               world.chatManager.sendPlayerMessage(player, 'Error during login. Please try again.', 'FF0000');
           });
      }

  });

  console.log("Bitcoin Learning Game server initialized with NPCs, quiz logic, chat commands, and DB persistence.");

}); // END startServer

// --- NPC Interaction Logic ---
function handleNpcInteraction(world: World, player: Player, npcEntityId: number | undefined) {
    const username = player.username;
    if (npcEntityId === undefined) return;

    const npcInfo = npcs.get(npcEntityId);
    if (!npcInfo) {
        console.warn(`Collision with unknown NPC entity ID: ${npcEntityId}`);
        return;
    }

    const playerState = playerStates.get(username);
    if (!playerState) {
        console.error(`Player state not found for player ${username} during interaction.`);
        return;
    }

    console.log(`Player ${username} collided with known NPC ID: ${npcEntityId}, type: ${npcInfo.type}`);

    if (npcInfo.type === 'knowledge') {
        const lesson = lessons.find(l => l.id === npcInfo.dataId);
        if (lesson) {
            world.chatManager.sendPlayerMessage(player, `[${lesson.npcName}]: ${lesson.text}`, 'ADD8E6');

            if (!playerState.completedLessons.has(lesson.id)) {
                playerState.completedLessons.add(lesson.id);
                const reward = lesson?.reward ?? 1;
                if (updateSats(username, reward)) {
                    world.chatManager.sendPlayerMessage(player, `+1 Sat! Lesson complete. Your balance: ${playerState.sats} sats.`, '00FF00');
                } else {
                    world.chatManager.sendPlayerMessage(player, `Lesson complete, but failed to update sats.`, 'FF0000');
                }
                playerStates.set(username, playerState); // Update state map after modification
            } else {
                world.chatManager.sendPlayerMessage(player, `You have already learned this lesson.`, 'FFFF00');
            }
        } else {
            console.error(`Knowledge NPC (ID: ${npcEntityId}) has invalid dataId: ${npcInfo.dataId}`);
            world.chatManager.sendPlayerMessage(player, `[System]: Error retrieving lesson data.`, 'FF0000');
        }
    } else if (npcInfo.type === 'quiz') {
        const quiz = quizzes.find(q => q.id === npcInfo.dataId);
        if (quiz) {
            if (playerState.completedQuizzes.has(quiz.id)) {
                 world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: You have already completed the ${quiz.topic} quiz!`, 'FFFF00');
            } else if (playerState.activeQuiz) {
                 world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: Finish your current quiz before starting another!`, 'FFA500');
            } else {
                const shortQuizId = quiz.id.replace('quiz', 'q');
                world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: This is the ${quiz.topic} quiz. Type /q ${shortQuizId} to begin (Cost: ${quiz.cost} sat).`, 'FFA500');
            }
        } else {
            console.error(`Quiz NPC (ID: ${npcEntityId}) has invalid dataId: ${npcInfo.dataId}`);
            world.chatManager.sendPlayerMessage(player, `[System]: Error retrieving quiz data.`, 'FF0000');
        }
    }
}
