// Backend Service for Genuine Swiggy Instamart Builders Club MCP Integration
// Implements OAuth 2.1 with PKCE, Dynamic Client Registration (RFC 7591), and JSON-RPC tool proxies to https://mcp.swiggy.com/im

const SWIGGY_BASE = "https://mcp.swiggy.com";
const AUTH_ENDPOINT = `${SWIGGY_BASE}/auth/authorize`;
const TOKEN_ENDPOINT = `${SWIGGY_BASE}/auth/token`;
const REGISTER_ENDPOINT = `${SWIGGY_BASE}/auth/register`;
const IM_MCP_ENDPOINT = `${SWIGGY_BASE}/im`;

let cachedDynamicClientId: string | null = null;
let cachedDynamicClientSecret: string | null = null;

export function resetCachedDynamicClient() {
  cachedDynamicClientId = null;
  cachedDynamicClientSecret = null;
}

export function getSwiggyConfig() {
  let envClientId = process.env.SWIGGY_CLIENT_ID || process.env.VITE_SWIGGY_CLIENT_ID || "";
  if (envClientId === "demo_client_id") {
    envClientId = "";
  }
  const envClientSecret = process.env.SWIGGY_CLIENT_SECRET || "";
  let redirectUri = process.env.VITE_SWIGGY_REDIRECT_URI || "http://localhost:8000/auth/callback";
  
  // Swiggy Builders Club OAuth server strictly rejects https:// on localhost (returns "Local Application isn't whitelisted yet")
  // For local development, Swiggy officially pre-whitelists http://localhost:8000/auth/callback
  if (redirectUri.includes("add-product") || redirectUri.includes("5173") || redirectUri.startsWith("https://localhost")) {
    redirectUri = "http://localhost:8000/auth/callback";
  }

  // Official default client_id for Swiggy Builders Club MCP
  const clientId = envClientId || cachedDynamicClientId || "swiggy-mcp";

  return {
    clientId,
    clientSecret: envClientSecret || cachedDynamicClientSecret || "",
    isDynamic: !envClientId && !!cachedDynamicClientId,
    hasConfiguredCredentials: Boolean(envClientId || cachedDynamicClientId || clientId),
    authEndpoint: AUTH_ENDPOINT,
    tokenEndpoint: TOKEN_ENDPOINT,
    registerEndpoint: REGISTER_ENDPOINT,
    mcpEndpoint: IM_MCP_ENDPOINT,
    redirectUri
  };
}

/**
 * Attempts Dynamic Client Registration (RFC 7591) against Swiggy Builders Club.
 */
export async function registerDynamicClient(customRedirectUri?: string) {
  const config = getSwiggyConfig();
  const redirectUri = customRedirectUri || config.redirectUri;

  console.log(`[SwiggyBackend] Attempting Dynamic Client Registration at ${REGISTER_ENDPOINT}...`);

  try {
    const res = await fetch(REGISTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        client_name: "AI Smart Pantry Instamart Client",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: "im"
      })
    });

    const bodyText = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = { raw: bodyText };
    }

    if (!res.ok) {
      console.warn(`[SwiggyBackend] Dynamic registration returned HTTP ${res.status}:`, bodyText);
      return {
        success: false,
        status: res.status,
        error: data.error_description || data.error || data.message || bodyText,
        requiresApproval: res.status === 403 || res.status === 401,
        message: "Swiggy Dynamic Client Registration requires partner approval or whitelisted credentials."
      };
    }

    if (data.client_id) {
      cachedDynamicClientId = data.client_id;
      if (data.client_secret) cachedDynamicClientSecret = data.client_secret;
      console.log(`[SwiggyBackend] Dynamic Client Registered successfully: ID = ${data.client_id}`);
      return {
        success: true,
        clientId: data.client_id,
        clientSecret: data.client_secret || null,
        redirectUri
      };
    }

    return {
      success: false,
      error: "No client_id returned by registration endpoint.",
      data
    };
  } catch (err: any) {
    console.error("[SwiggyBackend] Dynamic Client Registration network error:", err);
    return {
      success: false,
      error: err.message || "Failed to reach Swiggy Dynamic Client Registration endpoint."
    };
  }
}

/**
 * Exchanges authorization code and PKCE code_verifier for an official Swiggy access token.
 */
export async function exchangeSwiggyToken(code: string, codeVerifier: string, customRedirectUri?: string) {
  const config = getSwiggyConfig();
  const clientId = config.clientId;
  const redirectUri = customRedirectUri || config.redirectUri;

  if (!clientId) {
    throw new Error("Swiggy Client ID is missing. Partner whitelisting or Client Registration is required.");
  }
  if (!code) {
    throw new Error("Missing authorization code for token exchange.");
  }
  if (!codeVerifier) {
    throw new Error("Missing PKCE code_verifier for token exchange.");
  }

  console.log(`[SwiggyBackend] Exchanging authorization code at ${TOKEN_ENDPOINT}...`);

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  if (config.clientSecret) {
    params.set("client_secret", config.clientSecret);
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: params.toString()
  });

  const bodyText = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = { raw: bodyText };
  }

  if (!res.ok) {
    console.error(`[SwiggyBackend] Token exchange failed with HTTP ${res.status}:`, bodyText);
    const errorMsg = data.error_description || data.error || data.message || `HTTP ${res.status} Token Exchange Error`;
    throw new Error(errorMsg);
  }

  if (!data.access_token) {
    throw new Error("Swiggy token response did not contain access_token.");
  }

  console.log("[SwiggyBackend] Real Swiggy token granted successfully!");
  return {
    accessToken: data.access_token,
    tokenType: data.token_type || "Bearer",
    expiresIn: data.expires_in || 3600,
    scope: data.scope || "im",
    refreshToken: data.refresh_token || null
  };
}

/**
 * Calls an official MCP Tool on https://mcp.swiggy.com/im via streamable JSON-RPC.
 */
export async function invokeSwiggyMcpTool(toolName: string, toolArguments: Record<string, any> = {}, accessToken: string) {
  if (!accessToken) {
    throw new Error("Unauthorized: Swiggy access token is required to invoke MCP tools.");
  }

  console.log(`[SwiggyBackend] Invoking MCP tool "${toolName}" on ${IM_MCP_ENDPOINT}...`, toolArguments);

  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArguments
    }
  };

  const res = await fetch(IM_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  const bodyText = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = { raw: bodyText };
  }

  if (!res.ok) {
    console.error(`[SwiggyBackend] MCP tool "${toolName}" invocation failed (HTTP ${res.status}):`, bodyText);
    throw new Error(data.error?.message || data.message || `Swiggy MCP Tool Call Failed (HTTP ${res.status})`);
  }

  if (data.error) {
    console.error(`[SwiggyBackend] MCP tool "${toolName}" returned JSON-RPC error:`, data.error);
    throw new Error(data.error.message || "MCP Tool invocation returned an error.");
  }

  return data.result;
}
