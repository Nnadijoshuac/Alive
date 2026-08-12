import { CheckIcon, CircleNotchIcon, LockKeyIcon, XIcon } from "@phosphor-icons/react/dist/ssr";

export type TransactionStepState = "idle" | "pending" | "confirmed" | "rejected" | "blocked";

export interface TransactionStep {
  label: string;
  detail: string;
  state: TransactionStepState;
}

export function TransactionFlow({ steps }: { steps: TransactionStep[] }) {
  return (
    <ol className="transaction-flow" aria-label="Transaction progress">
      {steps.map((step) => (
        <li key={step.label} data-state={step.state}>
          <span className="transaction-node" aria-hidden="true">
            {step.state === "confirmed" ? <CheckIcon size={16} weight="bold" /> : step.state === "pending" ? <CircleNotchIcon className="spin" size={16} /> : step.state === "rejected" ? <XIcon size={16} /> : <LockKeyIcon size={15} />}
          </span>
          <div><strong>{step.label}</strong><span>{step.detail}</span></div>
        </li>
      ))}
    </ol>
  );
}
