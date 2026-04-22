import type { PublicCommentDto } from "@charity/shared";

export interface LaneReservation {
  lane: number;
  startAt: number;
  durationMs: number;
  widthPx: number;
  heightPx: number;
  xPx: number;
  startY: number;
  endY: number;
}

export interface FloatingCommentPlan {
  id: string;
  text: string;
  lane: number;
  xPx: number;
  widthPx: number;
  heightPx: number;
  startY: number;
  endY: number;
  driftX: number;
  startAt: number;
  durationMs: number;
  delayMs: number;
  priority: PublicCommentDto["renderPriority"];
  mode: PublicCommentDto["displayModeHint"];
}

interface PlanOptions {
  now: number;
  viewportWidth: number;
  viewportHeight: number;
  activeCount: number;
  reservations: LaneReservation[];
}

const BASE_DURATION_MS = 7600;
const MIN_GAP_PX = 10;
const MIN_GAP_Y_PX = 16;
const MAX_LANES = 8;
const DENSE_FACTOR = 1.5;
const DELAY_CANDIDATES_MS = [0, 220, 440, 700, 1000, 1300];

export function pruneReservations(reservations: LaneReservation[], now: number) {
  return reservations.filter((reservation) => reservation.startAt + reservation.durationMs > now);
}

export function planFloatingComment(
  comment: PublicCommentDto,
  options: PlanOptions
): { plan: FloatingCommentPlan; reservation: LaneReservation } | null {
  if (comment.renderPolicy === "ADMIN_ONLY") {
    return null;
  }

  const laneCount = getLaneCount(options.viewportWidth);
  const dense = options.activeCount >= Math.floor(laneCount * DENSE_FACTOR);
  if (dense && comment.renderPolicy === "DROP_WHEN_DENSE") {
    return null;
  }

  const widthPx = estimateCommentWidth(comment.commentText, options.viewportWidth, comment.displayModeHint);
  const heightPx = getCommentHeight(comment.displayModeHint, options.viewportWidth);
  const durationMs = getDurationMs(widthPx, comment.displayModeHint);
  const startY = Math.max(0, options.viewportHeight - Math.max(88, options.viewportHeight * 0.12));
  const endY = Math.max(24, Math.round(options.viewportHeight * 0.12));
  const laneChoice = chooseLane({
    laneCount,
    reservations: options.reservations,
    now: options.now,
    widthPx,
    heightPx,
    viewportWidth: options.viewportWidth,
    durationMs,
    startY,
    endY,
    commentId: comment.commentId,
    canDelay: comment.renderPriority !== "LOW"
  });

  if (!laneChoice) {
    return null;
  }

  const startAt = options.now + laneChoice.delayMs;
  const plan: FloatingCommentPlan = {
    id: comment.commentId,
    text: comment.commentText,
    lane: laneChoice.lane,
    xPx: laneChoice.xPx,
    widthPx,
    heightPx,
    startY,
    endY,
    driftX: laneChoice.driftX,
    startAt,
    durationMs,
    delayMs: laneChoice.delayMs,
    priority: comment.renderPriority,
    mode: comment.displayModeHint
  };

  return {
    plan,
    reservation: {
      lane: laneChoice.lane,
      startAt,
      durationMs,
      widthPx,
      heightPx,
      xPx: laneChoice.xPx,
      startY,
      endY
    }
  };
}

function getLaneCount(viewportWidth: number) {
  return Math.max(3, Math.min(MAX_LANES, Math.floor(viewportWidth / 150)));
}

function estimateCommentWidth(text: string, viewportWidth: number, mode: PublicCommentDto["displayModeHint"]) {
  const fontSize = viewportWidth < 640 ? 18 : 22;
  const units = Array.from(text).reduce((sum, char) => {
    const code = char.charCodeAt(0);
    return sum + (code >= 0x20 && code <= 0x7e ? 0.62 : 1);
  }, 0);
  const compactScale = mode === "COMPACT" ? 0.88 : 1;
  return Math.min(
    Math.max(48, Math.ceil(units * fontSize * compactScale + 28)),
    Math.max(160, Math.floor(viewportWidth * 0.92))
  );
}

function getCommentHeight(mode: PublicCommentDto["displayModeHint"], viewportWidth: number) {
  if (mode === "COMPACT") return viewportWidth < 640 ? 26 : 30;
  return viewportWidth < 640 ? 31 : 36;
}

function getDurationMs(widthPx: number, mode: PublicCommentDto["displayModeHint"]) {
  if (mode === "COMPACT") return BASE_DURATION_MS - 600;
  return Math.min(BASE_DURATION_MS + 800, BASE_DURATION_MS + Math.floor(widthPx * 0.35));
}

function chooseLane({
  laneCount,
  reservations,
  now,
  widthPx,
  heightPx,
  viewportWidth,
  durationMs,
  startY,
  endY,
  commentId,
  canDelay
}: {
  laneCount: number;
  reservations: LaneReservation[];
  now: number;
  widthPx: number;
  heightPx: number;
  viewportWidth: number;
  durationMs: number;
  startY: number;
  endY: number;
  commentId: string;
  canDelay: boolean;
}) {
  const delays = canDelay ? DELAY_CANDIDATES_MS : [0];
  const lanes = orderLanes(laneCount, commentId);
  for (const delayMs of delays) {
    const startAt = now + delayMs;
    for (const lane of lanes) {
      const xPx = getLaneX(lane, laneCount, widthPx, viewportWidth);
      const driftX = getLaneDrift(commentId, lane);
      if (
        reservations.every((reservation) =>
          isSafe(reservation, startAt, durationMs, widthPx, heightPx, xPx, startY, endY)
        )
      ) {
        return { lane, xPx, driftX, delayMs };
      }
    }
  }
  return null;
}

function isSafe(
  existing: LaneReservation,
  candidateStartAt: number,
  candidateDurationMs: number,
  candidateWidthPx: number,
  candidateHeightPx: number,
  candidateXPx: number,
  candidateStartY: number,
  candidateEndY: number
) {
  if (!intervalsOverlap(
    { start: existing.xPx, end: existing.xPx + existing.widthPx },
    { start: candidateXPx, end: candidateXPx + candidateWidthPx },
    MIN_GAP_PX
  )) {
    return true;
  }

  const candidateEndAt = candidateStartAt + candidateDurationMs;
  const existingEndAt = existing.startAt + existing.durationMs;
  const overlapStart = Math.max(existing.startAt, candidateStartAt);
  const overlapEnd = Math.min(existingEndAt, candidateEndAt);
  if (overlapEnd <= overlapStart) return true;

  for (let step = 0; step <= 8; step += 1) {
    const time = overlapStart + ((overlapEnd - overlapStart) * step) / 8;
    const existingInterval = yIntervalAt(existing, time);
    const candidateInterval = yIntervalAt(
      {
        lane: -1,
        startAt: candidateStartAt,
        durationMs: candidateDurationMs,
        widthPx: candidateWidthPx,
        heightPx: candidateHeightPx,
        xPx: candidateXPx,
        startY: candidateStartY,
        endY: candidateEndY
      },
      time
    );
    if (intervalsOverlap(existingInterval, candidateInterval, MIN_GAP_Y_PX)) {
      return false;
    }
  }
  return true;
}

function yIntervalAt(reservation: LaneReservation, time: number) {
  const progress = Math.max(0, Math.min(1, (time - reservation.startAt) / reservation.durationMs));
  const top = reservation.startY + (reservation.endY - reservation.startY) * easeOutProgress(progress);
  return { start: top, end: top + reservation.heightPx };
}

function intervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
  gapPx: number
) {
  return a.start < b.end + gapPx && b.start < a.end + gapPx;
}

function getLaneX(lane: number, laneCount: number, widthPx: number, viewportWidth: number) {
  const gutter = Math.max(12, viewportWidth * 0.025);
  const usableWidth = Math.max(1, viewportWidth - gutter * 2);
  const laneWidth = usableWidth / laneCount;
  const center = gutter + laneWidth * (lane + 0.5);
  return Math.round(Math.max(gutter, Math.min(viewportWidth - widthPx - gutter, center - widthPx / 2)));
}

function orderLanes(laneCount: number, seed: string) {
  const start = hashString(seed) % laneCount;
  return Array.from({ length: laneCount }, (_, index) => (start + index) % laneCount);
}

function getLaneDrift(seed: string, lane: number) {
  const direction = (hashString(`${seed}:${lane}`) % 2 === 0) ? 1 : -1;
  const distance = 10 + (hashString(`${lane}:${seed}`) % 18);
  return direction * distance;
}

function easeOutProgress(progress: number) {
  return 1 - Math.pow(1 - progress, 1.8);
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
