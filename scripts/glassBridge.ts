import { PlayerEntity, World, type Vector3Like } from 'hytopia'

const GLASS_BLOCK_ID = 6

const PLATFORM_WIDTH = 3
const GRID_ROWS = 2
const GRID_COLS = 10
const START_HEIGHT = 10

class GlassBridge {
  private playDuration: number
  private playerDeaths: Map<string, number>
  private faultyPlatforms: { row: number; col: number }[] = []
  private faultyBlockId: number
  private world: World
  private spawnPosition: Vector3Like
  private interval: Timer | undefined
  private players: PlayerEntity[] = []

  public activePlayer: string = ''
  public isActive: boolean

  constructor(world: World, faultyBlockId: number, spawnPosition: Vector3Like) {
    this.world = world
    this.faultyBlockId = faultyBlockId
    this.playDuration = 0
    this.playerDeaths = new Map()
    this.spawnPosition = spawnPosition
    this.loadFaultyPlatforms()
    this.loadPlatforms()
    this.isActive = false
    this.interval = undefined
  }

  addPlayer = (player: PlayerEntity) => {
    this.players.push(player)
    if (this.isActive) {
      if (!this.players.find((p) => p.player.id === this.activePlayer)) {
        this.activePlayer = player.player.id
        return
      }
      player.rawRigidBody.setEnabled(false)
      player.setPosition({ x: 0, y: 15, z: 0 })
    }
  }

  removePlayer = (id: string) => {
    this.players = this.players.filter((p) => p.player.id !== id)

    if (this.activePlayer === id) {
      this.updateActivePlayer()
    }
  }

  reset = () => {
    this.stop()
    this.players.forEach((player) => {
      player.player.ui.sendData({
        type: 'time-played',
        duration: this.playDuration
      })
      player.player.ui.sendData({ type: 'player-deaths', deaths: 0 })
      player.setPosition(this.spawnPosition)
    })

    this.loadFaultyPlatforms()
    this.loadPlatforms()
    this.play()
  }

  play = () => {
    this.isActive = true
    // choose a random player to start
    this.activePlayer =
      this.players[Math.floor(Math.random() * this.players.length)].player.id
    this.updateActivePlayer()
    if (this.interval) {
      clearInterval(this.interval)
    }
    this.playDuration = 60
    this.interval = setInterval(() => {
      this.playDuration -= 1
      for (const player of this.players) {
        player.player.ui.sendData({
          type: 'time-played',
          duration: this.playDuration
        })
      }

      if (this.playDuration === 0) {
        this.updateActivePlayer()
        this.playDuration = 60
      }
    }, 1000)
  }

  stop = () => {
    this.isActive = false
    this.playDuration = 0
    this.playerDeaths = new Map()
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
  }

  updateActivePlayer = () => {
    const index = this.players.findIndex(
      (player) => player.player.id === this.activePlayer
    )
    if (this.players.length <= 0) {
      this.stop()
      return
    }

    if (index < this.players.length - 1) {
      this.activePlayer = this.players[index + 1].player.id
    } else {
      this.activePlayer = this.players[0].player.id
    }

    this.players.forEach((player) => {
      player.player.ui.sendData({
        type: 'active-player',
        player: this.activePlayer
      })
      if (player.player.id === this.activePlayer) {
        player.setPosition(this.spawnPosition)
        if (player.rawRigidBody) {
          player.rawRigidBody.setEnabled(true)
        }
      } else {
        player.setPosition({ x: 0, y: 15, z: 0 })
        if (player.rawRigidBody) {
          player.rawRigidBody.setEnabled(false)
        }
      }
    })
  }

  onPlayerFall = (player: PlayerEntity) => {
    if (!this.isActive) {
      player.setPosition(this.spawnPosition)
    }

    this.playDuration = 60
    this.playerDeaths.set(
      player.player.id,
      (this.playerDeaths.get(player.player.id) || 0) + 1
    )
    this.loadPlatforms()
    player.player.ui.sendData({
      type: 'player-deaths',
      deaths: this.playerDeaths.get(player.player.id) || 0
    })

    // get index based on player id
    this.updateActivePlayer()
  }

  loadFaultyPlatforms = () => {
    // Generate one faulty platform per row
    this.faultyPlatforms = []
    for (let col = 0; col < GRID_COLS; col++) {
      const faultyRow = Math.floor(Math.random() * GRID_ROWS)
      this.faultyPlatforms.push({ row: faultyRow, col })
    }
  }

  private createPlatform(x: number, y: number, z: number, blockId: number) {
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        this.world.chunkLattice.setBlock(
          {
            x: x + dx,
            y,
            z: z + dz
          },
          blockId
        )
      }
    }
  }

  loadPlatforms = () => {
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const isFaulty = this.faultyPlatforms.some(
          (fp) => fp.row === row && fp.col === col
        )

        // Calculate position
        const x = col * PLATFORM_WIDTH + 4
        const y = START_HEIGHT
        const z = row * PLATFORM_WIDTH - 2

        // Create 2x2 platform with appropriate block type
        this.createPlatform(
          x,
          y,
          z,
          isFaulty ? this.faultyBlockId : GLASS_BLOCK_ID
        )
      }
    }
  }
}

export default GlassBridge
