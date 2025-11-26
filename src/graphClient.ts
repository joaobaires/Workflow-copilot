import { ConfidentialClientApplication } from "@azure/msal-node";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const SCOPES = ["https://graph.microsoft.com/.default"];

export interface GraphClientOptions {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export class GraphClient {
  private app: ConfidentialClientApplication;

  constructor(private readonly options: GraphClientOptions) {
    this.app = new ConfidentialClientApplication({
      auth: {
        authority: `https://login.microsoftonline.com/${options.tenantId}`,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
      },
    });
  }

  private async getToken(): Promise<string> {
    const result = await this.app.acquireTokenByClientCredential({
      scopes: SCOPES,
    });
    if (!result?.accessToken) {
      throw new Error("Failed to acquire Microsoft Graph token");
    }
    return result.accessToken;
  }

  private async request(path: string, init?: RequestInit): Promise<any> {
    const token = await this.getToken();
    const res = await fetch(`${GRAPH_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph request failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async getChannelMessages(
    teamId: string,
    channelId: string,
    options: { top?: number; lookbackHours?: number } = {}
  ): Promise<Record<string, any>[]> {
    const params = new URLSearchParams();
    if (options.top) params.set("$top", String(options.top));
    if (options.lookbackHours) {
      const start = new Date(Date.now() - options.lookbackHours * 60 * 60 * 1000).toISOString();
      params.set("$filter", `createdDateTime ge ${start}`);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await this.request(`/teams/${teamId}/channels/${channelId}/messages${query}`);
    return data.value ?? [];
  }

  async sendChannelMessage(teamId: string, channelId: string, message: string): Promise<any> {
    return this.request(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: { contentType: "html", content: message } }),
    });
  }

  async getRecentMessages(teamId: string, channelId: string, top = 40, lookbackHours = 24) {
    return this.getChannelMessages(teamId, channelId, { top, lookbackHours });
  }
}
