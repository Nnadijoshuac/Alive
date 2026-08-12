import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { hashEvidenceBytes } from "@alive/shared";
import { randomBytes32 } from "./random.js";

export interface StoredEvidence {
  path: string;
  evidenceHash: `0x${string}`;
  byteLength: number;
}

export interface EvidenceStore {
  put(
    namespace: "registration" | "verification",
    ownerId: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<StoredEvidence>;
  read(storedPath: string): Promise<Buffer>;
  reset(): Promise<void>;
}

const extensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function safeSegment(value: string): string {
  const stripped = value.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(stripped))
    throw new Error("Evidence owner ID must be bytes32");
  return stripped;
}

export class FileEvidenceStore implements EvidenceStore {
  readonly rootPath: string;
  private readonly resetBoundary: string;

  constructor(
    rootPath: string,
    resetBoundary = path.dirname(path.resolve(rootPath)),
  ) {
    this.rootPath = path.resolve(rootPath);
    this.resetBoundary = path.resolve(resetBoundary);
  }

  async put(
    namespace: "registration" | "verification",
    ownerId: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<StoredEvidence> {
    const extension = extensions[mimeType];
    if (extension === undefined)
      throw new Error(`Unsupported evidence MIME type: ${mimeType}`);
    const directory = path.join(this.rootPath, namespace, safeSegment(ownerId));
    await mkdir(directory, { recursive: true });
    const basename = `${safeSegment(randomBytes32())}${extension}`;
    const destination = path.join(directory, basename);
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, destination);
    return {
      path: destination,
      evidenceHash: hashEvidenceBytes(bytes),
      byteLength: bytes.byteLength,
    };
  }

  async read(storedPath: string): Promise<Buffer> {
    const resolved = path.resolve(storedPath);
    const relative = path.relative(this.rootPath, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Evidence path escapes storage root");
    return readFile(resolved);
  }

  async reset(): Promise<void> {
    const parsed = path.parse(this.rootPath);
    const relativeToBoundary = path.relative(this.resetBoundary, this.rootPath);
    if (
      this.rootPath === parsed.root ||
      this.rootPath === path.resolve(process.cwd()) ||
      relativeToBoundary === "" ||
      relativeToBoundary.startsWith("..") ||
      path.isAbsolute(relativeToBoundary)
    ) {
      throw new Error("Refusing to reset an unsafe evidence root");
    }
    await mkdir(this.rootPath, { recursive: true });
    const entries = await readdir(this.rootPath, { withFileTypes: true });
    await Promise.all(
      entries.map((entry) =>
        rm(path.join(this.rootPath, entry.name), {
          recursive: true,
          force: true,
        }),
      ),
    );
  }
}

export function decodeCaptureBase64(
  value: string,
  maximumBytes: number,
): Buffer {
  const payload = value.includes(",")
    ? value.slice(value.indexOf(",") + 1)
    : value;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload))
    throw new Error("Capture is not valid base64");
  const decoded = Buffer.from(payload, "base64");
  if (decoded.byteLength === 0) throw new Error("Capture is empty");
  if (decoded.byteLength > maximumBytes)
    throw new Error(`Capture exceeds ${maximumBytes} bytes`);
  return decoded;
}
