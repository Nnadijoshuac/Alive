import Image from "next/image";

export function AliveLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="alive-logo" aria-label="ALIVE, Proof of Physical State">
      <span className="alive-logo-mark" aria-hidden="true">
        <Image
          src="/brand/alive-logo.png"
          alt=""
          width={76}
          height={76}
          sizes="38px"
          priority
        />
      </span>
      {!compact && (
        <span className="alive-wordmark">
          ALIVE <span>Proof of physical state</span>
        </span>
      )}
    </span>
  );
}
