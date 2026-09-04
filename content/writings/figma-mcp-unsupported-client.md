---
title: Using Figma MCP with any Coding Agent
date: 2026-09-04
type: Post
description: Workaround for using Figma MCP with unsupported harnesses.
published: true
tags:
  - ai
---

If you have used Figma MCP with Claude Code, you know it works like a charm.

Often times, I keep experimenting with a lot of coding harnesses. At the time of writing, my recent obsession is [omp](omp.sh). It is `pi` with "batteries included".

Figma has a limited set of clients it supports for the MCP usage. And naturally, `omp` is not in it.

## Workaround

We first make a request to register a client named Claude Code.

```bash
curl -X POST https://api.figma.com/v1/oauth/mcp/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Claude Code (figma)",
    "redirect_uris": ["http://127.0.0.1:19876/mcp/oauth/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

You get back `clientId` and `clientSecret`.

Then we add MCP to omp by using these OAuth parameters (Once you add and the auth fails, you get the instructions to customize the parameters).

If you are using opencode, the config would look something like this.

```js
figma: {
  enabled: true,
  type: "remote",
  url: "https://mcp.figma.com/mcp",
  oauth: {
    clientId: "<client_id from response>",
    clientSecret: "<client_secret from response>"
  }
}
```

A browser tab opens for auth. Once approved, the MCP gets added and life is good.

Happy Hacking.