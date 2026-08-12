export const EscrowStatus = {
  None: 0,
  Created: 1,
  AwaitingVerification: 2,
  Released: 3,
  Refunded: 4,
  Cancelled: 5,
  Funded: 6,
  Disputed: 7,
} as const;

const statusNames: Readonly<Record<number, string>> = {
  [EscrowStatus.None]: "NOT FOUND",
  [EscrowStatus.Created]: "CREATED",
  [EscrowStatus.AwaitingVerification]: "AWAITING VERIFICATION",
  [EscrowStatus.Released]: "RELEASED",
  [EscrowStatus.Refunded]: "REFUNDED",
  [EscrowStatus.Cancelled]: "CANCELLED",
  [EscrowStatus.Funded]: "FUNDED",
  [EscrowStatus.Disputed]: "DISPUTED",
};

export function escrowStatusName(status: number): string {
  return statusNames[status] ?? "UNKNOWN";
}

export function escrowWasFunded(status: number): boolean {
  return [
    EscrowStatus.AwaitingVerification,
    EscrowStatus.Released,
    EscrowStatus.Refunded,
    EscrowStatus.Funded,
    EscrowStatus.Disputed,
  ].includes(status as 2 | 3 | 4 | 6 | 7);
}

export function escrowCanSettle(status: number): boolean {
  return (
    status === EscrowStatus.AwaitingVerification ||
    status === EscrowStatus.Disputed
  );
}
