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
    // Button, // Removed - Not found in module
} from 'hytopia';

import worldMap from './assets/maps/payload-game-map.json';
import { initializeDatabase, loadPlayerData, savePlayerData } from './src/database';
import type { InMemoryPlayerState, Lesson, Quiz, QuizQuestion, ActiveQuizState, DbPlayerState } from './src/types';

// --- Constants ---
const DEFAULT_SPAWN_POS = new Vector3(0, 0.67, 1); // Default player spawn location
const QUIZ_DURATION_MS = 15 * 1000; // 15 seconds per question
const QUIZ_PLATFORM_Y = 0.1; // Y level slightly above ground for detection
const QUIZ_PLATFORM_CENTERS: Vector3[] = [
    new Vector3(-3, QUIZ_PLATFORM_Y, 5),   // Platform 1 (index 0) - Front Right
    new Vector3( 3, QUIZ_PLATFORM_Y, 5),   // Platform 2 (index 1) - Front Left
    new Vector3(-3, QUIZ_PLATFORM_Y, 10),  // Platform 3 (index 2) - Back Right
    new Vector3( 3, QUIZ_PLATFORM_Y, 10)   // Platform 4 (index 3) - Back Left
];
const PLATFORM_DETECTION_RADIUS_SQ = 1.5 * 1.5; // Squared radius for checking if player is 'on' a platform center (for answering)
const PROXIMITY_DETECTION_RADIUS_SQ = 2.5 * 2.5; // Larger radius for proximity feedback
const PLATFORM_BUILD_Y = 0; // Build platforms at Y=0 (adjust if ground level is different)
const PLATFORM_SIZE = 3; // Build 3x3 platforms
const QUIZ_ZONE_MIN = new Vector3(-6, -1, 2);  // Min coords for players to be included
const QUIZ_ZONE_MAX = new Vector3( 6, 5, 13);  // Max coords for players to be included

// --- Lesson & Quiz Data ---
const lessons: Lesson[] = [
    { id: 'lesson1', npcName: 'InfoBot', text: 'Bitcoin is a decentralized digital currency...', reward: 1 },
    { id: 'lesson2', npcName: 'DataBot', text: 'Transactions are recorded on a public ledger called the blockchain.', reward: 1 },
    { id: 'lesson3', npcName: 'BitBot', text: 'New bitcoins are created through mining.', reward: 1 },
    { id: 'lesson4', npcName: 'MinerMike', text: 'Bitcoin mining difficulty adjusts automatically to keep block creation time around 10 minutes.', reward: 1 },
    { id: 'lesson5', npcName: 'WalletWendy', text: 'A Bitcoin wallet stores your private keys, allowing you to send and receive bitcoins.', reward: 1 },
    { id: 'lesson6', npcName: 'KeyKeeper', text: 'Your public key is like your bank account number (shareable), while your private key is like your password (keep secret!).', reward: 1 },
    { id: 'lesson7', npcName: 'AltcoinAlice', text: 'Altcoins are cryptocurrencies other than Bitcoin, like Ethereum or Solana.', reward: 1 },
    { id: 'lesson8', npcName: 'RiskyRick', text: 'Cryptocurrencies can be volatile and risky investments. Never invest more than you can afford to lose.', reward: 1 },
];
const quizzes: Quiz[] = [
    {
        id: 'quiz1', npcName: 'QuizMind', topic: 'Bitcoin Basics', cost: 1, reward: 10,
        questions: [
            { q: 'What is Bitcoin primarily known as?', a: ['A physical coin', 'A decentralized digital currency', 'A government-backed asset', 'A paper gold certificate'], correct: 'A decentralized digital currency' },
            { q: 'What is the maximum supply of Bitcoin?', a: ['100 Million', 'Unlimited', '21 Million', '100'], correct: '21 Million' },
            { q: 'What technology underlies Bitcoin transactions?', a: ['Database', 'Blockchain', 'Spreadsheet', 'Barter'], correct: 'Blockchain' }
        ]
    },
    {
        id: 'quiz2', npcName: 'QuizMind', topic: 'Blockchain Fundamentals', cost: 2, reward: 10,
        questions: [
            { q: 'What is a block in a blockchain?', a: ['A type of cryptocurrency', 'A collection of transactions', 'A mining computer', 'A famous bitcoiner'], correct: 'A collection of transactions' },
            { q: 'How are blocks linked together?', a: ['Through cryptographic hashes', 'With physical chains', 'By email', 'SQL'], correct: 'Through cryptographic hashes' },
            { q: 'Which of these is an essential property of good money?', a: ['Tastiness', 'Shininess', 'Popularity', 'Scarcity'], correct: 'Scarcity' }
        ]
    },
];

// --- State Management ---
const playerStates = new Map<string, InMemoryPlayerState>(); // Key: player.username

// --- NPC Management ---
interface NpcInfo { type: 'knowledge' | 'quiz'; dataId: string; position: Vector3; } // Added position
const npcs = new Map<number, NpcInfo>(); // Key: Entity ID

// --- Global Multiplayer Quiz State ---
interface MultiplayerQuizParticipant {
    player: Player;
    status: 'playing' | 'correct' | 'out';
}
let currentMultiplayerQuiz: {
    quizId: string;
    questionIndex: number;
    questionStartTime: number;
    participants: Map<string, MultiplayerQuizParticipant>;
    questionEndTime?: number | null;
} | null = null;


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

function buildPlatform(world: World, center: Vector3, blockTypeId: number): boolean {
    const halfSize = Math.floor(PLATFORM_SIZE / 2);
    const minX = Math.floor(center.x - halfSize); const maxX = Math.floor(center.x + halfSize);
    const minZ = Math.floor(center.z - halfSize); const maxZ = Math.floor(center.z + halfSize);
    let success = true;
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            try {
                // Assume world.chunkLattice exists and setBlock works
                world.chunkLattice.setBlock({ x, y: PLATFORM_BUILD_Y, z }, blockTypeId);
            }
            catch (e) {
                console.error(`Error setting block at ${x},${PLATFORM_BUILD_Y},${z} (ID: ${blockTypeId}):`, e);
                if (e instanceof TypeError && (e.message.includes('setBlock') || e.message.includes('chunkLattice'))) {
                    console.error("SDK Error: world.chunkLattice.setBlock might be missing or incorrect. Stopping platform build.");
                    success = false; break;
                }
            }
        }
        if (!success) break;
    }
    return success;
}

// --- Quiz Logic Functions ---
// These functions rely on 'world' being available in their call scope (passed from handlers inside startServer)
function askQuestion(world: World, player: Player, quizId: string, questionIndex: number) {
    const quiz = quizzes.find(q => q.id === quizId);

    // Check global state exists and matches
    if (!currentMultiplayerQuiz || currentMultiplayerQuiz.quizId !== quizId || !quiz) {
        console.error(`askQuestion error: Quiz not found (${quizId}) or no active/matching multiplayer quiz.`);
        currentMultiplayerQuiz = null;
        return;
    }

    // --- Rebuild platforms before asking ---
    const platformBlockTypeIds = [23, 24, 25, 26]; // Example IDs
    console.log(`[askQuestion] Rebuilding platforms for Q${questionIndex}`);
    let buildSuccess = true;
    QUIZ_PLATFORM_CENTERS.forEach((center, index) => {
        if (buildSuccess) {
            const blockTypeId = platformBlockTypeIds[index % platformBlockTypeIds.length] || 1;
            if (!buildPlatform(world, center, blockTypeId)) { buildSuccess = false; }
        }
    });
    if (!buildSuccess) { console.error("Platform rebuild failed. Quiz may be unplayable."); }
    // --- End Rebuild ---

    // Check if questionIndex is valid BEFORE processing
    const question = quiz.questions[questionIndex];
    if (!question) {
        console.warn(`[askQuestion] Called with invalid questionIndex ${questionIndex} for quiz ${quizId}. Quiz should have ended.`);
        // Ensure global state is cleared if somehow missed
        if (currentMultiplayerQuiz?.quizId === quizId) { currentMultiplayerQuiz = null; }
        return;
    }

    // Update global quiz state
    currentMultiplayerQuiz.questionIndex = questionIndex;
    currentMultiplayerQuiz.questionStartTime = Date.now();
    currentMultiplayerQuiz.questionEndTime = null;

    // Update state and send messages for all active participants
    currentMultiplayerQuiz.participants.forEach(participant => {
        const pState = playerStates.get(participant.player.username);
        // Ensure player is still meant to be in this quiz and update their state
        if (pState?.activeQuiz?.quizId === quizId) {
            pState.activeQuiz.questionIndex = questionIndex;
            // Ensure currentMultiplayerQuiz is not null before accessing property
            if (currentMultiplayerQuiz) {
                 pState.activeQuiz.questionStartTime = currentMultiplayerQuiz.questionStartTime;
            } else {
                 console.error("[askQuestion] currentMultiplayerQuiz became null unexpectedly during participant loop.");
                 return; // Skip this participant if global state vanished
            }
            pState.activeQuiz.answeredCurrentQuestion = false;
            pState.activeQuiz.lastPlatformIndex = null;
            pState.lastProximityPlatformIndex = null;
            playerStates.set(participant.player.username, pState);

            // Send initial time to UI
            const initialSeconds = Math.ceil(QUIZ_DURATION_MS / 1000);
            participant.player.ui.sendData({
                remainingTime: initialSeconds,
                questionText: question.q,
                answers: question.a, // Add answers array
                showQuiz: true // Explicitly show quiz UI elements
            });

            // Send messages
            if (questionIndex === 0) {
                 world.chatManager.sendPlayerMessage(participant.player, `--- Starting Quiz: ${quiz.topic} ---`, 'FFFFFF');
            }
            world.chatManager.sendPlayerMessage(participant.player, `--- Question ${questionIndex + 1}/${quiz.questions.length} ---`, 'FFFFFF');
            world.chatManager.sendPlayerMessage(participant.player, `${question.q}`, 'FFFFFF');
            world.chatManager.sendPlayerMessage(participant.player, `-------------------------`, 'FFFFFF');
            if (question.a.length > QUIZ_PLATFORM_CENTERS.length) {
                 console.error(`Quiz ${quizId} Q${questionIndex}: ${question.a.length} answers > ${QUIZ_PLATFORM_CENTERS.length} platforms.`);
                 world.chatManager.sendPlayerMessage(participant.player, `[System]: Error loading answers. Ending quiz.`, 'FF0000');
                 endQuiz(world, participant.player, quizId, false, 'error');
            } else {
                const locationHints = ["(Front-Right)", "(Front-Left)", "(Back-Right)", "(Back-Left)"];
                question.a.forEach((ans, index) => {
                    const hint = locationHints[index] || "";
                    world.chatManager.sendPlayerMessage(participant.player, `Platform ${index + 1} ${hint}: ${ans}`, 'ADD8E6');
                });
                world.chatManager.sendPlayerMessage(participant.player, `Stand on the correct platform! Time ends in ${QUIZ_DURATION_MS / 1000} seconds!`, 'FFFF00');
            }
        } else {
            console.warn(`Removing ${participant.player.username} from quiz ${quizId} due to state mismatch.`);
            currentMultiplayerQuiz?.participants.delete(participant.player.username);
        }
    });

    if (currentMultiplayerQuiz?.participants.size === 0) {
        console.log("No participants left in quiz after starting question. Ending global quiz.");
        currentMultiplayerQuiz = null;
    }
} // End askQuestion

// Must be called within startServer scope
function endQuiz(world: World, player: Player, quizId: string, won: boolean, reason: 'correct' | 'incorrect' | 'timeout' | 'error' = 'error') {
    const username = player.username;
    const playerState = playerStates.get(username);
    const quiz = quizzes.find(q => q.id === quizId);

    if (!playerState) {
        console.warn(`endQuiz called for ${username} but player state not found.`);
        return;
    }

    // Only clear activeQuiz if it matches the ended quizId
    if (playerState.activeQuiz && playerState.activeQuiz.quizId === quizId) {
        const lastPlatformIdx = playerState.activeQuiz.lastPlatformIndex;
        playerState.activeQuiz = null;
        playerState.lastProximityPlatformIndex = null;
        playerStates.set(username, playerState);
        player.ui.sendData({ showQuiz: false }); // Hide both quiz UIs

        if (won) {
            // playerState.completedQuizzes.add(quizId); // Removed to allow repeats
            const reward = quiz?.reward ?? 10;
            if (updateSats(username, reward)) {
                world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! +${reward} sats. Balance: ${playerState.sats} sats.`, '00FF00');
            } else {
                 world.chatManager.sendPlayerMessage(player, `Quiz "${quiz?.topic || quizId}" Complete! Failed to award sats.`, 'FF0000');
            }
            // playerStates.set(username, playerState); // State already updated
        } else {
            let failMsg = `Quiz "${quiz?.topic || quizId}" Failed.`;
            if (reason === 'error') { failMsg += ` Ended due to an issue.`; }
            else if (reason === 'timeout') {
                failMsg += ` Time ran out`;
                if (lastPlatformIdx !== null) { failMsg += ` while on Platform ${lastPlatformIdx + 1}.`; }
                else { failMsg += ` while not on any platform.`; }
            }
            failMsg += ` Cost: ${quiz?.cost || '?'} sats.`;
            console.log(`Quiz ended for ${username}. Reason: ${reason}. Won: ${won}`);
            // Send the final summary message only if reason is NOT 'incorrect' (tick handler sends specific incorrect msg)
            if (reason !== 'incorrect') {
                 world.chatManager.sendPlayerMessage(player, failMsg, 'FF0000');
            }
        }
    } else {
         console.warn(`endQuiz called for ${username} quiz ${quizId}, but they were not active in it.`);
    }

    // Check if this player was the last one playing in the global quiz
    if (currentMultiplayerQuiz?.quizId === quizId) {
        currentMultiplayerQuiz.participants.delete(username); // Remove player regardless of win/loss
        if (currentMultiplayerQuiz.participants.size === 0) {
            console.log(`Last participant (${username}) finished quiz ${quizId}. Clearing global quiz state.`);
            currentMultiplayerQuiz = null;
        }
    }
}

// Must be called within startServer scope
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
        if (!lesson) {
            console.error(`Knowledge NPC ${npcEntityId} has invalid dataId: ${npcInfo.dataId}`);
            return; // Exit early if lesson data is bad
        }

        if (playerState.showingKnowledgeNpcId === npcEntityId) {
            // Currently showing this NPC's lesson, hide it
            player.ui.sendData({ type: 'hideKnowledge' });
            playerState.showingKnowledgeNpcId = null;
            console.log(`Player ${username} hid knowledge UI for NPC ${npcEntityId}`);
            playerStates.set(username, playerState); // Update state
        } else {
            // Show this NPC's lesson (or switch from another)
            player.ui.sendData({ type: 'showKnowledge', text: lesson.text, npcName: lesson.npcName });
            playerState.showingKnowledgeNpcId = npcEntityId;
            console.log(`Player ${username} showed knowledge UI for NPC ${npcEntityId}`);

            // Award sats/mark complete only when initially showing the lesson text
            if (!playerState.completedLessons.has(lesson.id)) {
                playerState.completedLessons.add(lesson.id);
                const reward = lesson.reward;
                if (updateSats(username, reward)) {
                    world.chatManager.sendPlayerMessage(player, `+${reward} Sat! Lesson complete. Balance: ${playerState.sats} sats.`, '00FF00');
                } else {
                    world.chatManager.sendPlayerMessage(player, `Lesson complete, failed to update sats.`, 'FF0000');
                }
            }
            // No "already learned" message needed here, UI just shows again.

            playerStates.set(username, playerState); // Update state (covers showingKnowledgeNpcId and completedLessons)
        }
    } else if (npcInfo.type === 'quiz') {
        // Ensure playerState is defined here as well (redundant check based on function start, but safe)
        if (!playerState) { console.error(`Player state lost before quiz check for ${username}.`); return; }

        if (currentMultiplayerQuiz || playerState.activeQuiz) {
             console.log(`Player ${username} interacted with quiz NPC while a quiz is active.`);
             // Keep chat message for active quiz conflict
             world.chatManager.sendPlayerMessage(player, `[Quiz Master]: A quiz is already in progress!`, 'FFA500');
             // Also hide any potentially open prompt UI
             if (playerState.showingQuizPromptNpcId !== null) {
                 player.ui.sendData({ type: 'hideQuizPrompt' });
                 playerState.showingQuizPromptNpcId = null;
                 playerStates.set(username, playerState); // Update state
             }
             return;
        }

        const quiz = quizzes.find(q => q.id === npcInfo.dataId);
        if (!quiz) {
            console.error(`Quiz NPC ${npcEntityId} has invalid dataId: ${npcInfo.dataId}`);
            return; // Exit if quiz data is bad
        }

        if (playerState.showingQuizPromptNpcId === npcEntityId) {
            // Currently showing this NPC's prompt, hide it
            player.ui.sendData({ type: 'hideQuizPrompt' });
            playerState.showingQuizPromptNpcId = null;
            console.log(`Player ${username} hid quiz prompt UI for NPC ${npcEntityId}`);
            playerStates.set(username, playerState); // Update state
        } else {
            // Show this NPC's prompt (or switch from another)
            player.ui.sendData({
                type: 'showQuizPrompt',
                npcName: quiz.npcName,
                topic: quiz.topic,
                cost: quiz.cost,
                quizId: quiz.id // Send quizId for instructions
            });
            playerState.showingQuizPromptNpcId = npcEntityId;
            // Also hide knowledge UI if it was open
            if (playerState.showingKnowledgeNpcId !== null) {
                 player.ui.sendData({ type: 'hideKnowledge' });
                 playerState.showingKnowledgeNpcId = null;
            }
            console.log(`Player ${username} showed quiz prompt UI for NPC ${npcEntityId}`);
            playerStates.set(username, playerState); // Update state
        }
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
  const platformBlockTypeIds = [23, 24, 25, 26]; // refer maps/boilerplate.json for IDs
  let canBuildPlatforms = true;
  QUIZ_PLATFORM_CENTERS.forEach((center, index) => {
      if (canBuildPlatforms) {
          const blockTypeId = platformBlockTypeIds[index % platformBlockTypeIds.length] || 1;
          if (!buildPlatform(world, center, blockTypeId)) { // Pass world
              canBuildPlatforms = false;
          } else {
              console.log(`Built platform ${index} with block ID ${blockTypeId} around ${center.x},${PLATFORM_BUILD_Y},${center.z}`);
          }
      }
  });
  if (!canBuildPlatforms) { console.error("Platform building failed. Ensure world.chunkLattice.setBlock exists and works."); }

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
                                  handleNpcInteraction(world, other.player, npcEntity.id); // Pass world
                              }
                          }
                      }
                  ]
              }
          });
          const spawnPos = new Vector3(config.pos.x, config.pos.y, config.pos.z);
          npcEntity.spawn(world, spawnPos);
          if (npcEntity.id !== undefined) {
              // Store the position along with other info
              npcs.set(npcEntity.id, { type: config.type, dataId: config.dataId, position: spawnPos });
              console.log(`Spawned ${config.type} NPC: ${config.name} (ID: ${npcEntity.id}) at ${spawnPos.x},${spawnPos.y},${spawnPos.z}`);
          } else { console.error(`Failed to get ID for spawned NPC: ${config.name}`); }
      };
      //spawnNpc({ model: 'models/players/robot1.gltf', scale: 1, pos: { x: 5, y: 1.65, z: -5 }, type: 'knowledge', dataId: 'lesson1', name: 'InfoBot' });
      spawnNpc({ model: 'models/npcs/mindflayer.gltf', scale: 0.4, pos: { x: 5, y: 1.9, z: -5 }, type: 'knowledge', dataId: 'lesson1', name: 'InfoBot' });
      spawnNpc({ model: 'models/npcs/squid.gltf', scale: 0.4, pos: { x: -5, y: 1.65, z: -5 }, type: 'knowledge', dataId: 'lesson2', name: 'DataBot' });
      spawnNpc({ model: 'models/npcs/skeleton.gltf', scale: 0.4, pos: { x: -7, y: 1.6, z: 12 }, type: 'knowledge', dataId: 'lesson3', name: 'BitBot' });
      spawnNpc({ model: 'models/players/robocop.gltf', scale: 1.5, pos: { x: 0, y: 1.65, z: 5 }, type: 'quiz', dataId: 'quiz1', name: 'QuizMind' });
      spawnNpc({ model: 'models/npcs/stalker.gltf', scale: 0.4, pos: { x: 10, y: 1.55, z: 10 }, type: 'knowledge', dataId: 'lesson4', name: 'MinerMike' });
      spawnNpc({ model: 'models/npcs/ripper-boss.gltf', scale: 0.4, pos: { x: -10, y: 1.8, z: 10 }, type: 'knowledge', dataId: 'lesson5', name: 'WalletWendy' });
      spawnNpc({ model: 'models/players/robot1.gltf', scale: 1, pos: { x: 10, y: 1.65, z: -10 }, type: 'knowledge', dataId: 'lesson6', name: 'KeyKeeper' });
      spawnNpc({ model: 'models/players/player-with-gun.gltf', scale: 0.4, pos: { x: -10, y: 1.55, z: -10 }, type: 'knowledge', dataId: 'lesson7', name: 'AltcoinAlice' });
      spawnNpc({ model: 'models/npcs/zombie.gltf', scale: 0.4, pos: { x: 3, y: 1.55, z: 25 }, type: 'knowledge', dataId: 'lesson8', name: 'RiskyRick' });
  } catch (error) { console.error("Error during initial NPC spawning:", error); }

  // --- Player Join Logic ---
  world.on(PlayerEvent.JOINED_WORLD, async ({ player }) => {
    const playerEntity = new PlayerEntity({ player, name: player.username, modelUri: 'models/players/player.gltf', modelScale: 0.5 });
    playerEntity.spawn(world, DEFAULT_SPAWN_POS);
    const username = player.username;
    console.log(`Player ${username} joined.`);
    const inMemoryState: InMemoryPlayerState = {
        sats: 5, completedLessons: new Set(), completedQuizzes: new Set(),
        activeQuiz: null, isGuest: true, isAuthenticated: false,
        loggedInUsername: null, pendingQuizId: null,
        playerObject: player, lastProximityPlatformIndex: null,
        showingKnowledgeNpcId: null,
        showingQuizPromptNpcId: null, // Initialize the new state property
    };
    playerStates.set(username, inMemoryState);

    // Load Mobile Controls UI
    player.ui.load('ui/game-ui.html'); // Load consolidated game UI
    world.chatManager.sendPlayerMessage(player, 'Welcome to the Bitcoin Learning Game!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Use WASD to move around.');
    world.chatManager.sendPlayerMessage(player, 'Press space to jump.');
    world.chatManager.sendPlayerMessage(player, 'Hold shift to sprint.');
    world.chatManager.sendPlayerMessage(player, `Guest mode. Use /login <username> to save progress.`, 'FFA500');
    world.chatManager.sendPlayerMessage(player, `Balance: ${inMemoryState.sats} sats.`, 'FFFF00');

    // Removed UI message listener for 'start_music' as client-side sending failed.
  });

  // --- Player Leave Logic ---
  world.on(PlayerEvent.LEFT_WORLD, async ({ player }) => {
    const username = player.username;
    console.log(`Player ${username} left.`);
    const playerState = playerStates.get(username);
    player.ui.sendData({ showQuiz: false }); // Attempt to hide both quiz UIs on leave
    if (currentMultiplayerQuiz && currentMultiplayerQuiz.participants.has(username)) {
        currentMultiplayerQuiz.participants.delete(username);
        console.log(`Removed ${username} from active multiplayer quiz.`);
        if (currentMultiplayerQuiz.participants.size === 0) {
            console.log(`Last participant left quiz ${currentMultiplayerQuiz.quizId}. Clearing global quiz state.`);
            currentMultiplayerQuiz = null;
        }
    }
    const entitiesToDespawn = world.entityManager.getPlayerEntitiesByPlayer(player);
    entitiesToDespawn.forEach(entity => { if (entity.world) entity.despawn(); });
    const finalState = playerStates.get(username);
    if (finalState) {
        finalState.playerObject = undefined;
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

  // --- Tick Handler (Multiplayer Quiz Logic) ---
  const tickIntervalMs = 250;
  const gameTickInterval = setInterval(() => {
      try {
          const now = Date.now(); // Define 'now' once for the tick
          const HIDE_DISTANCE_THRESHOLD_SQ = 3.0 * 3.0; // Hide if > 3 units away (squared)

          // --- Knowledge UI Distance Check ---
          playerStates.forEach((playerState, username) => {
              // Ensure showingKnowledgeNpcId is a number before proceeding
              if (typeof playerState.showingKnowledgeNpcId === 'number') {
                  const currentNpcId = playerState.showingKnowledgeNpcId; // Use a new const for clarity
                  const player = playerState.playerObject; // Get player object from state
                  const npcInfo = npcs.get(currentNpcId); // Use the guaranteed number

                  // Skip if player object or NPC info is missing for this tick
                  if (!player || !npcInfo) return;

                  const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
                  const playerEntity = playerEntities.length > 0 ? playerEntities[0] : undefined;

                  // Skip if player entity or position is missing for this tick
                  if (playerEntity?.position) {
                      // Calculate horizontal distance squared manually
                      const dx = playerEntity.position.x - npcInfo.position.x;
                      const dz = playerEntity.position.z - npcInfo.position.z;
                      const distSq = dx * dx + dz * dz; // Horizontal distance squared
                      if (distSq > HIDE_DISTANCE_THRESHOLD_SQ) {
                          console.log(`[TickCheck] Player ${username} moved too far from NPC ${currentNpcId}. Hiding knowledge UI. DistSq: ${distSq.toFixed(2)}`);
                          player.ui.sendData({ type: 'hideKnowledge' });
                          playerState.showingKnowledgeNpcId = null;
                          // No need to call playerStates.set here, modifying object in map iteration
                      }
                  }
              }

              // --- Quiz Prompt UI Distance Check ---
              if (typeof playerState.showingQuizPromptNpcId === 'number') {
                  const currentNpcId = playerState.showingQuizPromptNpcId;
                  const player = playerState.playerObject;
                  const npcInfo = npcs.get(currentNpcId);

                  if (player && npcInfo) { // Check if player and npcInfo exist
                      const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
                      const playerEntity = playerEntities.length > 0 ? playerEntities[0] : undefined;

                      if (playerEntity?.position) {
                          const dx = playerEntity.position.x - npcInfo.position.x;
                          const dz = playerEntity.position.z - npcInfo.position.z;
                          const distSq = dx * dx + dz * dz;
                          if (distSq > HIDE_DISTANCE_THRESHOLD_SQ) {
                              console.log(`[TickCheck] Player ${username} moved too far from NPC ${currentNpcId}. Hiding quiz prompt UI. DistSq: ${distSq.toFixed(2)}`);
                              player.ui.sendData({ type: 'hideQuizPrompt' });
                              playerState.showingQuizPromptNpcId = null;
                              // No need to call playerStates.set here
                          }
                      }
                  }
              }
          });

          // --- Multiplayer Quiz Logic (Existing) ---
          if (!currentMultiplayerQuiz) return; // Existing quiz logic starts here
// Remove the redeclaration of 'now' as it's defined at the start of the try block
// const now = Date.now();
          // Remove duplicate declaration from line 501
          const activeQuizId = currentMultiplayerQuiz.quizId;
          const activeQuestionIndex = currentMultiplayerQuiz.questionIndex;
          const questionStartTime = currentMultiplayerQuiz.questionStartTime;
          const participantsMap = currentMultiplayerQuiz.participants;

          if (currentMultiplayerQuiz.questionEndTime !== null) { return; } // Timeout already processed

          // --- Process each participant's position/proximity/timer ---
          participantsMap.forEach((participant, username) => {
              const player = participant.player;
              const playerState = playerStates.get(username);

              if (!playerState || !playerState.activeQuiz || playerState.activeQuiz.quizId !== activeQuizId || participant.status !== 'playing' || playerState.activeQuiz.answeredCurrentQuestion) {
                  return;
              }

              const hasAnswered = playerState.activeQuiz.answeredCurrentQuestion; // Should be false here

              const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
              const playerEntity = playerEntities.length > 0 ? playerEntities[0] : undefined;
              if (!playerEntity?.position) return;
              const position = playerEntity.position;

              let currentPlatformIdx = -1;
              let currentProximityIdx = -1;
              for (let i = 0; i < QUIZ_PLATFORM_CENTERS.length; i++) {
                  const center = QUIZ_PLATFORM_CENTERS[i];
                  if (!center) continue;
                  const dx = position.x - center.x; const dz = position.z - center.z;
                  const distSq = dx * dx + dz * dz;
                  if (distSq <= PLATFORM_DETECTION_RADIUS_SQ) { currentPlatformIdx = i; }
                  if (distSq <= PROXIMITY_DETECTION_RADIUS_SQ) { currentProximityIdx = i; }
              }

              playerState.activeQuiz.lastPlatformIndex = currentPlatformIdx !== -1 ? currentPlatformIdx : null;

              const platformForMessage = currentPlatformIdx !== -1 ? currentPlatformIdx : currentProximityIdx;
              const messageType = currentPlatformIdx !== -1 ? 'ON' : 'NEAR';
              if (platformForMessage !== -1) {
                  if (playerState.lastProximityPlatformIndex !== platformForMessage) {
                      world.chatManager.sendPlayerMessage(player, `[System] You are ${messageType} Platform ${platformForMessage + 1}.`, messageType === 'ON' ? 'FFFFFF' : '808080');
                      playerState.lastProximityPlatformIndex = platformForMessage;
                  }
              } else { if (playerState.lastProximityPlatformIndex !== null) { playerState.lastProximityPlatformIndex = null; } }

              // Send time updates to UI on every tick
              const timeElapsed = now - questionStartTime;
              const remainingSeconds = Math.max(0, Math.ceil((QUIZ_DURATION_MS - timeElapsed) / 1000));
              player.ui.sendData({ remainingTime: remainingSeconds });
          }); // End participant loop

          // --- Check for Timeout ---
          const timeElapsed = now - questionStartTime;
          if (timeElapsed > QUIZ_DURATION_MS) {
              console.log(`[TickCheck] Timeout occurred for question ${activeQuestionIndex}`);
              currentMultiplayerQuiz.questionEndTime = now; // Mark timeout processed

              const quiz = quizzes.find(q => q.id === activeQuizId);
              const currentQuestion = quiz?.questions[activeQuestionIndex];
              const correctAnswerIndex = currentQuestion?.a.findIndex(answer => answer === currentQuestion.correct);

              let anyoneCorrect = false;
              let playersToAdvance: Player[] = [];

              // Evaluate all participants who were still 'playing'
              participantsMap.forEach((participant, username) => {
                  if (participant.status === 'playing') {
                      const playerState = playerStates.get(username);
                      if (playerState?.activeQuiz) {
                           playerState.activeQuiz.answeredCurrentQuestion = true;
                           const lastPlatformIdx = playerState.activeQuiz.lastPlatformIndex;
                           let fellDown = false; // Track if player fell this round

                           if (lastPlatformIdx !== null && correctAnswerIndex !== undefined && lastPlatformIdx === correctAnswerIndex) {
                               participant.status = 'correct'; anyoneCorrect = true; playersToAdvance.push(participant.player);
                               world.chatManager.sendPlayerMessage(participant.player, `Time's up - Correct!`, '00FF00');
                               playerState.activeQuiz.score += 1;
                           } else {
                               participant.status = 'out';
                               let timeoutFeedback = "Time's up!";
                               if (lastPlatformIdx !== null && lastPlatformIdx !== correctAnswerIndex) { fellDown = true; }

                               if (fellDown) {
                                   timeoutFeedback += ` Platform ${lastPlatformIdx! + 1} removed! You fell!`;
                                   timeoutFeedback += ` You might need to rejoin or respawn.`;
                               } else if (lastPlatformIdx !== null) { timeoutFeedback += ` You were on the wrong platform (${lastPlatformIdx + 1}).`; }
                               else { timeoutFeedback += ` You were not on any platform.`; }
                               if (currentQuestion && correctAnswerIndex !== undefined) { timeoutFeedback += ` Correct was Platform ${correctAnswerIndex + 1}: ${currentQuestion.correct}`; }
                               world.chatManager.sendPlayerMessage(participant.player, timeoutFeedback, 'FF0000');
                               endQuiz(world, participant.player, activeQuizId, false, 'timeout');
                           }
                      } else { participant.status = 'out'; }
                  }
              });

              // --- Remove Incorrect Platforms ---
              console.log(`[Timeout] Removing incorrect platforms for Q${activeQuestionIndex}. Correct is ${correctAnswerIndex}`);
              let buildErrorOccurred = false;
              for (let i = 0; i < QUIZ_PLATFORM_CENTERS.length; i++) {
                  if (i !== correctAnswerIndex) {
                      const center = QUIZ_PLATFORM_CENTERS[i];
                      if (center) {
                          if (!buildPlatform(world, center, 0)) { // Set to air
                              buildErrorOccurred = true; break;
                          }
                      }
                  }
              }
              // --- End Remove Incorrect Platforms ---

              // --- Decide Next Step ---
              const nextQuestionIndex = activeQuestionIndex + 1;
              const isQuizComplete = nextQuestionIndex >= (quiz?.questions.length || 0);

              if (anyoneCorrect) {
                  if (isQuizComplete) {
                      // Quiz is fully complete and won!
                      console.log(`Quiz ${activeQuizId} won by remaining players.`);
                      participantsMap.forEach((p, uname) => {
                          if (p.status === 'correct') {
                              endQuiz(world, p.player, activeQuizId, true, 'correct'); // Call endQuiz with won=true
                          }
                      });
                      currentMultiplayerQuiz = null; // Clear global state
                  } else {
                      // Advance only correct players to the next question
                      currentMultiplayerQuiz.participants.forEach((p, uname) => {
                          if (p.status !== 'correct') { currentMultiplayerQuiz!.participants.delete(uname); }
                          else { p.status = 'playing'; }
                      });
                      if (currentMultiplayerQuiz.participants.size > 0) {
                          setTimeout(() => {
                              if (currentMultiplayerQuiz) {
                                 const nextPlayer = currentMultiplayerQuiz.participants.values().next().value?.player;
                                 if (nextPlayer) { askQuestion(world, nextPlayer, activeQuizId, nextQuestionIndex); }
                                 else { console.error("Error: No participants left to ask next question."); currentMultiplayerQuiz = null; }
                              }
                          }, 1000); // Delay for platform removal visual
                      } else { console.log("All players eliminated. Ending quiz."); currentMultiplayerQuiz = null; } // Changed from Error log
                  }
              } else {
                  // No one was correct, end the quiz for everyone who was playing
                  console.log(`No one answered Q${activeQuestionIndex} correctly. Ending quiz ${activeQuizId}.`);
                  // endQuiz was already called for players who timed out incorrectly
                  currentMultiplayerQuiz = null;
              }
          } // End timeout processing block
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

      if (message.trim() === '/sats') {
          world.chatManager.sendPlayerMessage(player, `Balance: ${playerState.sats} sats.`, 'FFFF00');
      }
      else if (message.trim() === '/q') { // Handle '/q' for random quiz
          if (currentMultiplayerQuiz) { world.chatManager.sendPlayerMessage(player, `A quiz is already in progress!`, 'FFA500'); return; }
          if (quizzes.length === 0) { world.chatManager.sendPlayerMessage(player, `No quizzes available to start.`, 'FFA500'); return; }

          const randomIndex = Math.floor(Math.random() * quizzes.length);
          const randomQuiz = quizzes[randomIndex];
          if (!randomQuiz) { // Add check to satisfy TypeScript
              console.error(`[/q Command] Failed to get random quiz at index ${randomIndex} despite non-empty array.`);
              world.chatManager.sendPlayerMessage(player, `[System]: Error selecting a random quiz.`, 'FF0000');
              return;
          }
          initiateQuiz(world, randomQuiz, player); // Call the refactored function

      } else if (message.startsWith('/q ')) { // Handle '/q <id>' for specific quiz
           const shortQuizIdArg = message.substring('/q '.length).trim();
           if (!shortQuizIdArg.startsWith('q') || shortQuizIdArg.length <= 1) {
                world.chatManager.sendPlayerMessage(player, `Invalid quiz format. Use /q q1, /q q2 etc., or just /q for random.`, 'FFA500'); return;
           }
           const quizId = shortQuizIdArg.replace('q', 'quiz');
           const quiz = quizzes.find(q => q.id === quizId);
           if (!quiz) { console.error(`[/q Command] Quiz data not found: ${quizId}`); world.chatManager.sendPlayerMessage(player, `[System]: Error finding quiz data for ${quizId}.`, 'FF0000'); return; }

           initiateQuiz(world, quiz, player); // Call the refactored function
           // Removed stray brace/semicolon and leftover participant/askQuestion logic
       }
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

  /**
   * A silly little easter egg command. When a player types
   * "/rocket" in the game, they'll get launched into the air!
   */
  world.chatManager.registerCommand('/rocket', player => {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
      entity.applyImpulse({ x: 0, y: 100, z: 0 });
    });
  }); // <<< Added missing closing bracket/parenthesis for /rocket command
  
  // --- Refactored Quiz Initiation Logic ---
  function initiateQuiz(world: World, quiz: Quiz, initiatorPlayer: Player) {
      if (currentMultiplayerQuiz) { world.chatManager.sendPlayerMessage(initiatorPlayer, `A quiz is already in progress!`, 'FFA500'); return; }
  
      const quizId = quiz.id;
  
      const playersInZone: Player[] = [];
      for (const pState of playerStates.values()) {
           if (pState.playerObject) {
               const p = pState.playerObject;
               const pEntities = world.entityManager.getPlayerEntitiesByPlayer(p);
               const pEntity = pEntities.length > 0 ? pEntities[0] : undefined;
               if (pEntity?.position) {
                   const pos = pEntity.position;
                   if (pos.x >= QUIZ_ZONE_MIN.x && pos.x <= QUIZ_ZONE_MAX.x && pos.y >= QUIZ_ZONE_MIN.y && pos.y <= QUIZ_ZONE_MAX.y && pos.z >= QUIZ_ZONE_MIN.z && pos.z <= QUIZ_ZONE_MAX.z)
                   { playersInZone.push(p); }
               }
           }
      }
      if (playersInZone.length === 0) { world.chatManager.sendPlayerMessage(initiatorPlayer, `No players found in the quiz zone to start the quiz.`, 'FFA500'); return; }
  
      const participants = new Map<string, MultiplayerQuizParticipant>();
      let participantsCount = 0;
      for (const p of playersInZone) {
           const pState = playerStates.get(p.username);
           if (!pState) { console.warn(`Player ${p.username} in zone but has no state.`); continue; }
           if (pState.activeQuiz) { world.chatManager.sendPlayerMessage(p, `You can't join, you're already in a quiz!`, 'FFA500'); continue; }
           if (pState.sats < quiz.cost) { world.chatManager.sendPlayerMessage(p, `You don't have enough sats (${quiz.cost}) to join the quiz!`, 'FF0000'); continue; }
           participantsCount++;
           participants.set(p.username, { player: p, status: 'playing' });
      }
      if (participantsCount === 0) { world.chatManager.sendPlayerMessage(initiatorPlayer, `No eligible players in the zone could join the quiz.`, 'FFA500'); return; }
  
      let actualParticipantsCount = 0;
      participants.forEach(participant => {
           if (updateSats(participant.player.username, -quiz.cost)) {
               const pState = playerStates.get(participant.player.username);
               if (pState) {
                   pState.activeQuiz = {
                       quizId: quizId, questionIndex: -1, questionStartTime: 0,
                       answeredCurrentQuestion: true, score: 0, lastPlatformIndex: null,
                       lastTimerMessageSent: 0
                   };
                   playerStates.set(participant.player.username, pState);
               }
               world.chatManager.sendPlayerMessage(participant.player, `Joined quiz "${quiz.topic}"! ${quiz.cost} sats deducted.`, '00FF00');
               actualParticipantsCount++;
           } else {
               console.error(`Failed to deduct sats for ${participant.player.username} after eligibility check!`);
               world.chatManager.sendPlayerMessage(participant.player, `Error joining quiz: Could not deduct cost.`, 'FF0000');
               participants.delete(participant.player.username);
           }
      });
      if (actualParticipantsCount === 0) { console.log("Quiz start aborted, no participants after charging."); return; }
  
      participants.forEach(p => { world.chatManager.sendPlayerMessage(p.player, `Starting "${quiz.topic}" quiz for ${actualParticipantsCount} players!`, '00FF00'); });
  
      currentMultiplayerQuiz = {
           quizId: quizId, questionIndex: -1, questionStartTime: 0,
           participants: participants, questionEndTime: null
      };

      // --- Start the first question ---
      const firstParticipant = participants.values().next().value;
      if (firstParticipant) {
          askQuestion(world, firstParticipant.player, quizId, 0);
      } else {
          console.error("[initiateQuiz] Failed to get first participant to start quiz after setting up state. Aborting.");
          currentMultiplayerQuiz = null; // Clear the state if we can't start
      }
 }
  // Removed stray closing bracket here

  // --- Ambient Audio (Deferred Playback) ---
  // Revert to non-positional ambient audio
  const backgroundMusic = new Audio({
      uri: "audio/music/hytopia-main.mp3",
      loop: true,
      volume: 1.0, // Restore original volume
  });
  // Removed startBackgroundMusicOnce function and backgroundMusicStarted flag.
  // .play() is not called automatically to avoid auto-play issues.
  // Music will not play unless triggered by other game logic (currently none).
  console.log("Background music object created but not played automatically.");

  backgroundMusic.play(world); // Play the music in our world

  console.log("Bitcoin Learning Game server initialized.");

}); // END startServer