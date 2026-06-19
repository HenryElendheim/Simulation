import { Food } from "./config";

/** A berry bush: regrows food over time and is the creatures' food source. */
export class FoodSource {
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
