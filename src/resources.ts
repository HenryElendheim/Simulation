import { Food, Trees } from "./config";

/** Anything a creature can walk up to and eat from. */
export interface Edible {
  readonly x: number;
  readonly y: number;
  readonly hasFood: boolean;
  bite(): number;
}

/** A berry bush: regrows food over time and is a ground-level food source. */
export class FoodSource implements Edible {
  amount: number;
  constructor(public x: number, public y: number, amount = Food.maxPerBush) {
    this.amount = amount;
  }

  get hasFood(): boolean {
    return this.amount >= Food.biteSize;
  }

  /** Regrow over `dtDays` days, capped at the bush maximum. */
  grow(dtDays: number): void {
    if (this.amount < Food.maxPerBush) {
      this.amount = Math.min(Food.maxPerBush, this.amount + Food.regrowPerDay * dtDays);
    }
  }

  /** Take one bite; returns the nutrition gained (0 if empty). */
  bite(): number {
    if (!this.hasFood) return 0;
    this.amount -= Food.biteSize;
    return Food.biteSize;
  }
}

/**
 * A tree: a standing landmark that bears fruit (an edible food source) and holds
 * wood for future building. Fruit regrows slowly; wood is a fixed reserve.
 */
export class Tree implements Edible {
  fruit: number;
  wood: number;
  /** 0..1 visual maturity, just for rendering variety. */
  maturity: number;

  constructor(public x: number, public y: number, maturity = 1) {
    this.maturity = maturity;
    this.fruit = Math.round(Trees.maxFruit * maturity);
    this.wood = 4 + Math.round(maturity * 6);
  }

  get hasFood(): boolean {
    return this.fruit >= 1;
  }

  grow(dtDays: number): void {
    if (this.maturity < 1) this.maturity = Math.min(1, this.maturity + dtDays * 0.05);
    const cap = Trees.maxFruit * this.maturity;
    if (this.fruit < cap) this.fruit = Math.min(cap, this.fruit + Trees.fruitRegrowPerDay * dtDays);
  }

  /** Pick one fruit. */
  bite(): number {
    if (!this.hasFood) return 0;
    this.fruit -= 1;
    return 1;
  }

  /** Chop wood; returns amount taken. */
  chop(amount = 1): number {
    const take = Math.min(this.wood, amount);
    this.wood -= take;
    return take;
  }
}
