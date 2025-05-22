import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from './logger';

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);
	}
}

interface Env {
	MERGE_MCP_SERVER_URL: string;
	MERGE_TENANT: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Configure CORS
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Account-Token',
				},
			});
		}

		try {
			const url = new URL(request.url);
			
			// Only proxy /sse endpoint
			if (url.pathname !== '/sse') {
				return new Response('Not Found', { status: 404 });
			}

			// Validate auth token
			const accountToken = request.headers.get('X-Account-Token');
			if (!accountToken) {
				return new Response('Unauthorized', { status: 401 });
			}

			// Forward request to Python MCP server
			const mcpServerUrl = new URL('/sse', env.MERGE_MCP_SERVER_URL);
			
			const response = await fetch(mcpServerUrl, {
				method: request.method,
				headers: {
					'Authorization': `Bearer ${accountToken}`,
					'Content-Type': 'text/event-stream',
					'X-Merge-Tenant': env.MERGE_TENANT,
				},
			});

			// Stream response back to client
			return new Response(response.body, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
					'Access-Control-Allow-Origin': '*',
				},
			});

		} catch (error) {
			logger.error('Error in MCP proxy:', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};
