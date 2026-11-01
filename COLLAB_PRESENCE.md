# Collaboration presence

Group heartbeats use an authenticated `/rooms/:id/presence` endpoint. The hub keeps only the latest encrypted envelope for each active member in memory, with a 90 second expiry. Updates neither rewrite `hub.json` nor consume its event count/byte allowance. Restarting the hub starts with no online presence; durable messages remain intact.

The hub derives sender identity from the membership token. Viewers cannot publish or clear presence. Audience validation and AES-GCM room/event/sender/audience binding match normal room transport. Presence is limited to a 4KB encrypted envelope and a 1KB plaintext client payload, with at most one row per member. Private provider keys never enter presence.

Event polling includes a separate `presence` snapshot. The client replaces a bounded local `room_presence` snapshot and returns only durable events from `pull()`. Presence has no durable sequence and cannot advance a history cursor. The synthetic local sort value is only for compatibility with the group view; it is never submitted as a durable event sequence. Legacy stored heartbeat events remain readable. A newer client requires a hub supporting the presence endpoint; it does not silently fall back to storing repeated durable heartbeats.

Explicit presence clearing, room leave and owner revocation remove the appropriate live row. A disconnected client expires naturally. Reconnecting with the same membership updates that same member row, rather than creating a second identity. This provides liveness hints, not proof that an agent is executing or that its computer is reachable.

Regression coverage sends 10,020 authenticated HTTP heartbeat updates against a one-event room allowance, then successfully publishes a real durable message. Additional checks cover ten members, reconnect identity, expiry, leave, revocation, viewer restrictions, audience visibility, bounded envelopes, legacy heartbeat compatibility and an empty presence snapshot after hub restart. These local transport tests do not claim verification of hosted multi-machine networking.
