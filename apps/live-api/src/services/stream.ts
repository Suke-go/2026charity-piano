export function buildStreamEmbedUrl(customerSubdomain: string | undefined, playbackUid: string | null) {
  if (!playbackUid || !customerSubdomain) return null;
  return `https://iframe.videodelivery.net/${playbackUid}`;
}
