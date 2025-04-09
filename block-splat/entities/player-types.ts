export enum PlayerClass {
    RUNNER = 'Runner',
    SNIPER = 'Sniper',
    GRENADER = 'Grenader',
    SLINGSHOT = 'Slingshot'
  }
  
  export interface PlayerStats {
    class: PlayerClass
    stamina: number
    maxStamina: number
    playerDeaths: number
    playerPoints: number
    lastHitBy: string
    kills: number
    name: string
    invincible: boolean
    strengthBoostActive: boolean
  }