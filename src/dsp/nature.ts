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

export const noise = (rand: Rand) => rand() * 2 - 1

/** Filtro paso bajo de un polo. */
export class LP {
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
export class HP {
  private readonly lp: LP
  constructor(cutHz: number, fs: number) {
    this.lp = new LP(cutHz, fs)
  }
  tick(x: number): number {
    return x - this.lp.tick(x)
  }
}

/** Paso banda SVF (TPT): estable aunque se module la frecuencia; ganancia ≈ 1 en el centro. */
export class BandPass {
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
export class SlowRandom {
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

const ROLLS = 4
/** Ganancias de las capas del trueno (calibradas con las medidas de los tests). */
const THUNDER_LOW = 10.5
const THUNDER_BODY = 4.4
const THUNDER_MID = 2.2
const THUNDER_CRACK = 1.05
const THUNDER_SHEET = 0.77

export interface ThunderOptions {
  /** Segundos hasta el primer trueno (por defecto 5–12 s al azar). */
  firstWaitSec?: number
  /** 0 = muy cercano (chasquido y ataque rápido), 1 = muy lejano (solo retumbo suave). Por defecto al azar. */
  distance?: number
}

/**
 * Trueno con «retumbe», como el de una hoja de latón que se ondea (thunder sheet): dura ~9–11 s, con 4
 * oleadas que suben y bajan y un temblor rápido e irregular de amplitud. Se **oscurece** al apagarse (los
 * agudos mueren primero y queda un rumor grave), como un trueno real: sin ese filtro, la cola de las capas de
 * ruido sonaba a siseo de ruido blanco. Capas:
 *  - subgrave (< ~150 Hz) para auriculares, con las oleadas;
 *  - cuerpo del retumbo (70–300 Hz) con temblor de ~6 Hz, lo que le da el «ondeo»;
 *  - retumbo medio (200–1000 Hz) para altavoces pequeños, también con temblor;
 *  - «hoja»: dos bandas metálicas (~700 y ~1700 Hz) con un aleteo rápido (~14 Hz) que se apaga antes;
 *  - chasquido de banda ancha al principio (más fuerte cuanto más cercano), con un eco.
 * El ataque es de 50 ms (cercano) a 650 ms (lejano): un trueno real no entra en silencio. Quien sea sensible
 * a los ruidos fuertes no debería usar la tormenta (la interfaz lo avisa).
 */
export class Thunder {
  private readonly lp1: LP
  private readonly lp2: LP
  private readonly bodyHp: HP
  private readonly bodyLp: LP
  private readonly midHp: HP
  private readonly midLp: LP
  private readonly crackBp: BandPass
  private readonly sheetLo: BandPass
  private readonly sheetHi: BandPass
  private dark1 = 0 // dos polos de oscurecimiento (12 dB/oct) para la cola
  private dark2 = 0
  private darkCoef = 0
  private readonly wobble: SlowRandom // temblor lento-medio (~6 Hz)
  private readonly flutter: SlowRandom // aleteo rápido (~14 Hz)
  private readonly rollT = new Float64Array(ROLLS)
  private readonly rollA = new Float64Array(ROLLS)
  private readonly rollW = new Float64Array(ROLLS)
  private t = 0
  private attack = 0 // s
  private tauLow = 1 // s
  private tauMid = 0.5 // s
  private tauSheet = 0.5 // s
  private amp = 0
  private midGain = 1
  private crackAmp = 0
  private crack2At = 0 // s
  private crack2Amp = 0
  private endAt = 0 // s: instante en que el trueno se da por terminado
  private active = false
  private wait: number
  private readonly rand: Rand
  private readonly fs: number
  private readonly invFs: number
  private readonly meanWaitSec: number
  private readonly forcedDistance: number | undefined

  /** `meanWaitSec`: media de la espera (exponencial, entre 6 y 50 s) entre el final de un trueno y el siguiente. */
  constructor(rand: Rand, fs: number, meanWaitSec: number, opts: ThunderOptions = {}) {
    this.rand = rand
    this.fs = fs
    this.invFs = 1 / fs
    this.meanWaitSec = meanWaitSec
    this.forcedDistance = opts.distance
    this.lp1 = new LP(85, fs)
    this.lp2 = new LP(140, fs)
    this.bodyHp = new HP(70, fs)
    this.bodyLp = new LP(300, fs)
    this.midHp = new HP(200, fs)
    this.midLp = new LP(1000, fs)
    this.crackBp = new BandPass(fs)
    this.sheetLo = new BandPass(fs)
    this.sheetHi = new BandPass(fs)
    this.wobble = new SlowRandom(rand, 6, fs)
    this.flutter = new SlowRandom(rand, 14, fs)
    this.wait = (opts.firstWaitSec ?? 5 + 7 * rand()) * fs
  }

  private begin(): void {
    const dist = this.forcedDistance ?? this.rand()
    this.active = true
    this.t = 0
    this.attack = 0.05 + 0.6 * dist
    this.tauLow = 2.0 + 0.6 * this.rand() // la caída de fondo es rápida: las oleadas son lo que mantiene el retumbo
    this.dark1 = 0
    this.dark2 = 0
    this.tauMid = 0.7 * this.tauLow
    this.tauSheet = 0.4 * this.tauLow
    this.amp = 0.65 + 0.35 * this.rand()
    this.midGain = 1 - 0.5 * dist
    this.crackAmp = dist < 0.75 ? 0.9 * Math.pow(1 - dist / 0.75, 1.5) : 0
    this.crack2At = 0.12 + 0.35 * this.rand()
    this.crack2Amp = 0.45 * this.crackAmp
    // oleadas irregulares repartidas por todo el retumbo (más separadas y más anchas al avanzar). Su fuerza crece
    // con el tiempo para compensar la caída de la envolvente: así las oleadas tardías se oyen y el retumbo «rueda».
    // Las oleadas se SUMAN a la caída de fondo (no la multiplican): así cada una sube y baja de verdad, con valles
    // entre ellas. Cada una es algo más débil que la anterior.
    let at = this.attack + 0.9
    for (let j = 0; j < ROLLS; j++) {
      at += 1.2 + 0.8 * this.rand()
      this.rollT[j] = at
      this.rollA[j] = (0.55 + 0.35 * this.rand()) * (1 - 0.12 * j)
      this.rollW[j] = 0.45 + 0.3 * this.rand()
    }
    this.endAt = Math.max(this.attack + 3.5 * this.tauLow, (this.rollT[ROLLS - 1] as number) + 3 * (this.rollW[ROLLS - 1] as number))
  }

  tick(): number {
    if (!this.active) {
      if (--this.wait > 0) return 0
      this.begin()
    }
    const ts = this.t++ * this.invFs
    const atk = this.attack
    // cuerpo del retumbo: subida en coseno alzado y decaimiento exponencial, modulado por las oleadas
    const baseLow = ts < atk ? 0.5 - 0.5 * Math.cos((Math.PI * ts) / atk) : Math.exp(-(ts - atk) / this.tauLow)
    if (ts > this.endAt) {
      this.active = false
      this.wait = Math.min(50, Math.max(6, -Math.log(1 - this.rand()) * this.meanWaitSec)) * this.fs
      return 0
    }
    const baseMid = ts < atk ? baseLow : Math.exp(-(ts - atk) / this.tauMid)
    const baseSheet = ts < atk ? baseLow : Math.exp(-(ts - atk) / this.tauSheet)
    let rolls = 0
    for (let j = 0; j < ROLLS; j++) {
      const d = (ts - (this.rollT[j] as number)) / (this.rollW[j] as number)
      rolls += (this.rollA[j] as number) * Math.exp(-0.5 * d * d)
    }
    // temblor de amplitud (el «ondeo» de la hoja): lento-medio en el cuerpo y el retumbo medio, rápido en la hoja
    const wob = 1 + 0.55 * this.wobble.tick()
    const flu = 1 + 0.5 * this.flutter.tick()
    // chasquido (y su eco): ataque de 12–20 ms, decaimiento rápido
    let crack = 0
    if (this.crackAmp > 0 && ts < this.crack2At + 1.5) {
      crack = this.crackAmp * (ts < 0.012 ? 0.5 - 0.5 * Math.cos((Math.PI * ts) / 0.012) : Math.exp(-(ts - 0.012) / 0.1))
      const t2 = ts - this.crack2At
      if (t2 >= 0) crack += this.crack2Amp * (t2 < 0.02 ? 0.5 - 0.5 * Math.cos((Math.PI * t2) / 0.02) : Math.exp(-(t2 - 0.02) / 0.14))
    }
    const n = noise(this.rand)
    const low = this.lp2.tick(this.lp1.tick(n))
    const body = this.bodyLp.tick(this.bodyHp.tick(n))
    const mid = this.midLp.tick(this.midHp.tick(n))
    const cr = this.crackBp.tick(n, 1400, 0.6)
    const sheet = this.sheetLo.tick(n, 700, 1.2) + 0.7 * this.sheetHi.tick(n, 1700, 1.5)
    // oscurecimiento: el corte del filtro baja de ~1,6 kHz a ~120 Hz según el trueno se extingue
    if ((this.t & 31) === 0) {
      const fc = 120 + 1500 * Math.exp(-ts / (0.5 * this.tauLow))
      this.darkCoef = 1 - Math.exp((-TWO_PI * fc) / this.fs)
    }
    const textured =
      THUNDER_BODY * body * (baseMid + 0.9 * rolls) * wob +
      THUNDER_MID * this.midGain * mid * (baseMid + 0.9 * rolls) * wob +
      THUNDER_SHEET * sheet * (baseSheet + 0.5 * rolls) * flu * wob
    this.dark1 += this.darkCoef * (textured - this.dark1)
    this.dark2 += this.darkCoef * (this.dark1 - this.dark2)
    return this.amp * (THUNDER_LOW * low * (baseLow + rolls) + this.dark2 + THUNDER_CRACK * cr * crack)
  }
}

/** Tormenta: lluvia intensa + viento grave + truenos (graves, medios y con chasquido si son cercanos). */
export class StormGen implements NatureGen {
  private readonly rain: RainGen
  private readonly wind: WindGen
  private readonly thunder: Thunder
  private readonly level: number
  constructor(rand: Rand, fs: number, level = 0.8) {
    this.rain = new RainGen(rand, fs, 1, 1)
    this.wind = new WindGen(rand, fs, 0.5, 300)
    this.thunder = new Thunder(rand, fs, 24)
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
