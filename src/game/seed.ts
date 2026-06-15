const JAVA_RANDOM_MULTIPLIER = 25214903917n;
const JAVA_RANDOM_ADDEND = 11n;
const JAVA_RANDOM_MASK = (1n << 48n) - 1n;

export class GameSeed {
  private rnd: bigint;

  constructor(init: number) {
    this.rnd = (BigInt(init) ^ JAVA_RANDOM_MULTIPLIER) & JAVA_RANDOM_MASK;
  }

  next(): number {
    this.rnd = (this.rnd * JAVA_RANDOM_MULTIPLIER + JAVA_RANDOM_ADDEND) & JAVA_RANDOM_MASK;

    let value = Number(this.rnd >> 16n);
    if (value >= 0x80000000) {
      value -= 0x100000000;
    }

    if (value < 0) {
      return value === -0x80000000 ? 0 : -value;
    }

    return value;
  }
}
