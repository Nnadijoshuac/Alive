import Image from "next/image";

export function AliveLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="alive-logo"
      role="img"
      aria-label="ALIVE, RWA intelligence and policy layer"
    >
      <span className="alive-logo-mark" aria-hidden="true">
        <Image
          src="/asset/logo.png"
          alt="ALIVE"
          width={76}
          height={76}
          sizes="38px"
          priority
        />
      </span>
      {!compact && (
        <span className="alive-wordmark">
          ALIVE <span>RWA policy layer</span>
        </span>
      )}
    </span>
  );
}
