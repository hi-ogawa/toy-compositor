# Temporary editor layout reference

This records the agreed layout for [issue #3](https://github.com/hi-ogawa/toy-compositor/issues/3). Keep it as an implementation reference while the composed preview and timeline are built, then remove or fold it into the editor documentation once the application represents the design.

## Agreed layout

Use a full-height inspector on the right, with side-by-side Source and Composition monitors above the timeline on the left. The mockup defaults to this arrangement. Alternative arrangements remain available for comparison, but implementing those alternatives is not required.

Open [mockup.html](mockup.html) locally in a browser. It is self-contained and uses illustrative media drawings and waveforms. Its visuals are not render comparisons, and seeking changes time displays without animating the drawings. Inspector fields, playback, saving, zoom, and timeline dragging are inactive. Selection, seeking, source panel open/close, and monitor resizing work for discussion. The mockup illustrates layout, while the editor unmounts the source player when the panel closes.

The prototype uses a 280px inspector and a 310px timeline within a 760px app height as starting proportions. These dimensions are illustrative rather than fixed requirements.

## Source and Composition monitors

Source shows the selected file-backed layer's original video, audio, or image, independently of project timing, crop, placement, and mute settings. Video and audio have their own source position and playback controls. Images have no transport. Text and Output selections show a clear no-source state. The source audio waveform in the mockup is illustrative and does not make waveform decoding a prerequisite for preserving the existing source player.

Composition shows all visual layers at the project playhead, using shared fit/crop math in canvas coordinates and scaling the composition to fit the panel. Its selected-layer outline stays read-only. Project transport sits below the monitors and drives the timeline and composition together once synchronized playback is implemented.

The source monitor starts at 35% of the monitor area. Drag the vertical divider to resize it. In the mockup, its range is 20% to 60%, and a focused divider supports Left/Right arrows in 2 percentage-point steps, with Home and End moving to the limits. These limits are starting values to calibrate during implementation.

Place Close source panel / Open source panel at the left above the source monitor. Keep the button in the same location in both states. Closing removes Source and its divider so Composition uses the available preview width. Opening restores the previous split with a fresh source player. Selection, inspector, and project playhead remain unchanged.

## Timeline and inspector

Use timeline lane labels for layer selection instead of a separate layer list. Show top visual layers first, following the existing editor's order, with audio layers in the same list. Source preview follows the selected file-backed layer.

Show Render start/end as special editor markers alongside locators, or Render frame for still output. Selecting a render marker opens its numeric settings in the inspector. The mockup still depicts the superseded Output row. Locator creation, dragging, prompt-based rename, and deletion belong to the editable timeline step.

Keep project time in seconds, independent of the output start. Time edits and later arrow-key seeking snap to the project's frame grid. Preserve the existing layer-type inspector groups and numeric stepping. Text content and font remain in JSON.

Initially draw static layer regions without waveforms. Add normalized source audio waveforms later, including muted video audio. Video frame thumbnails remain outside the current scope. Keep explicit Save and the project path in the header.

## Implementation steps

1. Establish the agreed panel arrangement and shared runtime state. Project and selection already exist, so playhead is the main state addition.
2. Develop composed preview and static timeline independently. Both consume project, selection, and playhead. The timeline owns its viewport time mapping, and the preview uses shared fit/crop math.
3. Add timeline selection, ruler seeking, layer-start dragging, output-range dragging, and locator actions, snapping time edits to frames.
4. Add waveforms to the lanes independently of editing interactions.
5. Add synchronized transport, media followers, output-range looping, and arrow-key seek.

Adding/removing layers, replacing sources, and browsing unused assets are tracked separately in [issue #32](https://github.com/hi-ogawa/toy-compositor/issues/32). For now, prepare project JSON and media outside the editor and open the project with `pnpm dev <project.json>`.

## Code reference and verification

This proposal was checked against commit `980e9efdab400bdbab7d5081dbf3c8ff51d9ba14`.

- [Editor shell and layer selection](../../src/components/editor.tsx)
- [Existing source preview](../../src/components/media-preview.tsx)
- [Runtime state](../../src/lib/runtime.ts)
- [Inspector](../../src/components/inspector.tsx)
- [Shared fit/range math](../../src/lib/layout.ts)
- [Save tracking](../../src/components/use-editor-project.ts)

Checked in Chromium at a 1440px desktop viewport. Layout and monitor switching, layer/output selection, project and independent source seeking, source panel close/reopen, pointer and keyboard resizing, and the waveform toggle work without browser errors. The mockup uses no external assets or project writes.
