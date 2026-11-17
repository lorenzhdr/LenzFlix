/* global WebSocketPair, WebSocketRequestResponsePair */
// Die einzigen reinen Cloudflare-Laufzeitstellen des Mehrspielers (WebSocketPair, 101-Antwort, Auto-Ping).
// In Node nicht lauffähig; Tests ersetzen die Datei per vi.mock.

/** Neues WebSocket-Paar { client, server }. */
export function pair() {
  const p = new WebSocketPair();
  return { client: p[0], server: p[1] };
}

/** 101-Antwort mit dem zurückgegebenen Subprotokoll (ohne das schlägt der Handshake im Browser fehl). */
export function upgrade(client, proto) {
  return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': proto } });
}

/** 'ping' -> 'pong' ohne den schlafenden DO aufzuwecken. */
export function autoPing(ctx) {
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
}
