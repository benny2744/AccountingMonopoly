/** Shared helpers for server integration tests. */
const B = (port: number) => `http://127.0.0.1:${port}`;

export async function loginAdmin(port: number): Promise<string> {
  const r = await fetch(`${B(port)}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const json = (await r.json()) as { adminToken: string };
  return json.adminToken;
}

export async function post(
  port: number,
  path: string,
  body: unknown,
  opts?: { token?: string; adminToken?: string },
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const r = await fetch(`${B(port)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts?.adminToken ? { "X-Admin-Token": opts.adminToken } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  return { ok: r.ok, status: r.status, json };
}

export async function get(port: number, path: string, token?: string): Promise<unknown> {
  const r = await fetch(`${B(port)}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  return r.json();
}
