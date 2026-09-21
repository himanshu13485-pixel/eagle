// Public half of the agent release-signing key (see scripts/keygen.mjs).
// The updater refuses any release manifest this key doesn't verify. The private
// half lives only on the release machine — never in the repo or on the server.
export const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApIPIVI9PHygYl23ghg7k1Zn+IHfQ4rIrlb9wpZ+E6BA=
-----END PUBLIC KEY-----`;
