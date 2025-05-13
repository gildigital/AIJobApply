import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const API_BASE_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Try to parse as JSON for more detailed error messages if possible
    let errorDetails = text;
    try {
      const jsonError = JSON.parse(text);
      if (jsonError && jsonError.message) {
        errorDetails = jsonError.message;
        if (jsonError.errors) {
          // For Zod validation errors
          errorDetails += `: ${JSON.stringify(jsonError.errors)}`;
        }
      }
    } catch (e) {
      // Not a JSON error, stick with text
    }
    throw new Error(`${res.status}: ${errorDetails}`);
  }
}

export async function apiRequest(
  method: string,
  relativePath: string,
  data?: unknown | undefined
): Promise<Response> {
  const url = `${API_BASE_URL}${relativePath}`; // Construct the full URL

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <TData = unknown>(options?: {
  on401?: UnauthorizedBehavior;
}) => QueryFunction<TData | null> =  // Adjusted return type to include null
  (
    { on401: unauthorizedBehavior } = { on401: "throw" } // Default options
  ) =>
  async <TData = unknown>({ queryKey }: { queryKey: readonly unknown[] }) => {
    const relativePath = queryKey[0] as string;
    const url = `${API_BASE_URL}${relativePath}`; // Construct the full URL

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);

    // Handle cases where response might be empty (e.g., 204 No Content)
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return null; // Or an appropriate representation of no content for your TData type
    }
    return (await res.json()) as TData;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Now pass options to getQueryFn if needed, or it uses its own default
      queryFn: getQueryFn({ on401: "throw" }) as QueryFunction<
        unknown,
        readonly unknown[],
        never
      >,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
