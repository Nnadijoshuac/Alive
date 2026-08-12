import { CameraIcon, CpuIcon, FingerprintIcon, SealCheckIcon, CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/ssr";

const points = [
  { icon: CameraIcon, label: "Physical capture" },
  { icon: CpuIcon, label: "Visual analysis" },
  { icon: FingerprintIcon, label: "Evidence commitment" },
  { icon: SealCheckIcon, label: "Signed attestation" },
  { icon: CurrencyCircleDollarIcon, label: "Payment outcome" },
];

export function ProtocolMini() {
  return (
    <ol className="protocol-mini" aria-label="ALIVE causal protocol chain">
      {points.map(({ icon: Icon, label }) => (
        <li key={label}><span><Icon size={20} weight="duotone" /></span><strong>{label}</strong></li>
      ))}
    </ol>
  );
}
