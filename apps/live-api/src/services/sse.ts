export function encodeSseEvent(
  encoder: TextEncoder,
  event: { id: string; type: string; data: unknown }
) {
  return encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

export function createSseEventId(...parts: Array<string | undefined | null>) {
  return parts.filter(Boolean).join(":");
}
