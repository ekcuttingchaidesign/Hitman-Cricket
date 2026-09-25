import './graphics-review.css';
import { GameScene } from '../src/scene/GameScene';
import { FRAMES, PLAYS, prepareReviewPose, readState, stateQuery } from './graphics-review-poses';
import type { ReviewAction, ReviewFrame, ReviewKit } from './graphics-review-poses';
import { atExportResolution, exportDimensions } from './graphics-review-export';

// This entry deliberately never imports Game, HUD, audio, analytics or stores.
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = el<HTMLDivElement>('stage');
const holder = el<HTMLDivElement>('live-holder');
const reference = el<HTMLImageElement>('reference');
const timeline = el<HTMLInputElement>('timeline');
const play = el<HTMLButtonElement>('play');
const kit = el<HTMLSelectElement>('kit');
const viewport = el<HTMLSelectElement>('viewport');
const showReference = el<HTMLInputElement>('show-reference');
const state = readState(location.search);
// User reference art is local-only: no network upload, persistence or public asset.
let referenceObjectUrl: string | null = null;
el<HTMLInputElement>('reference-file').onchange = event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    el('status').textContent = 'Please choose a PNG, JPEG or WebP image.'; return;
  }
  if (referenceObjectUrl) URL.revokeObjectURL(referenceObjectUrl);
  referenceObjectUrl = URL.createObjectURL(file);
  reference.onload = () => {
    reference.hidden = false; el('reference-empty').hidden = true;
    el('reference-size').textContent = `${reference.naturalWidth} × ${reference.naturalHeight}`;
    el('status').textContent = 'Reference opened locally. It is not uploaded or included in copied links.';
  };
  reference.onerror = () => {
    reference.hidden = true; el('reference-empty').hidden = false;
    el('status').textContent = 'This image could not be opened. Please try another file.';
  };
  reference.src = referenceObjectUrl;
  input.value = '';
};

function startReview() {
  let playing = false, animationId = 0, previous = 0, playbackTime = state.time;
  let exportUrl: string | null = null;
  const exportSize = el<HTMLSelectElement>('export-size');
  const exportButton = el<HTMLButtonElement>('save-frame');
  const exportReady = el<HTMLDivElement>('export-ready');
  const exportLink = el<HTMLAnchorElement>('export-download');
  const openImage = el<HTMLAnchorElement>('export-open');
  function imageSize() {
    const [w, h] = FRAMES[state.frame];
    return exportDimensions(w, h, Number(exportSize.value));
  }
  function describeExport() {
    const size = imageSize();
    el('export-dimensions').textContent = `${size.width} × ${size.height} pixels · lossless PNG`;
  }
  exportSize.onchange = describeExport;
  const [width, height] = FRAMES[state.frame];
  stage.style.width = `${width}px`; stage.style.height = `${height}px`;
  const gameScene = new GameScene(stage);
  kit.value = state.kit; viewport.value = state.frame; showReference.checked = state.reference;
  gameScene.whites(state.kit === 'survive');

  function updateUrl() { history.replaceState(null, '', `${location.pathname}?${stateQuery(state)}`); }
  function status(message: string) { el('status').textContent = message; }
  function poseLabel() {
    return PLAYS[state.action].phases.find(([, time]) => time === state.time)?.[0] ?? 'Custom moment';
  }
  function syncTime() {
    timeline.value = String(state.time);
    el('time').textContent = `${state.time} ms`;
    el('frame-state').textContent = `${playing ? 'Playing' : 'Frozen'} · ${poseLabel()}`;
    document.querySelectorAll<HTMLButtonElement>('[data-time]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.time) === state.time)));
  }
  function draw() {
    prepareReviewPose(gameScene.batter, state.action);
    gameScene.render(state.time);
    const info = gameScene.renderer.info.render;
    el('draw-calls').textContent = info.calls.toLocaleString();
    el('triangles').textContent = info.triangles.toLocaleString();
    el('pixel-ratio').textContent = String(gameScene.renderer.getPixelRatio());
    el('fov').textContent = `${gameScene.camera.fov.toFixed(1)}°`;
    el('metrics-summary').textContent = `${info.calls.toLocaleString()} calls · ${Math.round(info.triangles / 1000)}k triangles`;
    syncTime();
  }
  function pause() {
    playing = false; cancelAnimationFrame(animationId); play.textContent = 'Play motion';
    playbackTime = state.time; previous = 0; syncTime(); updateUrl();
  }
  function seek(time: number) {
    pause(); state.time = Math.max(0, Math.min(PLAYS[state.action].duration, Math.round(time)));
    playbackTime = state.time; draw(); updateUrl();
  }
  function buildPhases() {
    el('phases').replaceChildren();
    for (const [label, time] of PLAYS[state.action].phases) {
      const button = document.createElement('button'); button.textContent = label;
      button.dataset.time = String(time); button.title = `${time} ms`;
      button.onclick = () => seek(time); el('phases').append(button);
    }
    const guard = state.action === 'guard';
    timeline.disabled = play.disabled = el<HTMLButtonElement>('back').disabled = el<HTMLButtonElement>('forward').disabled = guard;
    timeline.max = String(PLAYS[state.action].duration);
    el('action-note').textContent = PLAYS[state.action].note;
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.action === state.action)));
  }
  function fit() {
    if (!holder.clientWidth) return; // Reference-only mobile tab: keep the last valid viewport.
    const [w, h] = FRAMES[state.frame];
    stage.style.width = `${w}px`; stage.style.height = `${h}px`;
    // Scale the presentation, not the simulated viewport or camera aspect.
    const scale = holder.clientWidth / w;
    stage.style.transform = `scale(${scale})`; holder.style.height = `${h * scale}px`;
    el('viewport-readout').textContent = `${w} × ${h}`;
    describeExport();
    el('comparison-note').textContent = state.frame === 'reference'
      ? 'Matched reference aspect ratio. Compare the 3D scene; the target’s HUD is part of its image.'
      : 'The game adapts to this viewport. The target keeps its original aspect ratio; compare materials and poses, not framing.';
    // GameScene's observer updates projection first; our next frame reads it.
    cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(draw);
  }
  let resizeFrame = 0;
  const sizeObserver = new ResizeObserver(fit); sizeObserver.observe(holder); sizeObserver.observe(stage);
  function compare() {
    el('reference-card').hidden = !state.reference;
    document.querySelector('.gallery')!.classList.toggle('solo', !state.reference);
    fit(); updateUrl();
  }
  document.querySelectorAll<HTMLButtonElement>('.mobile-views [data-view]').forEach(button => {
    button.onclick = () => {
      document.querySelector<HTMLElement>('.gallery')!.dataset.mobileView = button.dataset.view;
      document.querySelectorAll('.mobile-views [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      if (button.dataset.view !== 'scene') { state.reference = true; showReference.checked = true; }
      compare();
    };
  });
  function frame(now: number) {
    if (!playing) return;
    if (previous) playbackTime += Math.min(now - previous, 100) * Number(el<HTMLSelectElement>('speed').value);
    previous = now;
    const end = PLAYS[state.action].duration;
    state.time = Math.min(end, Math.round(playbackTime)); draw();
    if (playbackTime >= end) { pause(); return; }
    animationId = requestAnimationFrame(frame);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
    button.onclick = () => { pause(); state.action = button.dataset.action as ReviewAction; state.time = 0; buildPhases(); seek(0); };
  });
  timeline.oninput = () => seek(Number(timeline.value));
  play.onclick = () => {
    if (playing) { pause(); return; }
    if (state.time >= PLAYS[state.action].duration) state.time = 0;
    playbackTime = state.time; previous = 0; playing = true; play.textContent = 'Pause motion'; syncTime();
    animationId = requestAnimationFrame(frame);
  };
  el('back').onclick = () => seek(state.time - 1000 / 60);
  el('forward').onclick = () => seek(state.time + 1000 / 60);
  kit.onchange = () => { pause(); state.kit = kit.value as ReviewKit; gameScene.whites(state.kit === 'survive'); draw(); updateUrl(); };
  viewport.onchange = () => { pause(); state.frame = viewport.value as ReviewFrame; fit(); updateUrl(); };
  showReference.onchange = () => { state.reference = showReference.checked; compare(); };
  const stopWhenHidden = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', stopWhenHidden);

  function filename(extension: string) { return `hitman-pass01-${state.action}-${state.time}ms-${state.kit}-${state.frame}.${extension}`; }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  exportButton.onclick = async () => {
    pause();
    const size = imageSize();
    const name = filename(`${size.width}x${size.height}.png`);
    exportButton.disabled = true; exportButton.textContent = 'Rendering PNG…'; exportReady.hidden = true;
    status(`Rendering ${size.width} × ${size.height} pixels…`);
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = atExportResolution(gameScene.renderer, size, () => {
        prepareReviewPose(gameScene.batter, state.action);
        gameScene.render(state.time);
        if (gameScene.renderer.getContext().isContextLost()) throw new Error('Export exceeded available graphics memory. Reload and choose a smaller size.');
        const copy = document.createElement('canvas'); copy.width = size.width; copy.height = size.height;
        const context = copy.getContext('2d');
        if (!context) throw new Error('Image export is unavailable in this browser.');
        // Copy immediately at 1:1, before WebGL clears the buffer. These are
        // freshly rendered pixels, not an enlargement of the phone preview.
        context.drawImage(gameScene.renderer.domElement, 0, 0);
        return copy;
      });
      draw();
      const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(
        result => result ? resolve(result) : reject(new Error('Could not encode the PNG. Try a smaller export size.')), 'image/png'));
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(blob);
      exportLink.href = openImage.href = exportUrl;
      exportLink.download = name;
      exportLink.textContent = `Save PNG · ${size.width} × ${size.height}`;
      exportReady.hidden = false;
      // Keep direct tap targets available: a phone browser may decline an
      // asynchronous automatic download, or the user may prefer Save Image.
      exportLink.click();
      status(`${size.width} × ${size.height} PNG ready. If it did not save, tap Save PNG or open the full-resolution image below.`);
    } catch (error) {
      status(error instanceof Error ? error.message : 'Could not export the frame. Try a smaller size.');
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      exportButton.disabled = false; exportButton.textContent = 'Download high-res PNG';
      draw();
    }
  };
  el('copy-link').onclick = async () => {
    pause(); updateUrl();
    try { await navigator.clipboard.writeText(location.href); status('Review link copied. It opens this exact frozen moment.'); }
    catch { status(`Copy the address from your browser to reopen this moment: ${location.href}`); }
  };
  el('save-settings').onclick = () => {
    pause(); draw();
    const camera = gameScene.camera, renderer = gameScene.renderer;
    download(new Blob([JSON.stringify({ baselineCommit: 'd630eb4', graphicsPass: '01', state, viewport: FRAMES[state.frame],
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect },
      render: { ...renderer.info.render, pixelRatio: renderer.getPixelRatio(), drawingBuffer: [renderer.domElement.width, renderer.domElement.height], shadowType: renderer.shadowMap.type },
      batter: gameScene.inspectBatter(), note: 'Frozen review frame; render counts are not a device frame-rate benchmark.',
    }, null, 2)], { type: 'application/json' }), filename('json'));
    status('Frame details downloaded.');
  };
  buildPhases(); compare(); draw(); updateUrl();
  const dispose = () => {
    cancelAnimationFrame(animationId); cancelAnimationFrame(resizeFrame); sizeObserver.disconnect();
    document.removeEventListener('visibilitychange', stopWhenHidden); gameScene.dispose();
    if (referenceObjectUrl) URL.revokeObjectURL(referenceObjectUrl);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
  };
  window.addEventListener('pagehide', event => { if (event.persisted) pause(); else dispose(); });
}

try { startReview(); }
catch (error) {
  console.error(error);
  stage.replaceChildren(); stage.className = 'error';
  stage.textContent = 'The 3D review could not start. Enable WebGL or try another browser.';
  document.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('.controls button, .controls select, .controls input').forEach(control => { control.disabled = true; });
  el('status').textContent = 'The reference image remains available. No game session was started.';
}
