export class AccountRegistryDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/accounts" && request.method === "GET") {
      const accountIds =
        (await this.state.storage.get<string[]>("accountIds")) ?? [];
      return Response.json(accountIds);
    }

    if (url.pathname === "/clear" && request.method === "POST") {
      await this.state.storage.deleteAll();
      return Response.json({ ok: true });
    }

    if (url.pathname === "/register" && request.method === "POST") {
      const body = (await request.json()) as { userId: string };
      const accountIds =
        (await this.state.storage.get<string[]>("accountIds")) ?? [];

      if (!accountIds.includes(body.userId)) {
        await this.state.storage.put("accountIds", [...accountIds, body.userId]);
      }

      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }
}
