const KROGER_BASE = "https://api.kroger.com/v1";
const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("KROGER_CLIENT_ID and KROGER_CLIENT_SECRET are required");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kroger auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

export interface KrogerProduct {
  productId: string;
  upc: string;
  description: string;
  brand: string;
  size: string;
  price: {
    regular: number;
    promo: number | null;
  } | null;
  images: { perspective: string; sizes: { size: string; url: string }[] }[];
}

export interface KrogerLocation {
  locationId: string;
  name: string;
  chain: string;
  address: {
    addressLine1: string;
    city: string;
    state: string;
    zipCode: string;
  };
  geolocation: {
    latitude: number;
    longitude: number;
  };
}

export async function searchProducts(
  term: string,
  locationId?: string,
  limit: number = 10
): Promise<KrogerProduct[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    "filter.term": term,
    "filter.limit": limit.toString(),
  });

  if (locationId) {
    params.set("filter.locationId", locationId);
  }

  const res = await fetch(`${KROGER_BASE}/products?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kroger products search failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.data || []).map((item: Record<string, unknown>) => {
    const priceData = item.items && Array.isArray(item.items) && item.items[0]
      ? (item.items[0] as Record<string, unknown>)
      : null;

    return {
      productId: item.productId,
      upc: item.upc || "",
      description: item.description || "",
      brand: item.brand || "",
      size: priceData?.size || "",
      price: priceData?.price
        ? {
            regular: (priceData.price as Record<string, number>).regular || 0,
            promo: (priceData.price as Record<string, number>).promo || null,
          }
        : null,
      images: item.images || [],
    };
  });
}

export async function searchLocations(
  zipCode: string,
  limit: number = 10
): Promise<KrogerLocation[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    "filter.zipCode.near": zipCode,
    "filter.limit": limit.toString(),
    "filter.radiusInMiles": "25",
  });

  const res = await fetch(`${KROGER_BASE}/locations?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kroger locations search failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.data || []).map((loc: Record<string, unknown>) => ({
    locationId: loc.locationId,
    name: loc.name || "",
    chain: loc.chain || "",
    address: loc.address || {},
    geolocation: loc.geolocation || {},
  }));
}
