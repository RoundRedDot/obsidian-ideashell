import { requestUrl, RequestUrlResponse } from 'obsidian';

/**
 * Minimal MCP (Streamable HTTP, JSON-RPC 2.0) client for the ideashell MCP endpoint.
 *
 * Protocol (as implemented by ideashell-server):
 *  - every POST needs `Authorization: Bearer <access key>` and `Accept: application/json`
 *  - `initialize` returns an `Mcp-Session-Id` header; all later calls must send it back
 *  - a 400/404 on a later call means the session expired → re-initialize once and retry
 *  - tool results come back as { content: [{type:'text', text}], isError }
 */

const PROTOCOL_VERSION = '2025-06-18';
const HEADER_SESSION = 'mcp-session-id';

export interface McpToolResult {
	content?: Array<{ type: string; text?: string }>;
	isError?: boolean;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id?: number | string | null;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export class McpError extends Error {
	constructor(message: string, public status?: number) {
		super(message);
		this.name = 'McpError';
	}
}

export class McpClient {
	private sessionId: string | null = null;
	private nextId = 1;
	private initializing: Promise<void> | null = null;

	constructor(
		private endpoint: string,
		private accessKey: string,
		private clientVersion: string,
	) {}

	reset(): void {
		this.sessionId = null;
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<string> {
		const result = (await this.request('tools/call', { name, arguments: args })) as McpToolResult;
		const text = (result.content ?? [])
			.filter((c) => c.type === 'text' && typeof c.text === 'string')
			.map((c) => c.text as string)
			.join('\n');
		if (result.isError) {
			throw new McpError(text || `tool ${name} failed`);
		}
		return text;
	}

	private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
		await this.ensureSession();
		let res = await this.post(method, params);
		if (res.status === 400 || res.status === 404) {
			// Session gone (server restart / TTL). Re-initialize once.
			this.sessionId = null;
			await this.ensureSession();
			res = await this.post(method, params);
		}
		return this.unwrap(res, method);
	}

	private ensureSession(): Promise<void> {
		if (this.sessionId) return Promise.resolve();
		if (!this.initializing) {
			this.initializing = this.initialize().finally(() => {
				this.initializing = null;
			});
		}
		return this.initializing;
	}

	private async initialize(): Promise<void> {
		if (!this.endpoint) throw new McpError('ideashell endpoint is not configured');
		if (!this.accessKey) throw new McpError('ideashell access key is not configured');
		const res = await this.post('initialize', {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: 'obsidian-ideashell', version: this.clientVersion },
		});
		this.unwrap(res, 'initialize');
		const sid = res.headers[HEADER_SESSION] ?? res.headers['Mcp-Session-Id'];
		if (!sid) throw new McpError('server did not return a session id');
		this.sessionId = sid;
		// Notification; server answers 202 and ignores errors.
		await this.post('notifications/initialized', {}, true).catch(() => undefined);
	}

	private async post(method: string, params: Record<string, unknown>, notification = false): Promise<RequestUrlResponse> {
		const body: Record<string, unknown> = { jsonrpc: '2.0', method, params };
		if (!notification) body.id = this.nextId++;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${this.accessKey}`,
			'MCP-Protocol-Version': PROTOCOL_VERSION,
		};
		if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
		return requestUrl({
			url: this.endpoint,
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			throw: false,
		});
	}

	private unwrap(res: RequestUrlResponse, method: string): unknown {
		if (res.status === 401) throw new McpError('Access key rejected (401). Check the key in settings.', 401);
		if (res.status === 429) throw new McpError('Rate limited by ideashell (429). Try again in a minute.', 429);
		if (res.status < 200 || res.status >= 300) {
			throw new McpError(`ideashell ${method} failed: HTTP ${res.status}`, res.status);
		}
		let json: JsonRpcResponse;
		try {
			json = res.json as JsonRpcResponse;
		} catch {
			throw new McpError(`ideashell ${method}: invalid JSON response`);
		}
		if (json.error) {
			throw new McpError(`ideashell ${method}: ${json.error.message} (${json.error.code})`);
		}
		return json.result;
	}
}
