import { expect, test } from "@playwright/test";
import { copyProject, copySample, runCli } from "./cli";
import {
  decodeMedia,
  diffFrames,
  measureRmsLevel,
  probeMedia,
  readGrayFrames,
  readStreamTypes,
} from "./media-probe";

test("render the synthetic sample", async ({}, testInfo) => {
  // Render a project to an MP4.
  const output = testInfo.outputPath("preview.mp4");
  await runCli(["render", "samples/synthetic/project.json", output]);
  await testInfo.attach("synthetic render", {
    path: output,
    contentType: "video/mp4",
  });

  // Check that the output has H.264 video and AAC audio matching the project settings.
  const probe = await probeMedia(output);
  expect(probe.streams).toHaveLength(2);
  expect(probe.streams).toContainEqual(
    expect.objectContaining({
      codec_type: "video",
      codec_name: "h264",
      width: 640,
      height: 360,
      avg_frame_rate: "30/1",
      nb_frames: "90",
    }),
  );
  expect(probe.streams).toContainEqual(
    expect.objectContaining({
      codec_type: "audio",
      codec_name: "aac",
    }),
  );
  expect(Number(probe.format.duration)).toBeCloseTo(3, 1);

  // Check that the entire rendered video and audio can be decoded without errors.
  await decodeMedia(output);
});

test("render the synthetic thumbnail", async ({}, testInfo) => {
  // Render a still-output project to a PNG.
  const output = testInfo.outputPath("thumbnail.png");
  await runCli(["render", "samples/synthetic/thumbnail.json", output]);
  await testInfo.attach("synthetic thumbnail", {
    path: output,
    contentType: "image/png",
  });

  // Check that the output is a single PNG image at the canvas size.
  const probe = await probeMedia(output);
  expect(probe.streams).toEqual([
    expect.objectContaining({
      codec_type: "video",
      codec_name: "png",
      width: 640,
      height: 360,
    }),
  ]);

  // Check that the image can be decoded without errors.
  await decodeMedia(output);
});

test("fade audio at the layer's own edges when the output cuts into them", async ({}, testInfo) => {
  // Keep only an audio layer that fades in and out, then cut the output into
  // both fades.
  const projectFile = await copySample(testInfo, (project) => {
    project.layers = project.layers.filter(
      (layer) => layer.clips[0]!.type === "audio",
    );
    project.output = { type: "video", start: 0.1, end: 2.8 };
  });
  const output = testInfo.outputPath("cut.mp4");
  await runCli(["render", projectFile, output]);

  // Check that the cut edges keep the partial level of the layer's fades,
  // about half of full level, instead of fading from and to silence.
  const full = await measureRmsLevel(output, { time: 1.3 });
  expect(full - (await measureRmsLevel(output, { time: 0 }))).toBeLessThan(9);
  expect(full - (await measureRmsLevel(output, { time: 2.68 }))).toBeLessThan(
    9,
  );
});

test("hold a video layer's first and last frames beyond its source range", async ({}, testInfo) => {
  // Keep only a video layer that plays in the middle of the output and holds
  // its first and last frames on each side.
  const projectFile = await copySample(testInfo, (project) => {
    project.layers = project.layers
      .filter((layer) => layer.clips[0]!.type === "video")
      .map((layer) => ({
        ...layer,
        clips: layer.clips.map((clip) => ({
          ...clip,
          start: 1,
          in: 1,
          out: 2,
          hold: { before: 1, after: 1 },
        })),
      }));
  });
  const output = testInfo.outputPath("hold.mp4");
  await runCli(["render", projectFile, output]);
  await testInfo.attach("held render", {
    path: output,
    contentType: "video/mp4",
  });

  // Check that each hold shows its edge frame, while the played part differs
  // from both.
  const fps = 30;
  const frames = await readGrayFrames(output);
  expect(frames).toHaveLength(3 * fps);
  expect(diffFrames(frames[0], frames[fps])).toBeLessThan(0.1);
  expect(diffFrames(frames[2 * fps], frames.at(-1)!)).toBeLessThan(0.1);
  expect(diffFrames(frames[0], frames[1.5 * fps])).toBeGreaterThan(1);
  expect(diffFrames(frames[1.5 * fps], frames.at(-1)!)).toBeGreaterThan(1);

  // Render stills inside each hold, and check that each matches the render's
  // frames there, within the video encode's loss.
  const renderStill = async (time: number) => {
    const file = await copyProject(projectFile, {
      name: `still-${time}`,
      edit: (project) => {
        project.output = { type: "still", time };
      },
    });
    const still = testInfo.outputPath(`still-${time}.png`);
    await runCli(["render", file, still]);
    const [frame] = await readGrayFrames(still);
    return frame;
  };
  expect(diffFrames(await renderStill(0.5), frames[0])).toBeLessThan(1);
  expect(diffFrames(await renderStill(2.5), frames.at(-1)!)).toBeLessThan(1);
});

test("leave out a muted layer's sound and a hidden layer's picture", async ({}, testInfo) => {
  // Keep only the video layer, whose source has its own audio, and render it
  // plain, muted, and hidden.
  const projectFile = await copySample(testInfo);
  const render = async (
    name: string,
    flags: { muted: boolean; hidden: boolean },
  ) => {
    const file = await copyProject(projectFile, {
      name,
      edit: (project) => {
        project.layers = project.layers
          .filter((layer) => layer.clips[0]!.type === "video")
          .map((layer) => ({ ...layer, ...flags }));
      },
    });
    const output = testInfo.outputPath(`${name}.mp4`);
    await runCli(["render", file, output]);
    const [frame] = (await readGrayFrames(output)).slice(45);
    return { streams: await readStreamTypes(output), frame };
  };
  const plain = await render("plain", { muted: false, hidden: false });
  const muted = await render("muted", { muted: true, hidden: false });
  const hidden = await render("hidden", { muted: false, hidden: true });

  // Check that muting drops only the sound and hiding drops only the picture,
  // leaving the black canvas.
  const blackFrame = new Uint8Array(plain.frame.length);
  expect(plain.streams).toEqual(["video", "audio"]);
  expect(diffFrames(plain.frame, blackFrame)).toBeGreaterThan(10);
  expect(muted.streams).toEqual(["video"]);
  expect(diffFrames(muted.frame, plain.frame)).toBeLessThan(0.1);
  expect(hidden.streams).toEqual(["video", "audio"]);
  expect(diffFrames(hidden.frame, blackFrame)).toBeLessThan(0.1);
});
