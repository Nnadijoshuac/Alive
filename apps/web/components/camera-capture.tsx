"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  CheckCircleIcon,
  DeviceMobileCameraIcon,
  RepeatIcon,
} from "@phosphor-icons/react";
import { assessFrameQuality, qualityLabel } from "@/lib/quality";
import type { CaptureQuality } from "@/lib/types";
import { Button, InlineNotice } from "./ui";
import { Scanner } from "./scanner";

export interface CameraFrame {
  imageBase64: string;
  capturedAt: string;
  quality: CaptureQuality;
  motionSample: number;
  burstFrames: Array<{
    imageBase64: string;
    mimeType: "image/jpeg";
    capturedAt: string;
  }>;
}

interface RawFrame {
  imageBase64: string;
  capturedAt: string;
  quality: CaptureQuality;
  grayscale: Float32Array;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function frameDifference(left: Float32Array, right: Float32Array): number {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let difference = 0;
  for (let index = 0; index < length; index += 1)
    difference += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  return Math.min(1, difference / length / 42);
}

export function CameraCapture({
  label,
  instruction,
  burst = false,
  onCapture,
}: {
  label: string;
  instruction: string;
  burst?: boolean;
  onCapture: (frame: CameraFrame) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [cameraState, setCameraState] = useState<
    "starting" | "ready" | "denied" | "unavailable"
  >("starting");
  const [quality, setQuality] = useState<CaptureQuality | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (requestedDevice?: string) => {
      setCameraState("starting");
      setError(null);
      stopStream();
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("unavailable");
        return;
      }
      try {
        const video: MediaTrackConstraints = requestedDevice
          ? {
              deviceId: { exact: requestedDevice },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const available = (
          await navigator.mediaDevices.enumerateDevices()
        ).filter((device) => device.kind === "videoinput");
        setDevices(available);
        const activeDevice = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (activeDevice) setDeviceId(activeDevice);
        setCameraState("ready");
      } catch (caught) {
        const domError = caught as DOMException;
        setCameraState(
          domError.name === "NotAllowedError" ? "denied" : "unavailable",
        );
        setError(
          domError.name === "NotAllowedError"
            ? "Camera permission was denied."
            : "No usable camera could be started.",
        );
      }
    },
    [stopStream],
  );

  useEffect(() => {
    void startCamera();
    return stopStream;
  }, [startCamera, stopStream]);

  const readFrame = useCallback((): RawFrame => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight)
      throw new Error("Camera frame is not ready.");
    const width = Math.min(960, video.videoWidth);
    const height = Math.round((width / video.videoWidth) * video.videoHeight);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas capture is unavailable.");
    context.drawImage(video, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const captureQuality = assessFrameQuality(imageData.data, width, height);
    const sampleWidth = Math.max(1, Math.floor(width / 36));
    const sampleHeight = Math.max(1, Math.floor(height / 24));
    const grayscale = new Float32Array(36 * 24);
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 36; x += 1) {
        const source =
          (Math.min(height - 1, y * sampleHeight) * width +
            Math.min(width - 1, x * sampleWidth)) *
          4;
        grayscale[y * 36 + x] =
          ((imageData.data[source] ?? 0) +
            (imageData.data[source + 1] ?? 0) +
            (imageData.data[source + 2] ?? 0)) /
          3;
      }
    }
    return {
      imageBase64: canvas.toDataURL("image/jpeg", 0.86),
      capturedAt: new Date().toISOString(),
      quality: captureQuality,
      grayscale,
    };
  }, []);

  const capture = async () => {
    setCapturing(true);
    setAccepted(false);
    setError(null);
    try {
      const first = readFrame();
      const samples = [first];
      if (burst) {
        await wait(180);
        samples.push(readFrame());
        await wait(180);
        samples.push(readFrame());
      }
      const finalFrame = samples.at(-1) ?? first;
      let previousCapturedAt = 0;
      const burstFrames = samples.map((sample) => {
        const capturedAt = Math.max(
          Date.parse(sample.capturedAt),
          previousCapturedAt + 1,
        );
        previousCapturedAt = capturedAt;
        return {
          imageBase64: sample.imageBase64,
          mimeType: "image/jpeg" as const,
          capturedAt: new Date(capturedAt).toISOString(),
        };
      });
      const motionSample =
        samples.length > 1
          ? samples
              .slice(1)
              .reduce(
                (sum, sample, index) =>
                  sum +
                  frameDifference(
                    samples[index]?.grayscale ?? sample.grayscale,
                    sample.grayscale,
                  ),
                0,
              ) /
            (samples.length - 1)
          : 0;
      setQuality(finalFrame.quality);
      if (!finalFrame.quality.usable) return;
      await onCapture({
        imageBase64: finalFrame.imageBase64,
        capturedAt: finalFrame.capturedAt,
        quality: finalFrame.quality,
        motionSample,
        burstFrames,
      });
      setAccepted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Capture failed.");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="camera-capture">
      <Scanner
        active={cameraState === "ready" && !accepted}
        label={label}
        footer={
          <>
            <span>{instruction}</span>
            <span className="mono">
              {quality
                ? `${Math.round(quality.blurScore * 100)} focus / ${Math.round(quality.exposureScore * 100)} light`
                : "Quality pending"}
            </span>
          </>
        }
      >
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Live camera preview"
        />
        {cameraState !== "ready" ? (
          <div className="camera-blocked">
            <CameraIcon size={32} />
            <strong>
              {cameraState === "starting"
                ? "Starting camera"
                : cameraState === "denied"
                  ? "Camera access blocked"
                  : "Camera unavailable"}
            </strong>
            <span>
              {error ?? "A live camera is required for physical-state capture."}
            </span>
            {cameraState !== "starting" ? (
              <Button
                className="button-secondary"
                onClick={() => void startCamera()}
              >
                Retry camera
              </Button>
            ) : null}
          </div>
        ) : null}
      </Scanner>
      <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
      <div className="camera-controls">
        <label className="camera-device-label">
          <DeviceMobileCameraIcon size={18} />
          <span className="sr-only">Camera device</span>
          <select
            className="select"
            value={deviceId}
            disabled={devices.length < 2 || capturing}
            onChange={(event) => void startCamera(event.target.value)}
          >
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="button-primary"
          disabled={cameraState !== "ready" || capturing}
          onClick={() => void capture()}
        >
          {capturing ? (
            <>
              <RepeatIcon className="spin" size={18} />
              Reading frames
            </>
          ) : accepted ? (
            <>
              <CheckCircleIcon size={18} weight="fill" />
              Captured
            </>
          ) : (
            <>
              <CameraIcon size={18} weight="fill" />
              Capture view
            </>
          )}
        </Button>
      </div>
      {quality ? (
        <InlineNotice
          tone={quality.usable ? "success" : "warning"}
          title={qualityLabel(quality)}
        >
          {quality.usable
            ? "This frame can enter the evidence set."
            : "The frame was rejected and was not submitted."}
        </InlineNotice>
      ) : null}
      {error && cameraState === "ready" ? (
        <InlineNotice tone="warning" title="Capture error">
          {error}
        </InlineNotice>
      ) : null}
    </div>
  );
}
