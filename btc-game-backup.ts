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
  import { initializeDatabase, loadPlayerData, savePlayerData } from './src/database'; // Removed registerPlayer
  import type { InMemoryPlayerState, Lesson, Quiz, QuizQuestion, ActiveQuizState, DbPlayerState } from './src/types'; // Added DbPlayerState
  // Removed bcrypt import
  
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
        const spawnNpc = (config: { model: string, scale: number, pos: {x: number, y: number, z: number}, type: 'knowledge' | 'quiz', dataId: string, name: string }) => {
            const npcEntity = new Entity({
                modelUri: config.model,
                modelScale: config.scale,
                modelLoopedAnimations: [ 'idle' ],
                rigidBodyOptions: {
                    type: RigidBodyType.FIXED,
                    colliders: [
                        { shape: ColliderShape.CYLINDER, radius: 0.1, halfHeight: 0.1 }, // Physical
                        { // Interaction Sensor
                            shape: ColliderShape.CYLINDER, radius: 0.1, halfHeight: 0.1, isSensor: true, tag: 'interaction-sensor',
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
  
        spawnNpc({ model: 'models/players/robocop.gltf', scale: 1.5, pos: { x: 5, y: 1.7, z: -5 }, type: 'knowledge', dataId: 'lesson1', name: 'InfoSkeleton' }); 
        spawnNpc({ model: 'models/players/robot1.gltf', scale: 1, pos: { x: -5, y: 1.7, z: -5 }, type: 'knowledge', dataId: 'lesson2', name: 'DataBones' }); // higher Y will float
        spawnNpc({ model: 'models/npcs/mindflayer.gltf', scale: 0.4, pos: { x: 0, y: 1.9, z: 5 }, type: 'quiz', dataId: 'quiz1', name: 'QuizMind' }); // lower Y will be burried
  
    } catch (error) {
        console.error("Error during initial NPC spawning:", error);
    }
  
    // --- Player Join Logic ---
    world.on(PlayerEvent.JOINED_WORLD, async ({ player, world }) => {
      const playerEntity = new PlayerEntity({
        player,
        name: player.username,
        modelUri: 'models/players/robot2.gltf', // Updated model name from file read
        modelScale: 0.2,
        // Reverted rigidBodyOptions changes
      });
      // Spawn height adjusted for collider offset and height (halfHeight - offsetY)
      playerEntity.spawn(world, { x: 0, y: 0.67, z: 1 }); // Set spawn Y back to 0.67
  
      // Use username as the key
      const username = player.username;
  
      console.log(`Loading data for player ${username}...`);
      const loadedDbState = await loadPlayerData(username); // Returns DbPlayerState | null
  
      let inMemoryState: InMemoryPlayerState;
      let isGuest: boolean;
  
      // Player always starts as guest and not authenticated.
      // They need to use /login <username> to load their data.
      isGuest = true; // Always start as guest
      inMemoryState = {
          sats: 5, // Default sats
          completedLessons: new Set<string>(),
          completedQuizzes: new Set<string>(),
          activeQuiz: null,
          isGuest: true,
          isAuthenticated: false, // Not authenticated until login
          loggedInUsername: null, // Initialize loggedInUsername
      };
      // We don't load data here anymore, only on explicit /login
  
      playerStates.set(username, inMemoryState);
      console.log(`Player ${username} joined as guest. Initial state:`, inMemoryState);
  
      world.chatManager.sendPlayerMessage(player, 'Welcome to the Bitcoin Learning Game!', '00FF00');
      world.chatManager.sendPlayerMessage(player, `You are currently playing as a guest. Your progress won't be saved.`, 'FFA500');
      world.chatManager.sendPlayerMessage(player, `Use /login <username> to load your saved progress or create a new profile.`, 'ADD8E6');
      world.chatManager.sendPlayerMessage(player, `Your current balance: ${inMemoryState.sats} sats. Interact with NPCs to learn and take quizzes!`, 'FFFF00');
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
          // --- MODIFICATION START: Use loggedInUsername for saving ---
          if (finalState.isAuthenticated && finalState.loggedInUsername) {
              const saveUsername = finalState.loggedInUsername;
              console.log(`Saving final state for authenticated player ${saveUsername} (connection: ${username})...`);
              try {
                  await savePlayerData(saveUsername, finalState); // Use the logged-in username for saving
              } catch (saveError) {
                  console.error(`Failed to save data for player ${username} on leave:`, saveError);
              }
          } else {
              console.log(`Skipping save for non-authenticated or guest player ${username}.`);
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
  
        // --- /register Command Removed ---
  
        // --- /login Command ---
        else if (message.startsWith('/login ')) {
             const args = message.substring('/login '.length).trim().split(' ');
             // Now only expects username
             if (args.length !== 1 || !args[0]) {
                 world.chatManager.sendPlayerMessage(player, 'Usage: /login <username>', 'FFA500');
                 return;
             }
             const loginUsername = args[0];
  
             // Basic validation
             if (!loginUsername) {
                 world.chatManager.sendPlayerMessage(player, 'Username cannot be empty.', 'FF0000');
                 return;
             }
  
             // Check if already authenticated (can't log in again)
             if (playerState.isAuthenticated) {
                 world.chatManager.sendPlayerMessage(player, 'You are already logged in.', 'FFA500');
                 return;
             }
  
             // Attempt to load data for the provided username
             loadPlayerData(loginUsername).then(loadedData => {
                 // Check if data was found (loadPlayerData returns null if not found)
                 if (loadedData !== null) {
                     // --- Login Successful (Existing User) ---
                     playerState.sats = loadedData.sats;
                     playerState.completedLessons = new Set(loadedData.completedLessons);
                     playerState.completedQuizzes = new Set(loadedData.completedQuizzes);
                     playerState.isAuthenticated = true;
                     playerState.isGuest = false; // No longer a guest
                     playerState.loggedInUsername = loginUsername; // Store the logged-in username
                     playerStates.set(username, playerState); // Update map for the current connection
  
                     world.chatManager.sendPlayerMessage(player, `Login successful! Welcome back, ${loginUsername}.`, '00FF00');
                     world.chatManager.sendPlayerMessage(player, `Your balance: ${playerState.sats} sats.`, 'FFFF00');
                     console.log(`Player ${username} successfully logged in as existing user ${loginUsername}. State updated.`);
  
                 } else {
                     // --- Login as New User ---
                     // Username not found in DB, treat as a new profile creation/login
                     playerState.isAuthenticated = true; // Mark as authenticated
                     playerState.isGuest = false; // Not a guest anymore
                     playerState.loggedInUsername = loginUsername; // Store the logged-in username
                     // Keep default initial state (5 sats, empty sets)
                     playerState.sats = 5;
                     playerState.completedLessons = new Set();
                     playerState.completedQuizzes = new Set();
                     playerStates.set(username, playerState); // Update map for the current connection
  
                     world.chatManager.sendPlayerMessage(player, `Welcome, ${loginUsername}! A new profile has been created for you. Your progress will now be saved.`, '00FF00');
                     world.chatManager.sendPlayerMessage(player, `Your balance: ${playerState.sats} sats.`, 'FFFF00');
                     console.log(`Player ${username} logged in as new user ${loginUsername}. State initialized.`);
                     // Note: The data will be saved for the first time when the player leaves.
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
  