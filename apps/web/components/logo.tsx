import { PulseIcon } from "@phosphor-icons/react/dist/ssr";

export function AliveLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="alive-logo" aria-label="ALIVE, Proof of Physical State">
      <span className="alive-logo-mark" aria-hidden="true">
        <PulseIcon size={19} weight="bold" />
      </span>
      {!compact && (
        <span className="alive-wordmark">
          ALIVE <span>Proof of Physical State</span>
        </span>
      )}
    </span>
  );
}
