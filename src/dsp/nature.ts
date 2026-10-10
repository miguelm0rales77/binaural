/**
 * Sonidos de la naturaleza por síntesis (sin grabaciones): ruido filtrado y modulado.
 * Todos son mono, no reservan memoria en `next()` y toda la aleatoriedad sale de `rand`
 * (inyectable, para tests deterministas). Los cambios de nivel son siempre graduales:
 * no hay picos repentinos (los truenos de la tormenta tienen un ataque de 0,6–1,4 s).
 */
import { TWO_PI } from './oscillator'

export interface NatureGen {
  /** Siguiente muestra, en [-1, 1]. */
  next(): number
}

type Rand = () => number

const noise = (rand: Rand) => rand() * 2 - 1

/** Filtro paso bajo de un polo. */
class LP {
  private y = 0
  private readonly a: number
  constructor(cutHz: number, fs: number) {
    this.a = 1 - Math.exp((-TWO_PI * cutHz) / fs)
  }
  tick(x: number): number {
    this.y += this.a * (x - this.y)
    return this.y
  }
}

/** Filtro paso alto de un polo. */
class HP {
  private readonly lp: LP
  constructor(cutHz: number, fs: number) {
    this.lp = new LP(cutHz, fs)
  }
  tick(x: number): number {
    return x - this.lp.tick(x)
  }
}

/** Paso banda SVF (TPT): estable aunque se module la frecuencia; ganancia ≈ 1 en el centro. */
class BandPass {
  private ic1 = 0
  private ic2 = 0
  private readonly pi_fs: number
  constructor(fs: number) {
    this.pi_fs = Math.PI / fs
  }
  tick(x: number, fc: number, q: number): number {
    const g = Math.tan(this.pi_fs * fc)
    const k = 1 / q
    const a1 = 1 / (1 + g * (g + k))
    const a2 = g * a1
    const a3 = g * a2
    const v3 = x - this.ic2
    const v1 = a1 * this.ic1 + a2 * v3
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    return k * v1
  }
}

/** Valor aleatorio lento en [-1, 1]: salta a un objetivo nuevo unas `rateHz` veces por segundo y lo sigue suavemente. */
class SlowRandom {
  value = 0
  private target = 0
  private left = 0
  private readonly rand: Rand
  private readonly period: number
  private readonly a: number
  constructor(rand: Rand, rateHz: number, fs: number) {
    this.rand = rand
    this.period = fs / rateHz
    this.a = 1 - Math.exp(-1 / (0.5 * this.period))
  }
  tick(): number {
    if (--this.left <= 0) {
      this.target = noise(this.rand)
      this.left = this.period * (0.5 + this.rand())
    }
    this.value += this.a * (this.target - this.value)
    return this.value
  }
}

const VOICES = 24

/** Gotas: ráfagas senoidales muy breves (2–7 kHz) en un conjunto fijo de voces. */
class Drops {
  private readonly amp = new Float64Array(VOICES)
  private readonly phase = new Float64Array(VOICES)
  private readonly inc = new Float64Array(VOICES)
  private readonly rand: Rand
  private readonly fs: number
  private readonly decay: number
  private readonly prob: number
  constructor(rand: Rand, fs: number, ratePerSec: number) {
    this.rand = rand
    this.fs = fs
    this.decay = Math.exp(-1 / (0.003 * fs))
    this.prob = ratePerSec / fs
  }
  tick(): number {
    if (this.rand() < this.prob) {
      for (let v = 0; v < VOICES; v++) {
        if ((this.amp[v] as number) < 1e-3) {
          this.amp[v] = 0.25 + 0.75 * this.rand()
          this.inc[v] = (TWO_PI * (2000 + 5000 * this.rand())) / this.fs
          this.phase[v] = 0
          break
        }
      }
    }
    let s = 0
    for (let v = 0; v < VOICES; v++) {
      const a = this.amp[v] as number
      if (a < 1e-3) continue
      const p = (this.phase[v] as number) + (this.inc[v] as number)
      this.phase[v] = p
      s += a * Math.sin(p)
      this.amp[v] = a * this.decay
    }
    return s
  }
}

/** Lluvia: siseo de banda ancha con ligera variación lenta + gotas. `intensity` 0–1. */
export class RainGen implements NatureGen {
  private readonly hp: HP
  private readonly lp: LP
  private readonly slow: SlowRandom
  private readonly drops: Drops
  private readonly rand: Rand
  private readonly intensity: number
  private readonly level: number
  constructor(rand: Rand, fs: number, intensity = 0.6, level = 1) {
    this.rand = rand
    this.intensity = intensity
    this.level = level
    this.hp = new HP(900, fs)
    this.lp = new LP(9000, fs)
    this.slow = new SlowRandom(rand, 0.3, fs)
    this.drops = new Drops(rand, fs, 25 + 90 * intensity)
  }
  next(): number {
    const hiss = this.lp.tick(this.hp.tick(noise(this.rand))) * (0.8 + 0.2 * this.slow.tick())
    const x = (0.9 * (0.4 + 0.6 * this.intensity) * hiss + 0.12 * this.drops.tick()) * this.level
    return Math.tanh(x)
  }
}

/** Viento: ruido grave filtrado por un paso banda cuya frecuencia vaga lentamente, con ráfagas. */
export class WindGen implements NatureGen {
  private readonly bp: BandPass
  private readonly lp: LP
  private readonly rumble: LP
  private readonly freq: SlowRandom
  private readonly gust: SlowRandom
  private readonly rand: Rand
  private readonly level: number
  private readonly center: number
  constructor(rand: Rand, fs: number, level = 0.58, center = 400) {
    this.rand = rand
    this.level = level
    this.center = center
    this.bp = new BandPass(fs)
    this.lp = new LP(2500, fs)
    this.rumble = new LP(110, fs)
    this.freq = new SlowRandom(rand, 0.15, fs)
    this.gust = new SlowRandom(rand, 0.12, fs)
  }
  next(): number {
    const n = noise(this.rand)
    const fc = this.center * Math.pow(2, 1.2 * this.freq.tick())
    const gust = 0.55 + 0.45 * this.gust.tick() // 0,1–1
    const body = this.bp.tick(this.lp.tick(n), fc, 1.2)
    const x = (body + 9 * this.rumble.tick(n)) * gust * this.level
    return Math.tanh(x)
  }
}

/** Río: rumor de banda media constante + burbujeo (resonadores que se desplazan al azar). */
export class RiverGen implements NatureGen {
  private readonly rush: BandPass
  private readonly rushHp: HP
  private readonly bubbles: BandPass[]
  private readonly mods: SlowRandom[]
  private readonly bases = [650, 1100, 1800]
  private readonly rand: Rand
  private readonly level: number
  constructor(rand: Rand, fs: number, level = 1) {
    this.rand = rand
    this.level = level
    this.rush = new BandPass(fs)
    this.rushHp = new HP(250, fs)
    this.bubbles = this.bases.map(() => new BandPass(fs))
    this.mods = this.bases.map((_, i) => new SlowRandom(rand, 5 + 2 * i, fs))
  }
  next(): number {
    const n = noise(this.rand)
    let x = 0.9 * this.rush.tick(this.rushHp.tick(n), 1300, 0.6)
    for (let i = 0; i < 3; i++) {
      const fc = (this.bases[i] as number) * Math.pow(2, 0.7 * (this.mods[i] as SlowRandom).tick())
      x += 0.5 * (this.bubbles[i] as BandPass).tick(n, fc, 5)
    }
    return Math.tanh(x * this.level)
  }
}

/** Trueno: rumor grave con ataque suave (0,6–1,4 s) y decaimiento largo, a intervalos aleatorios. */
export class Thunder {
  private readonly lp1: LP
  private readonly lp2: LP
  private t = 0
  private attack = 0
  private tau = 1
  private amp = 0
  private active = false
  private wait: number
  private readonly rand: Rand
  private readonly fs: number
  private readonly meanIntervalSec: number
  constructor(rand: Rand, fs: number, meanIntervalSec: number) {
    this.rand = rand
    this.fs = fs
    this.meanIntervalSec = meanIntervalSec
    this.lp1 = new LP(85, fs)
    this.lp2 = new LP(140, fs)
    this.wait = this.nextWait(true)
  }
  private nextWait(first: boolean): number {
    const u = this.rand()
    const sec = first ? 8 + 10 * u : Math.min(60, Math.max(10, -Math.log(1 - u) * this.meanIntervalSec))
    return sec * this.fs
  }
  tick(): number {
    if (!this.active) {
      if (--this.wait > 0) return 0
      this.active = true
      this.t = 0
      this.attack = (0.6 + 0.8 * this.rand()) * this.fs
      this.tau = (1.5 + 1.5 * this.rand()) * this.fs
      this.amp = 0.5 + 0.5 * this.rand()
    }
    const t = this.t++
    let env: number
    if (t < this.attack) env = 0.5 - 0.5 * Math.cos((Math.PI * t) / this.attack)
    else {
      env = Math.exp(-(t - this.attack) / this.tau)
      if (env < 1e-3) {
        this.active = false
        this.wait = this.nextWait(false)
        return 0
      }
    }
    const roll = 0.75 + 0.25 * Math.sin((TWO_PI * 3.5 * t) / this.fs)
    const n = this.lp2.tick(this.lp1.tick(noise(this.rand)))
    return n * 18 * env * roll * this.amp
  }
}

/** Tormenta: lluvia intensa + viento grave + truenos suaves y espaciados. */
export class StormGen implements NatureGen {
  private readonly rain: RainGen
  private readonly wind: WindGen
  private readonly thunder: Thunder
  private readonly level: number
  constructor(rand: Rand, fs: number, level = 0.8) {
    this.rain = new RainGen(rand, fs, 1, 1)
    this.wind = new WindGen(rand, fs, 0.5, 300)
    this.thunder = new Thunder(rand, fs, 25)
    this.level = level
  }
  next(): number {
    const x = 0.75 * this.rain.next() + 0.5 * this.wind.next() + this.thunder.tick()
    return Math.tanh(x * this.level)
  }
}

/** Bosque: viento suave entre follaje + susurro de hojas en ráfagas lentas. (Sin pájaros.) */
export class ForestGen implements NatureGen {
  private readonly wind: WindGen
  private readonly hp: HP
  private readonly lp: LP
  private readonly leaf: SlowRandom
  private readonly rand: Rand
  private readonly level: number
  constructor(rand: Rand, fs: number, level = 1.6) {
    this.rand = rand
    this.level = level
    this.wind = new WindGen(rand, fs, 0.55, 260)
    this.hp = new HP(3500, fs)
    this.lp = new LP(10000, fs)
    this.leaf = new SlowRandom(rand, 0.45, fs)
  }
  next(): number {
    const l = Math.max(0, this.leaf.tick())
    const leaves = this.lp.tick(this.hp.tick(noise(this.rand))) * (0.08 + 0.92 * l * l)
    return Math.tanh((this.wind.next() * 0.9 + 0.55 * leaves) * this.level)
  }
}
