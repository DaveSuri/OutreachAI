export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function validateBasicAuthHeader(
  headerValue: string | null,
  expectedUsername: string,
  expectedPassword: string
): boolean {
  if (!headerValue || !headerValue.startsWith("Basic ")) {
    return false;
  }

  const encoded = headerValue.slice(6).trim();

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return false;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return username === expectedUsername && password === expectedPassword;
  } catch {
    return false;
  }
}
