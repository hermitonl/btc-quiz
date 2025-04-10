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
} from 'hytopia';

import worldMap from './assets/maps/boilerplate.json';
import { initializeDatabase, loadPlayerData, savePlayerData } from './src/database';
import type { InMemoryPlayerState, Lesson, Quiz, QuizQuestion, ActiveQuizState, DbPlayerState } from './src/types';

// --- Constants ---
const DEFAULT_SPAWN_POS = new Vector3(0, 0.67, 1); // Default player spawn location
const QUIZ_DURATION_MS = 30 * 1000; // 30 seconds per question
const QUIZ_PLATFORM_Y = 0.1; // Y level slightly above ground for detection
const QUIZ_PLATFORM_CENTERS: Vector3[] = [
    new Vector3(-3, QUIZ_PLATFORM_Y, 5),   // Platform 1 (index 0) - Front Left
    new Vector3( 3, QUIZ_PLATFORM_Y, 5),   // Platform 2 (index 1) - Front Right
    new Vector3(-3, QUIZ_PLATFORM_Y, 10),  // Platform 3 (index 2) - Back Left
    new Vector3( 3, QUIZ_PLATFORM_Y, 10)   // Platform 4 (index 3) - Back Right
];
const PLATFORM_DETECTION_RADIUS_SQ = 1.5 * 1.5; // Squared radius for checking if player is 'on' a platform center (for answering)
const PROXIMITY_DETECTION_RADIUS_SQ = 2.5 * 2.5; // Larger radius for proximity feedback
const PLATFORM_BUILD_Y = 0; // Build platforms at Y=0 (adjust if ground level is different)
const PLATFORM_SIZE = 3; // Build 3x3 platforms

// --- Lesson & Quiz Data ---
const lessons: Lesson[] = [
    { id: 'lesson1', npcName: 'InfoSkeleton', text: 'Bitcoin is a decentralized digital currency...', reward: 1 },
    { id: 'lesson2', npcName: 'DataBones', text: 'Transactions are recorded on a public ledger called the blockchain.', reward: 1 },
    { id: 'lesson3', npcName: 'InfoSkeleton', text: 'New bitcoins are created through mining.', reward: 1 },
];
const quizzes: Quiz[] = [
    {
        id: 'quiz1', npcName: 'QuizMind', topic: 'Bitcoin Basics', cost: 1, reward: 10,
        questions: [
            { q: 'What is Bitcoin primarily known as?', a: ['A physical coin', 'A decentralized digital currency', 'A government-backed asset'], correct: 'A decentralized digital currency' },
            { q: 'What is the maximum supply of Bitcoin?', a: ['100 Million', 'Unlimited', '21 Million'], correct: '21 Million' },
            { q: 'What technology underlies Bitcoin transactions?', a: ['Database', 'Blockchain', 'Spreadsheet'], correct: 'Blockchain' }
        ]
    },
    {
        id: 'quiz2', npcName: 'QuizMind', topic: 'Blockchain Fundamentals', cost: 2, reward: 10,
        questions: [
            { q: 'What is a block in a blockchain?', a: ['A type of cryptocurrency', 'A collection of transactions', 'A mining computer'], correct: 'A collection of transactions' },
            { q: 'How are blocks linked together?', a: ['With physical chains', 'Through cryptographic hashes', 'By email'], correct: 'Through cryptographic hashes' },
        ]
    },
];

// --- State Management ---
const playerStates = new Map<string, InMemoryPlayerState>(); // Key: player.username

// --- NPC Management ---
interface NpcInfo { type: 'knowledge' | 'quiz'; dataId: string; }
const npcs = new Map<number, NpcInfo>(); // Key: Entity ID

// --- Helper Functions ---
function updateSats(username: string, amount: number): boolean {
    const state = playerStates.get(username);
    if (!state) { console.warn(`Update sats failed: Unknown player ${username}`); return false; }
    const newSats = state.sats + amount;
    if (newSats < 0) { console.log(`Player ${username} transaction denied: insufficient sats.`); return false; }
    state.sats = newSats;
    playerStates.set(username, state);
    console.log(`Updated sats for player ${username}. New balance: ${state.sats}`);
    return true;
}

// --- Platform Building Helper ---
function buildPlatform(world: World, center: Vector3, blockTypeId: number) {
    // Rely on try/catch inside the loop instead of checking method existence here
    const halfSize = Math.floor(PLATFORM_SIZE / 2);
    const minX = Math.floor(center.x - halfSize); const maxX = Math.floor(center.x + halfSize);
    const minZ = Math.floor(center.z - halfSize); const maxZ = Math.floor(center.z + halfSize);
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            try {
                // Assume world.chunkLattice exists, catch if setBlock fails
                world.chunkLattice.setBlock({ x, y: PLATFORM_BUILD_Y, z }, blockTypeId);
            }
            catch (e) {
                console.error(`Error setting block at ${x},${PLATFORM_BUILD_Y},${z} (ID: ${blockTypeId}):`, e);
                // Avoid spamming console if method is missing entirely
                if (e instanceof TypeError && e.message.includes('setBlock')) {
                    console.error("SDK Error: world.chunkLattice.setBlock might be missing or incorrect.");
                    return; // Stop trying to build this platform if method is wrong
                }
            }
        }
    }
}

// --- Quiz Logic Functions ---
function askQuestion(world: World, player: Player, quizId: string, questionIndex: number) {
    const username = player.username;
    const playerState = playerStates.get(username);
    const quiz = quizzes.find(q => q.id === quizId);

    if (!playerState || !quiz) {
        console.error(`askQuestion error: Player state or quiz not found for quizId ${quizId}`);
        return;
    }

    // --- Rebuild platforms before asking ---
    const platformBlockTypeIds = [18, 19, 20, 21]; // Must match IDs used in startServer
    console.log(`[askQuestion] Rebuilding platforms for Q${questionIndex}`);
    QUIZ_PLATFORM_CENTERS.forEach((center, index) => {
        const blockTypeId = platformBlockTypeIds[index % platformBlockTypeIds.length] || 1;
        buildPlatform(world, center, blockTypeId); // Use helper function
    });
    // --- End Rebuild ---

    if (questionIndex >= quiz.questions.length) {
        endQuiz(world, player, quizId, true, 'correct'); // Won quiz
        return;
    }

    const question = quiz.questions[questionIndex];
    if (!question) {
        console.error(`Cannot find question index ${questionIndex} for quiz ${quizId}.`);
        world.chatManager.sendPlayerMessage(player, `[System]: Error loading question ${questionIndex + 1}. Ending quiz.`, 'FF0000');
        endQuiz(world, player, quizId, false, 'error'); return;
    }

    // Update active quiz state for the new question
    if (playerState.activeQuiz) {
        playerState.activeQuiz.questionIndex = questionIndex;
        playerState.activeQuiz.questionStartTime = Date.now();
        playerState.activeQuiz.answeredCurrentQuestion = false;
        playerState.activeQuiz.lastPlatformIndex = null;
    } else {
        console.error(`[askQuestion] activeQuiz was null for ${username} when trying to update.`);
        playerState.activeQuiz = {
            quizId: quizId, questionIndex: questionIndex, questionStartTime: Date.now(),
            answeredCurrentQuestion: false, lastPlatformIndex: null, score: 0
        };
    }
    playerState.lastProximityPlatformIndex = null; // Reset proximity tracker
    playerStates.set(username, playerState); // Update state map

    // Present question and answers
    world.chatManager.sendPlayerMessage(player, `--- Question ${questionIndex + 1}/${quiz.questions.length} ---`, 'FFFFFF');
    world.chatManager.sendPlayerMessage(player, `${question.q}`, 'FFFFFF');
    world.chatManager.sendPlayerMessage(player, `-------------------------`, 'FFFFFF');
    if (question.a.length > QUIZ_PLATFORM_CENTERS.length) {
         console.error(`Quiz ${quizId} Q${questionIndex}: ${question.a.length} answers > ${QUIZ_PLATFORM_CENTERS.length} platforms.`);
         world.chatManager.sendPlayerMessage(player, `[System]: Error loading answers. Ending quiz.`, 'FF0000');
         endQuiz(world, player, quizId, false, 'error'); return;
    }
    const locationHints = ["(Front-Left)", "(Front-Right)", "(Back-Left)", "(Back-Right)"];
    question.a.forEach((ans, index) => {
        const hint = locationHints[index] || "";
        world.chatManager.sendPlayerMessage(player, `Platform ${index + 1} ${hint}: ${ans}`, 'ADD8E6');
    });
    world.chatManager.sendPlayerMessage(player, `Stand on the correct platform! Time ends in ${QUIZ_DURATION_MS / 1000} seconds!`, 'FFFF00');

    // Timeout logic is handled in the setInterval loop
}

// Added 'reason' parameter for better feedback
function endQuiz(world: World, player: Player, quizId: string, won: boolean, reason: 'correct' | 'incorrect' | 'timeout' | 'error' = 'error') {
    const username = player.username;
    const playerState = playerStates.get(username);
    const quiz = quizzes.find(q => q.id === quizId);

    if (!playerState || !playerState.activeQuiz || playerState.activeQuiz.quizId !== quizId) {
        console.warn(`endQuiz called for ${username} quiz ${quizId}, but not active.`);
        return;
    }

    const lastPlatformIdx = playerState.activeQuiz.lastPlatformIndex; // Store before clearing state

    playerState.activeQuiz = null; // Clear active state *first*
    playerState.lastProximityPlatformIndex = null; // Clear proximity tracker
    playerStates.set(username, playerState); // Update state map

    // No teleportation needed

    if (won) {
        playerState.completedQuizzes.add(quizId);
        const reward = quiz?.reward ?? 10;
        if (updateSats(username, reward)) {
            world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! +${reward} sats. Balance: ${playerState.sats} sats.`, '00FF00');
        } else {
             world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! Failed to award sats.`, 'FF0000');
        }
        playerStates.set(username, playerState); // Save completion status
    } else { // Player lost or quiz ended due to error/timeout
        let failMsg = `Quiz "${quiz?.topic || quizId}" Failed.`;
        // Specific incorrect/timeout messages are sent from the tick handler *before* calling endQuiz
        if (reason === 'error') {
             failMsg += ` Ended due to an issue.`;
        } else if (reason === 'timeout') {
             failMsg += ` Time ran out`;
             if (lastPlatformIdx !== null) {
                 failMsg += ` while on Platform ${lastPlatformIdx + 1}.`;
             } else {
                 failMsg += ` while not on any platform.`;
             }
        }
        // Add cost info regardless of specific failure reason shown before
        failMsg += ` Cost: ${quiz?.cost || '?'} sats.`;
        // Send a simplified final fail message if needed, or rely on the tick handler's message
        // world.chatManager.sendPlayerMessage(player, failMsg, 'FF0000');
        console.log(`Quiz ended for ${username}. Reason: ${reason}. Won: ${won}`);
    }
}

// --- NPC Interaction Logic ---
function handleNpcInteraction(world: World, player: Player, npcEntityId: number | undefined) {
    const username = player.username;
    if (npcEntityId === undefined) return;
    const npcInfo = npcs.get(npcEntityId);
    if (!npcInfo) { console.warn(`Interaction with unknown NPC ID: ${npcEntityId}`); return; }
    const playerState = playerStates.get(username);
    if (!playerState) { console.error(`Player state not found for ${username} on interaction.`); return; }

    console.log(`Player ${username} interacted with NPC ID: ${npcEntityId}, type: ${npcInfo.type}`);

    if (npcInfo.type === 'knowledge') {
        const lesson = lessons.find(l => l.id === npcInfo.dataId);
        if (lesson) {
            world.chatManager.sendPlayerMessage(player, `[${lesson.npcName}]: ${lesson.text}`, 'ADD8E6');
            if (!playerState.completedLessons.has(lesson.id)) {
                playerState.completedLessons.add(lesson.id);
                const reward = lesson.reward;
                if (updateSats(username, reward)) {
                    world.chatManager.sendPlayerMessage(player, `+${reward} Sat! Lesson complete. Balance: ${playerState.sats} sats.`, '00FF00');
                } else { world.chatManager.sendPlayerMessage(player, `Lesson complete, failed to update sats.`, 'FF0000'); }
                playerStates.set(username, playerState);
            } else { world.chatManager.sendPlayerMessage(player, `You already learned this.`, 'FFFF00'); }
        } else { console.error(`Knowledge NPC ${npcEntityId} has invalid dataId: ${npcInfo.dataId}`); }
    } else if (npcInfo.type === 'quiz') {
        // If player is already in a quiz, don't re-prompt
        if (playerState.activeQuiz) {
             console.log(`Player ${username} interacted with quiz NPC while already in a quiz.`);
             return; // Silently ignore
        }
        const quiz = quizzes.find(q => q.id === npcInfo.dataId);
        if (quiz) {
            if (playerState.completedQuizzes.has(quiz.id)) {
                 world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: You already completed the ${quiz.topic} quiz!`, 'FFFF00');
            } else {
                playerState.pendingQuizId = quiz.id;
                playerStates.set(username, playerState);
                world.chatManager.sendPlayerMessage(player, `[${quiz.npcName}]: Ready for the "${quiz.topic}" quiz? Cost: ${quiz.cost} sats.`, 'FFFF00');
                const shortQuizId = quiz.id.replace('quiz', 'q');
                world.chatManager.sendPlayerMessage(player, `Type /q ${shortQuizId} to begin.`, 'ADD8E6');
            }
        } else { console.error(`Quiz NPC ${npcEntityId} has invalid dataId: ${npcInfo.dataId}`); }
    }
}

// --- Server Start ---
startServer(async world => {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("FATAL: Database initialization failed.", error);
    process.exit(1);
  }

  world.loadMap(worldMap);
  console.log("Main world map loaded.");

  // --- Build Quiz Platforms Dynamically ---
  console.log("Building quiz platforms near spawn using chunkLattice...");
  const platformBlockTypeIds = [18, 19, 20, 21]; // Example: Red, Orange, Yellow, Lime Wool IDs? Adjust!
  QUIZ_PLATFORM_CENTERS.forEach((center, index) => {
      const blockTypeId = platformBlockTypeIds[index % platformBlockTypeIds.length] || 1; // Cycle or default
      buildPlatform(world, center, blockTypeId); // Use helper
      console.log(`Built platform ${index} with block ID ${blockTypeId} around ${center.x},${PLATFORM_BUILD_Y},${center.z}`);
  });
  // Removed the 'else' block for the missing method check

  // --- Spawn NPCs ---
  try {
      const spawnNpc = (config: { model: string, scale: number, pos: {x: number, y: number, z: number}, type: 'knowledge' | 'quiz', dataId: string, name: string }) => {
          const npcEntity = new Entity({
              modelUri: config.model, modelScale: config.scale, modelLoopedAnimations: [ 'idle' ],
              rigidBodyOptions: { type: RigidBodyType.FIXED, colliders: [
                      { shape: ColliderShape.CYLINDER, radius: 0.1, halfHeight: 0.1 },
                      { shape: ColliderShape.CYLINDER, radius: 1.0, halfHeight: 1.0, isSensor: true, tag: 'interaction-sensor',
                          onCollision: (other: Entity | BlockType, started: boolean) => {
                              if (started && other instanceof PlayerEntity && other.player) {
                                  handleNpcInteraction(world, other.player, npcEntity.id);
                              }
                          }
                      }
                  ]
              }
          });
          const spawnPos = new Vector3(config.pos.x, config.pos.y, config.pos.z);
          npcEntity.spawn(world, spawnPos);
          if (npcEntity.id !== undefined) {
              npcs.set(npcEntity.id, { type: config.type, dataId: config.dataId });
              console.log(`Spawned ${config.type} NPC: ${config.name} (ID: ${npcEntity.id}) at ${spawnPos.x},${spawnPos.y},${spawnPos.z}`);
          } else { console.error(`Failed to get ID for spawned NPC: ${config.name}`); }
      };
      spawnNpc({ model: 'models/players/robot1.gltf', scale: 1, pos: { x: 5, y: 1, z: -5 }, type: 'knowledge', dataId: 'lesson1', name: 'InfoSkeleton' });
      spawnNpc({ model: 'models/players/robot1.gltf', scale: 1, pos: { x: -5, y: 1, z: -5 }, type: 'knowledge', dataId: 'lesson2', name: 'DataBones' });
      spawnNpc({ model: 'models/npcs/mindflayer.gltf', scale: 0.4, pos: { x: 0, y: 1, z: 5 }, type: 'quiz', dataId: 'quiz1', name: 'QuizMind' });
  } catch (error) { console.error("Error during initial NPC spawning:", error); }

  // --- Player Join Logic ---
  world.on(PlayerEvent.JOINED_WORLD, async ({ player }) => {
    const playerEntity = new PlayerEntity({ player, name: player.username, modelUri: 'models/players/robocop.gltf', modelScale: 1.5 });
    playerEntity.spawn(world, DEFAULT_SPAWN_POS);
    const username = player.username;
    console.log(`Player ${username} joined.`);
    const inMemoryState: InMemoryPlayerState = {
        sats: 5, completedLessons: new Set(), completedQuizzes: new Set(),
        activeQuiz: null, isGuest: true, isAuthenticated: false,
        loggedInUsername: null, pendingQuizId: null,
        playerObject: player, lastProximityPlatformIndex: null,
    };
    playerStates.set(username, inMemoryState);
    world.chatManager.sendPlayerMessage(player, 'Welcome to the Bitcoin Learning Game!', '00FF00');
    world.chatManager.sendPlayerMessage(player, `Guest mode. Use /login <username> to save progress.`, 'FFA500');
    world.chatManager.sendPlayerMessage(player, `Balance: ${inMemoryState.sats} sats.`, 'FFFF00');
  });

  // --- Player Leave Logic ---
  world.on(PlayerEvent.LEFT_WORLD, async ({ player }) => {
    const username = player.username;
    console.log(`Player ${username} left.`);
    const playerState = playerStates.get(username);
    // No timerId to clear
    const entitiesToDespawn = world.entityManager.getPlayerEntitiesByPlayer(player);
    entitiesToDespawn.forEach(entity => { if (entity.world) entity.despawn(); });
    const finalState = playerStates.get(username);
    if (finalState) {
        finalState.playerObject = undefined; // Clear transient player object
        if (finalState.isAuthenticated && finalState.loggedInUsername) {
            const saveUsername = finalState.loggedInUsername;
            console.log(`Saving state for ${saveUsername}...`);
            try { await savePlayerData(saveUsername, finalState); }
            catch (saveError) { console.error(`Failed to save data for ${username}:`, saveError); }
        } else { console.log(`Skipping save for guest player ${username}.`); }
    } else { console.warn(`Could not find final state for ${username} to save.`); }
    playerStates.delete(username);
    console.log(`Removed in-memory state for ${username}.`);
  });

  // --- Tick Handler (Quiz Answer Detection / Proximity via Position Check) ---
  const tickIntervalMs = 250;
  const gameTickInterval = setInterval(() => {
      try {
          for (const [username, playerState] of playerStates.entries()) {
              // Check if player is in an active quiz AND player object exists
              if (playerState.activeQuiz && playerState.playerObject) {
                  const activeQuiz = playerState.activeQuiz;
                  const player = playerState.playerObject;
                  const hasAnswered = activeQuiz.answeredCurrentQuestion;

                  // --- Get Player Position ---
                  const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
                  const playerEntity = playerEntities.length > 0 ? playerEntities[0] : undefined;
                  if (!playerEntity?.position) continue;
                  const position = playerEntity.position;

                  // --- Determine Current Platform ---
                  let currentPlatformIdx = -1;
                  let currentProximityIdx = -1;
                  for (let i = 0; i < QUIZ_PLATFORM_CENTERS.length; i++) {
                      const center = QUIZ_PLATFORM_CENTERS[i];
                      if (!center) continue;
                      const dx = position.x - center.x;
                      const dz = position.z - center.z;
                      const distSq = dx * dx + dz * dz;
                      if (distSq <= PLATFORM_DETECTION_RADIUS_SQ) { currentPlatformIdx = i; }
                      if (distSq <= PROXIMITY_DETECTION_RADIUS_SQ) { currentProximityIdx = i; }
                  }

                  // --- Update Last Known Platform Index (only if not answered) ---
                  if (!hasAnswered) {
                      activeQuiz.lastPlatformIndex = currentPlatformIdx !== -1 ? currentPlatformIdx : null;
                  }

                  // --- Handle Proximity/On Platform Messages (only if not answered) ---
                  if (!hasAnswered) {
                      const platformForMessage = currentPlatformIdx !== -1 ? currentPlatformIdx : currentProximityIdx;
                      const messageType = currentPlatformIdx !== -1 ? 'ON' : 'NEAR';
                      if (platformForMessage !== -1) {
                          if (playerState.lastProximityPlatformIndex !== platformForMessage) {
                              world.chatManager.sendPlayerMessage(player, `[System] You are ${messageType} Platform ${platformForMessage + 1}.`, messageType === 'ON' ? 'FFFFFF' : '808080');
                              playerState.lastProximityPlatformIndex = platformForMessage;
                          }
                      } else { // Not near or on any platform
                          if (playerState.lastProximityPlatformIndex !== null) {
                              playerState.lastProximityPlatformIndex = null; // Clear tracker
                          }
                      }
                  } else { // Clear tracker if already answered
                      if (playerState.lastProximityPlatformIndex !== null) {
                          playerState.lastProximityPlatformIndex = null;
                      }
                  }

                  // --- Check for Timeout and Evaluate Answer ---
                  if (!hasAnswered) {
                      const timeElapsed = Date.now() - activeQuiz.questionStartTime;
                      if (timeElapsed > QUIZ_DURATION_MS) {
                          console.log(`[TickCheck] Player ${username} timed out on question ${activeQuiz.questionIndex}`);
                          activeQuiz.answeredCurrentQuestion = true; // Mark answered

                          // Define variables needed within this scope
                          const lastPlatformIdx = activeQuiz.lastPlatformIndex;
                          const quiz = quizzes.find(q => q.id === activeQuiz.quizId);
                          const questionIndex = activeQuiz.questionIndex;
                          const currentQuestion = quiz?.questions[questionIndex];
                          const correctAnswerIndex = currentQuestion?.a.findIndex(answer => answer === currentQuestion.correct);
                          let fellDown = false;

                          // --- Remove Incorrect Platforms ---
                          // Rely on try/catch inside buildPlatform helper
                          console.log(`[Timeout] Removing incorrect platforms for Q${questionIndex}. Correct is ${correctAnswerIndex}`);
                          for (let i = 0; i < QUIZ_PLATFORM_CENTERS.length; i++) {
                              if (i !== correctAnswerIndex) { // Remove if NOT the correct platform
                                  const center = QUIZ_PLATFORM_CENTERS[i];
                                  if (center) {
                                      buildPlatform(world, center, 0); // Use helper to set to air (ID 0)
                                      // Check if player fell
                                      if (lastPlatformIdx === i) {
                                          fellDown = true;
                                      }
                                  }
                              }
                          }
                          // --- End Remove Incorrect Platforms ---

                          // --- Process Result ---
                          if (lastPlatformIdx !== null && correctAnswerIndex !== undefined && lastPlatformIdx === correctAnswerIndex) {
                              // Correct at timeout
                              world.chatManager.sendPlayerMessage(player, `Time's up, but you were on the correct platform!`, '00FF00');
                              activeQuiz.score += 1;
                              askQuestion(world, player, activeQuiz.quizId, questionIndex + 1);
                          } else {
                              // Incorrect or no platform at timeout
                              let timeoutFeedback = "Time's up!";
                              if (fellDown) {
                                  timeoutFeedback += ` Platform ${lastPlatformIdx! + 1} removed! You fell!`;
                                  timeoutFeedback += ` You might need to rejoin or respawn.`;
                              } else if (lastPlatformIdx !== null) {
                                  timeoutFeedback += ` You were on the wrong platform (${lastPlatformIdx + 1}).`;
                              } else {
                                  timeoutFeedback += ` You were not on any platform.`;
                              }
                              // Always add correct answer info if available
                              if (currentQuestion && correctAnswerIndex !== undefined) {
                                  timeoutFeedback += ` Correct was Platform ${correctAnswerIndex + 1}: ${currentQuestion.correct}`;
                              }
                              world.chatManager.sendPlayerMessage(player, timeoutFeedback, 'FF0000');
                              endQuiz(world, player, activeQuiz.quizId, false, 'timeout');
                          }
                          continue; // Move to next player after processing timeout
                      }
                  } // End timeout check
              } // End if(playerState.activeQuiz...)
          } // End for loop through players
      } catch (tickError) {
          console.error("Error in game tick interval:", tickError);
      }
  }, tickIntervalMs); // END setInterval callback

  // --- Chat Command Handling ---
  world.chatManager.on(ChatEvent.BROADCAST_MESSAGE, ({ player, message }) => {
      if (!player) return;
      const username = player.username;
      const playerState = playerStates.get(username);
      if (!playerState) { console.warn(`Chat from ${username} but no state found.`); return; }

      // --- /sats Command ---
      if (message.trim() === '/sats') {
          world.chatManager.sendPlayerMessage(player, `Balance: ${playerState.sats} sats.`, 'FFFF00');
      }
      // --- /q <shortId> Command (Replaces /confirmquiz) ---
      else if (message.startsWith('/q ')) {
           const shortQuizIdArg = message.substring('/q '.length).trim();
           if (!shortQuizIdArg.startsWith('q') || shortQuizIdArg.length <= 1) {
                world.chatManager.sendPlayerMessage(player, `Invalid quiz format. Use /q q1, /q q2 etc.`, 'FFA500');
                return;
           }
           const quizId = shortQuizIdArg.replace('q', 'quiz');

           if (!playerState.pendingQuizId) { world.chatManager.sendPlayerMessage(player, 'Interact with a quiz NPC first.', 'FFA500'); return; }
           if (playerState.pendingQuizId !== quizId) {
               world.chatManager.sendPlayerMessage(player, `Command mismatch. Interact with NPC for '${playerState.pendingQuizId}' first.`, 'FF0000');
               playerState.pendingQuizId = null; playerStates.set(username, playerState); return;
           }

           playerState.pendingQuizId = null; // Clear pending state
           playerStates.set(username, playerState);

           if (playerState.activeQuiz) { world.chatManager.sendPlayerMessage(player, 'Already in a quiz!', 'FFA500'); return; }
           const quiz = quizzes.find(q => q.id === quizId);
           if (!quiz) { console.error(`[ConfirmQuiz] Quiz data not found: ${quizId}`); world.chatManager.sendPlayerMessage(player, `[System]: Error finding quiz data for ${quizId}.`, 'FF0000'); return; }
           if (playerState.sats < quiz.cost) { world.chatManager.sendPlayerMessage(player, `Insufficient sats. Cost: ${quiz.cost}, Have: ${playerState.sats}.`, 'FF0000'); return; }

           if (updateSats(username, -quiz.cost)) {
               world.chatManager.sendPlayerMessage(player, `Quiz "${quiz.topic}" confirmed! Cost: ${quiz.cost} sats. Balance: ${playerState.sats} sats.`, '00FF00');
               // Initialize activeQuiz state correctly
               playerState.activeQuiz = {
                   quizId: quizId, questionIndex: -1, questionStartTime: 0,
                   answeredCurrentQuestion: true, score: 0, lastPlatformIndex: null
               };
               playerStates.set(username, playerState);
               askQuestion(world, player, quizId, 0); // Ask first question
           } else { console.error(`[ConfirmQuiz] Failed to deduct sats for ${username}.`); world.chatManager.sendPlayerMessage(player, `[System]: Error processing transaction.`, 'FF0000'); }
       }
       // --- /login Command ---
       else if (message.startsWith('/login ')) {
           const args = message.substring('/login '.length).trim().split(' ');
           if (args.length !== 1 || !args[0]) { world.chatManager.sendPlayerMessage(player, 'Usage: /login <username>', 'FFA500'); return; }
           const loginUsername = args[0];
           if (!loginUsername) { world.chatManager.sendPlayerMessage(player, 'Username cannot be empty.', 'FF0000'); return; }
           if (playerState.isAuthenticated) { world.chatManager.sendPlayerMessage(player, 'Already logged in.', 'FFA500'); return; }
           loadPlayerData(loginUsername).then(loadedData => {
               if (loadedData !== null) {
                   playerState.sats = loadedData.sats;
                   playerState.completedLessons = new Set(loadedData.completedLessons);
                   playerState.completedQuizzes = new Set(loadedData.completedQuizzes);
                   playerState.isAuthenticated = true; playerState.isGuest = false; playerState.loggedInUsername = loginUsername;
                   playerStates.set(username, playerState);
                   world.chatManager.sendPlayerMessage(player, `Login successful! Welcome back, ${loginUsername}.`, '00FF00');
                   world.chatManager.sendPlayerMessage(player, `Balance: ${playerState.sats} sats.`, 'FFFF00');
               } else {
                   playerState.isAuthenticated = true; playerState.isGuest = false; playerState.loggedInUsername = loginUsername;
                   playerState.sats = 5; playerState.completedLessons = new Set(); playerState.completedQuizzes = new Set();
                   playerStates.set(username, playerState);
                   world.chatManager.sendPlayerMessage(player, `Welcome, ${loginUsername}! New profile created. Progress will be saved.`, '00FF00');
                   world.chatManager.sendPlayerMessage(player, `Balance: ${playerState.sats} sats.`, 'FFFF00');
               }
           }).catch(loadError => { console.error(`Login Error for ${loginUsername}:`, loadError); world.chatManager.sendPlayerMessage(player, 'Error during login.', 'FF0000'); });
       }
  }); // END ChatEvent.BROADCAST_MESSAGE

  // --- Ambient Audio ---
  new Audio({ uri: 'audio/music/hytopia-main.mp3', loop: true, volume: 0.1 }).play(world);

  console.log("Bitcoin Learning Game server initialized.");

}); // END startServer