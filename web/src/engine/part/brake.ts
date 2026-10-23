// PART_Brake port (vInit @001dcc20, vSetBrakeBalance @001dcd00). torque (+4) = balance × ½ × radius × max_braking_force
import { Setup } from '../data/setup';
export class Brake {
  maxTorque = 0; balance = 0.5; torque = 0;
  init(s: Setup, rear: boolean, wheelRadius: number): void {
    const bal = s.f('chassis.brakes.braking_balance');
    this.maxTorque = wheelRadius * s.f('chassis.brakes.max_braking_force');
    this.setBalance(rear ? 1 - bal : bal);
  }
  setBalance(b: number): void { this.balance = b; this.torque = b * 0.5 * this.maxTorque; }
}
