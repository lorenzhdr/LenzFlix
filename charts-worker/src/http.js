export function corsHeaders(request, env) {
  const h = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'X-Emby-Token',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  const origin = request.headers.get('Origin');
  if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

export function jsonResponse(body, status, request, env, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

export function preflight(request, env) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request, env), 'Access-Control-Max-Age': '86400' },
  });
}
