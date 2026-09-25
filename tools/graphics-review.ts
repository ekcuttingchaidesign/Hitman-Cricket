import './graphics-review.css';
import { GameScene } from '../src/scene/GameScene';
import { FRAMES, PLAYS, prepareReviewPose, readState, stateQuery } from './graphics-review-poses';
import type { ReviewAction, ReviewFrame, ReviewKit } from './graphics-review-poses';

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
    const [w, h] = FRAMES[state.frame];
    stage.style.width = `${w}px`; stage.style.height = `${h}px`;
    // Scale the presentation, not the simulated viewport or camera aspect.
    const scale = holder.clientWidth / w;
    stage.style.transform = `scale(${scale})`; holder.style.height = `${h * scale}px`;
    el('viewport-readout').textContent = `${w} × ${h}`;
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

  function filename(extension: string) { return `hitman-${state.action}-${state.time}ms-${state.kit}-${state.frame}.${extension}`; }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  el('save-frame').onclick = () => {
    pause(); draw();
    // Copy immediately after render; no preserveDrawingBuffer tax on gameplay.
    const source = gameScene.renderer.domElement, canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d');
    if (!context) { status('Image export is unavailable in this browser.'); return; }
    context.drawImage(source, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { status('Could not export this frame. Please try again.'); return; }
      download(blob, filename('png')); status('Scene PNG downloaded. The image contains only the game scene.');
    }, 'image/png');
  };
  el('copy-link').onclick = async () => {
    pause(); updateUrl();
    try { await navigator.clipboard.writeText(location.href); status('Review link copied. It opens this exact frozen moment.'); }
    catch { status(`Copy the address from your browser to reopen this moment: ${location.href}`); }
  };
  el('save-settings').onclick = () => {
    pause(); draw();
    const camera = gameScene.camera, renderer = gameScene.renderer;
    download(new Blob([JSON.stringify({ baselineCommit: 'd630eb4', state, viewport: FRAMES[state.frame],
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
