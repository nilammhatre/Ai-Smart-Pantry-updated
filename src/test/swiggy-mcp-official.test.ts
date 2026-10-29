import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  realSwiggyProvider,
  TOKEN_KEY
} from "../services/swiggy/realProvider.js";
import {
  getSwiggyConfig,
  registerDynamicClient,
  exchangeSwiggyToken,
  invokeSwiggyMcpTool,
  getSwiggyUserInfo,
  parseJwtClaims,
  resetCachedDynamicClient
} from "../server/services/swiggyBackend.js";

describe("Official Swiggy Builders Club MCP & OAuth 2.1 Implementation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete process.env.SWIGGY_CLIENT_ID;
    delete process.env.VITE_SWIGGY_CLIENT_ID;
    resetCachedDynamicClient();
    vi.restoreAllMocks();
  });

  describe("1. PKCE (RFC 7636) & OAuth 2.1 Cryptographic Validation", () => {
    it("generates a high-entropy PKCE code verifier", () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();

      expect(typeof verifier1).toBe("string");
      expect(verifier1.length).toBeGreaterThanOrEqual(43);
      expect(verifier1).not.toBe(verifier2);
    });

    it("generates a standard SHA-256 S256 code challenge with URL-safe base64", async () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = await generateCodeChallenge(verifier);

      expect(typeof challenge).toBe("string");
      expect(challenge).not.toContain("+");
      expect(challenge).not.toContain("/");
      expect(challenge).not.toContain("=");
    });

    it("ensures Swiggy official endpoints match Builders Club documentation", () => {
      const config = getSwiggyConfig();
      expect(config.authEndpoint).toBe("https://mcp.swiggy.com/auth/authorize");
      expect(config.tokenEndpoint).toBe("https://mcp.swiggy.com/auth/token");
      expect(config.registerEndpoint).toBe("https://mcp.swiggy.com/auth/register");
      expect(config.mcpEndpoint).toBe("https://mcp.swiggy.com/im");
      expect(config.redirectUri).toContain("/auth/callback");
      expect(config.redirectUri).not.toContain("add-product");
    });
  });

  describe("2. Dynamic Client Registration (RFC 7591)", () => {
    it("posts standard client metadata to https://mcp.swiggy.com/auth/register", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            client_id: "swiggy_client_dynamic_123",
            client_name: "AI Smart Pantry Instamart Client"
          })
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await registerDynamicClient("https://localhost:8080/app/shopping");
      expect(result.success).toBe(true);
      expect(result.clientId).toBe("swiggy_client_dynamic_123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://mcp.swiggy.com/auth/register",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: expect.stringContaining("AI Smart Pantry Instamart Client")
        })
      );
    });

    it("gracefully catches 403 / 401 partner whitelisting requirements without throwing uncaught exceptions", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            error: "forbidden",
            error_description: "Local Application isn't whitelisted yet"
          })
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await registerDynamicClient();
      expect(result.success).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.message).toContain("partner approval or whitelisted credentials");
    });
  });

  describe("3. Backend Token Exchange (RFC 6749)", () => {
    it("throws if code or clientId is missing or unwhitelisted", async () => {
      delete process.env.SWIGGY_CLIENT_ID;
      delete process.env.VITE_SWIGGY_CLIENT_ID;
      await expect(exchangeSwiggyToken("valid_code", "verifier")).rejects.toThrow(
        /Swiggy Client ID is missing|Local Application isn't whitelisted yet/i
      );

      process.env.SWIGGY_CLIENT_ID = "swiggy_client_id_test";
      await expect(exchangeSwiggyToken("", "verifier")).rejects.toThrow(
        /Missing authorization code/i
      );
    });

    it("exchanges code & verifier against /auth/token and returns real access token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "swiggy_live_mcp_jwt_98765",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "im"
          })
      });
      vi.stubGlobal("fetch", mockFetch);

      // Set environment or dynamic client id
      process.env.SWIGGY_CLIENT_ID = "swiggy_client_registered_101";

      const tokenRes = await exchangeSwiggyToken("auth_code_xyz", "verifier_123");
      expect(tokenRes.accessToken).toBe("swiggy_live_mcp_jwt_98765");
      expect(tokenRes.tokenType).toBe("Bearer");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://mcp.swiggy.com/auth/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded"
          })
        })
      );
    });
  });

  describe("4. Swiggy Instamart JSON-RPC MCP Tools Proxy", () => {
    it("proxies tool calls to https://mcp.swiggy.com/im with Bearer token authorization", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    products: [
                      {
                        item_id: "prod_amul_milk",
                        name: "Amul Taaza Toned Milk (500ml)",
                        price: 28,
                        category: "Dairy"
                      }
                    ]
                  })
                }
              ]
            }
          })
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await invokeSwiggyMcpTool(
        "search_products",
        { query: "milk" },
        "swiggy_valid_token_xyz"
      );

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://mcp.swiggy.com/im",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer swiggy_valid_token_xyz"
          }),
          body: expect.stringContaining("search_products")
        })
      );
    });

    it("rejects unauthorized MCP tool execution when token is missing", async () => {
      await expect(invokeSwiggyMcpTool("get_cart", {}, "")).rejects.toThrow(/Unauthorized/i);
    });
  });

  describe("5. Real Swiggy Provider Authenticity & Security Enforcement", () => {
    it("refuses to search products, cart or tracking when disconnected (never fakes data in real mode)", async () => {
      localStorage.removeItem(TOKEN_KEY);
      expect(realSwiggyProvider.isConnected()).toBe(false);

      await expect(realSwiggyProvider.searchProducts("bread")).rejects.toThrow(/Unauthorized/i);
      await expect(realSwiggyProvider.getCart()).rejects.toThrow(/Unauthorized/i);
      await expect(realSwiggyProvider.getOrders()).rejects.toThrow(/Unauthorized/i);
      await expect(realSwiggyProvider.trackOrder("order_123")).rejects.toThrow(/Unauthorized/i);
      await expect(realSwiggyProvider.sendCartToSwiggy([{ name: "Bread" }])).rejects.toThrow(/Unauthorized/i);
    });

    it("properly maps genuine product search results from MCP content payload", async () => {
      localStorage.setItem(TOKEN_KEY, "test_authorized_token");
      expect(realSwiggyProvider.isConnected()).toBe(true);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  products: [
                    {
                      item_id: "item_p1",
                      name: "Britannia 100% Whole Wheat Bread (400g)",
                      price: 48,
                      category: "Bakery",
                      quantity_unit: "pack"
                    }
                  ]
                })
              }
            ]
          }
        })
      });
      vi.stubGlobal("fetch", mockFetch);

      const items = await realSwiggyProvider.searchProducts("bread");
      expect(items.length).toBe(1);
      expect(items[0].name).toContain("Whole Wheat Bread");
      expect(items[0].price).toBe(48);
      expect(items[0].category).toBe("Bakery");
    });

    it("parses genuine get_orders MCP response with items and categories", async () => {
      localStorage.setItem(TOKEN_KEY, "test_authorized_token");
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  orders: [
                    {
                      order_id: "swiggy_real_99812",
                      order_time: "2026-10-29T18:30:00Z",
                      order_status: "delivered",
                      total_amount: 142.50,
                      items: [
                        { name: "Amul Taaza Milk 500ml", quantity: 2, price: 28, category: "Dairy" },
                        { name: "Whole Wheat Bread 400g", quantity: 1, price: 45, category: "Bakery" }
                      ]
                    }
                  ]
                })
              }
            ]
          }
        })
      });
      vi.stubGlobal("fetch", mockFetch);

      const orders = await realSwiggyProvider.getOrders();
      expect(orders.length).toBe(1);
      expect(orders[0].orderId).toBe("swiggy_real_99812");
      expect(orders[0].items.length).toBe(2);
      expect(orders[0].items[0].name).toBe("Amul Taaza Milk 500ml");
      expect(orders[0].totalAmount).toBe(142.50);
    });

    it("extracts verified user identity from JWT claims without falling back to profile", async () => {
      // Craft a standard base64url JWT payload
      const payload = {
        sub: "swiggy_user_987654321",
        name: "Rahul Sharma",
        email: "rahul.sharma@example.com",
        phone_number: "+919876543210"
      };
      const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64}.fakeSignature`;

      const claims = parseJwtClaims(fakeJwt);
      expect(claims).toBeDefined();
      expect(claims?.name).toBe("Rahul Sharma");
      expect(claims?.sub).toBe("swiggy_user_987654321");

      const userInfo = await getSwiggyUserInfo(fakeJwt);
      expect(userInfo.authenticated).toBe(true);
      expect(userInfo.verifiedName).toBe("Rahul Sharma");
      expect(userInfo.verifiedEmail).toBe("rahul.sharma@example.com");
      expect(userInfo.userId).toBe("swiggy_user_987654321");
    });

    it("requires Accept: application/json, text/event-stream for official MCP endpoint", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ jsonrpc: "2.0", result: { content: [] } })
      });
      vi.stubGlobal("fetch", mockFetch);

      await invokeSwiggyMcpTool("get_orders", { limit: 10 }, "swiggy_token_123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://mcp.swiggy.com/im",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json, text/event-stream"
          })
        })
      );
    });
  });
});
