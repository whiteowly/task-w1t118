<script lang="ts">
  import { onMount } from 'svelte';

  export let value = '';
  export let disabled = false;

  let canvasElement: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let hasStroke = false;

  const CANVAS_WIDTH = 560;
  const CANVAS_HEIGHT = 180;

  function initializeCanvas(): void {
    context = canvasElement.getContext('2d');
    if (!context) {
      return;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.strokeStyle = '#101828';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }

  function pointFromEvent(event: PointerEvent): { x: number; y: number } {
    const rect = canvasElement.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function beginDrawing(event: PointerEvent): void {
    if (disabled || !context) {
      return;
    }

    event.preventDefault();
    isDrawing = true;
    hasStroke = true;
    const point = pointFromEvent(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function continueDrawing(event: PointerEvent): void {
    if (!isDrawing || !context) {
      return;
    }

    event.preventDefault();
    const point = pointFromEvent(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    value = canvasElement.toDataURL('image/png');
  }

  function finishDrawing(event: PointerEvent): void {
    if (!isDrawing) {
      return;
    }

    event.preventDefault();
    isDrawing = false;
    value = hasStroke ? canvasElement.toDataURL('image/png') : '';
  }

  export function clearSignature(): void {
    if (!context) {
      return;
    }

    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    hasStroke = false;
    value = '';
  }

  onMount(() => {
    initializeCanvas();
  });
</script>

<div class="signature-canvas">
  <canvas
    bind:this={canvasElement}
    width={CANVAS_WIDTH}
    height={CANVAS_HEIGHT}
    aria-label="Drawn signature"
    on:pointerdown={beginDrawing}
    on:pointermove={continueDrawing}
    on:pointerup={finishDrawing}
    on:pointerleave={finishDrawing}
  ></canvas>
  <button type="button" on:click={clearSignature} {disabled}>Clear drawn signature</button>
</div>

<style>
  .signature-canvas {
    display: grid;
    gap: 0.5rem;
  }

  canvas {
    width: 100%;
    min-height: 12rem;
    border: 1px dashed #98a2b3;
    border-radius: 0.45rem;
    background: #fff;
    touch-action: none;
  }

  button {
    width: fit-content;
  }
</style>
