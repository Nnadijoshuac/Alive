import { describe, expect, it } from "vitest";
import {
  EscrowStatus,
  escrowCanSettle,
  escrowStatusName,
  escrowWasFunded,
} from "@/lib/escrow-status";

describe("AliveEscrow status semantics", () => {
  it("maps every Solidity enum ordinal", () => {
    expect(
      [
        EscrowStatus.None,
        EscrowStatus.Created,
        EscrowStatus.AwaitingVerification,
        EscrowStatus.Released,
        EscrowStatus.Refunded,
        EscrowStatus.Cancelled,
        EscrowStatus.Funded,
        EscrowStatus.Disputed,
      ].map(escrowStatusName),
    ).toEqual([
      "NOT FOUND",
      "CREATED",
      "AWAITING VERIFICATION",
      "RELEASED",
      "REFUNDED",
      "CANCELLED",
      "FUNDED",
      "DISPUTED",
    ]);
  });

  it("keeps verification settlement available during a dispute", () => {
    expect(escrowCanSettle(EscrowStatus.AwaitingVerification)).toBe(true);
    expect(escrowCanSettle(EscrowStatus.Disputed)).toBe(true);
    expect(escrowCanSettle(EscrowStatus.Refunded)).toBe(false);
  });

  it("does not mistake terminal pre-funding cancellation for a funded escrow", () => {
    expect(escrowWasFunded(EscrowStatus.Cancelled)).toBe(false);
    expect(escrowWasFunded(EscrowStatus.Refunded)).toBe(true);
    expect(escrowWasFunded(EscrowStatus.Disputed)).toBe(true);
  });
});
