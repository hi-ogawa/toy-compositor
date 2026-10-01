import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useResizeObserver } from "../hooks/use-resize-observer";
import type { Layer, MediaInfo } from "../lib/project";
import type { DecodedAudio, EditorLayer, EditorRuntime } from "../lib/runtime";
import type { PromiseState } from "../utils/promise-state";
import { AudioWaveformView } from "./audio-waveform";
import { Button } from "./ui/button";

/** The selected layer's whole source file, independent of project timing and layout. */
export function MediaPreview({
  layer,
  runtime,
  audioSource,
  compositionPlaying,
  resolveMediaUrl,
}: {
  layer?: EditorLayer;
  runtime: EditorRuntime;
  audioSource?: PromiseState<DecodedAudio>;
  compositionPlaying: boolean;
  resolveMediaUrl: (src: string) => string;
}) {
  const source = layer && "src" in layer ? layer : undefined;
  return source ? (
    // Remounts per layer so a load failure does not carry over.
    <SourceMedia
      key={source.id}
      layer={source}
      runtime={runtime}
      audioSource={audioSource}
      compositionPlaying={compositionPlaying}
      resolveMediaUrl={resolveMediaUrl}
    />
  ) : (
    <p className="grid flex-1 place-items-center p-3 text-center text-xs text-neutral-500">
      Select a video, audio, or image layer to preview its source.
    </p>
  );
}

type SourceLayer = Extract<Layer, { src: string }>;

function SourceMedia({
  layer,
  runtime,
  audioSource,
  compositionPlaying,
  resolveMediaUrl,
}: {
  layer: SourceLayer;
  runtime: EditorRuntime;
  audioSource?: PromiseState<DecodedAudio>;
  compositionPlaying: boolean;
  resolveMediaUrl: (src: string) => string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      {failed && (
        <p role="alert" className="px-3 pt-3 text-xs text-destructive">
          Could not load {layer.src}. Check that the file exists and your
          browser supports its format.
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <SourceElement
          layer={layer}
          src={resolveMediaUrl(layer.src)}
          runtime={runtime}
          sourceInfo={runtime.store.get().project.media[layer.src]}
          audioSource={audioSource}
          compositionPlaying={compositionPlaying}
          onError={() => setFailed(true)}
        />
      </div>
    </>
  );
}

function SourceElement({
  layer,
  src,
  runtime,
  sourceInfo,
  audioSource,
  compositionPlaying,
  onError,
}: {
  layer: SourceLayer;
  src: string;
  runtime: EditorRuntime;
  sourceInfo: MediaInfo;
  audioSource?: PromiseState<DecodedAudio>;
  compositionPlaying: boolean;
  onError: () => void;
}) {
  switch (layer.type) {
    case "video": {
      return (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          onError={onError}
          className="max-h-full max-w-full bg-black"
        />
      );
    }
    case "audio": {
      return (
        <AudioSourcePlayer
          layer={layer}
          src={src}
          runtime={runtime}
          sourceInfo={sourceInfo}
          audioSource={audioSource}
          compositionPlaying={compositionPlaying}
          onError={onError}
        />
      );
    }
    case "image": {
      return (
        <img
          src={src}
          alt={layer.name ?? layer.src}
          onError={onError}
          className="max-h-full max-w-full object-contain"
        />
      );
    }
  }
}

function AudioSourcePlayer({
  layer,
  src,
  runtime,
  sourceInfo,
  audioSource,
  compositionPlaying,
  onError,
}: {
  layer: Extract<Layer, { type: "audio" }>;
  src: string;
  runtime: EditorRuntime;
  sourceInfo: MediaInfo;
  audioSource?: PromiseState<DecodedAudio>;
  compositionPlaying: boolean;
  onError: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(sourceInfo.start);
  const [width, setWidth] = useState(0);
  const waveformRef = useResizeObserver((element) =>
    setWidth(element.clientWidth),
  );
  const decoded =
    audioSource?.status === "fulfilled" ? audioSource.value : undefined;
  const duration = sourceInfo.end - sourceInfo.start;

  useEffect(() => {
    if (compositionPlaying) {
      audioRef.current?.pause();
    }
  }, [compositionPlaying]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    let frame = requestAnimationFrame(updatePlayhead);
    function updatePlayhead() {
      setCurrentTime(audioRef.current?.currentTime ?? 0);
      frame = requestAnimationFrame(updatePlayhead);
    }
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function togglePlayback() {
    const audio = audioRef.current!;
    if (audio.paused) {
      void audio.play().catch(onError);
    } else {
      audio.pause();
    }
  }

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    if (!duration) {
      return;
    }
    const audio = audioRef.current!;
    const bounds = event.currentTarget.getBoundingClientRect();
    audio.currentTime =
      sourceInfo.start +
      ((event.clientX - bounds.left) / bounds.width) * duration;
    setCurrentTime(audio.currentTime);
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-2">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        hidden
        onError={onError}
        onPlay={() => {
          runtime.transport.pause();
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
          setCurrentTime(audioRef.current?.currentTime ?? 0);
        }}
        onEnded={() => setPlaying(false)}
      />
      <button
        ref={waveformRef}
        type="button"
        aria-label="Seek source audio"
        className="relative h-24 w-full cursor-crosshair overflow-hidden rounded border border-neutral-600 bg-neutral-800"
        onClick={seek}
      >
        {decoded && width > 0 ? (
          <AudioWaveformView
            audioView={decoded.view}
            sourceStart={0}
            sourceEnd={duration}
            pixelsPerSecond={width / duration}
            dimmed={false}
            testId="source-waveform"
          />
        ) : (
          <span className="grid h-full place-items-center text-xs text-neutral-500">
            Loading waveform...
          </span>
        )}
        {duration && (
          <>
            <span
              data-testid="source-selected-range"
              className="pointer-events-none absolute inset-y-0 border-x border-emerald-300/70 bg-emerald-400/15"
              style={{
                left: `${((layer.in - sourceInfo.start) / duration) * 100}%`,
                width: `${((layer.out - layer.in) / duration) * 100}%`,
              }}
            />
            <span
              data-testid="source-playhead"
              className="pointer-events-none absolute inset-y-0 w-px bg-sky-300"
              style={{
                left: `${((currentTime - sourceInfo.start) / duration) * 100}%`,
              }}
            />
          </>
        )}
      </button>
      <div className="flex items-center gap-2">
        <Button
          aria-label={playing ? "Pause source audio" : "Play source audio"}
          title={playing ? "Pause source audio" : "Play source audio"}
          className="size-7 hover:bg-neutral-700"
          onClick={togglePlayback}
        >
          {playing ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
        <span className="font-mono text-xs tabular-nums text-neutral-300">
          {currentTime.toFixed(2)} / {sourceInfo.end.toFixed(2)} s
        </span>
      </div>
    </div>
  );
}
