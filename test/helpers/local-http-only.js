// Loaded before a release browser test. Individual tests can still inject mock
// providers, but an accidental real model fetch cannot leave this machine.
const networkFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!["127.0.0.1", "127.0.0.2", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Release verification refuses non-local HTTP requests");
  return networkFetch(input, options);
};
