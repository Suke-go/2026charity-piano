import { nowIso } from "../lib/time";
import type { RoomMode, RoomStateDto } from "@charity/shared";

export interface StoredRoomState {
  mode: RoomMode;
  slowModeIntervalSec: number;
  updatedAt: string;
}

export async function loadRoomState(storage: DurableObjectStorage): Promise<StoredRoomState> {
  const existing = await storage.get<StoredRoomState>("room-state");
  if (existing) return existing;
  const initial = {
    mode: "OPEN" as const,
    slowModeIntervalSec: 0,
    updatedAt: nowIso()
  };
  await storage.put("room-state", initial);
  return initial;
}

export async function saveRoomState(
  storage: DurableObjectStorage,
  state: Omit<StoredRoomState, "updatedAt">
): Promise<RoomStateDto> {
  const updatedAt = nowIso();
  const next = { ...state, updatedAt };
  await storage.put("room-state", next);
  return next;
}
