import type { RoomStateDto } from "@charity/shared";

export function RoomStatusBanner({ roomState }: { roomState: RoomStateDto | null }) {
  if (!roomState) {
    return <div className="room-banner room-unknown">Room state is loading.</div>;
  }

  if (roomState.mode === "OPEN") {
    return <div className="room-banner room-open">Comments are open.</div>;
  }

  if (roomState.mode === "SLOW") {
    return (
      <div className="room-banner room-slow">
        Slow mode is active. Wait {roomState.slowModeIntervalSec} seconds between comments.
      </div>
    );
  }

  return <div className="room-banner room-closed">Comments are closed right now.</div>;
}
