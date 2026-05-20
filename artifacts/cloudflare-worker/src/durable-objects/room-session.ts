/**
 * RoomSession Durable Object
 *
 * One DO instance per live room. Manages:
 *  - Speaker hand-raise queue
 *  - Room participant count (authoritative source, future)
 *  - Rate limiting per room
 *  - WebSocket upgrade (future — enables DO-powered presence)
 *
 * Current status: scaffold only. Supabase Realtime handles
 * presence in V1. DOs take over when we need sub-100ms
 * globally-consistent room state.
 */

export class RoomSession implements DurableObject {
  private state: DurableObjectState;
  private handQueue: string[] = []; // user IDs in hand-raise order

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/raise-hand" && request.method === "POST") {
      return this.handleRaiseHand(request);
    }
    if (path === "/lower-hand" && request.method === "POST") {
      return this.handleLowerHand(request);
    }
    if (path === "/queue" && request.method === "GET") {
      return Response.json({ queue: this.handQueue });
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleRaiseHand(req: Request): Promise<Response> {
    const { userId } = await req.json<{ userId: string }>();
    if (!this.handQueue.includes(userId)) {
      this.handQueue.push(userId);
      await this.state.storage.put("handQueue", this.handQueue);
    }
    return Response.json({ ok: true, position: this.handQueue.indexOf(userId) + 1 });
  }

  private async handleLowerHand(req: Request): Promise<Response> {
    const { userId } = await req.json<{ userId: string }>();
    this.handQueue = this.handQueue.filter((id) => id !== userId);
    await this.state.storage.put("handQueue", this.handQueue);
    return Response.json({ ok: true });
  }
}
