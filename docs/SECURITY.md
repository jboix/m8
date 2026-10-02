# Security Policy

## Supported Versions

At any given time we support the _latest_ version of m8 (as reflected in the
_main_ branch) with security updates.

## Reporting a Vulnerability

If you think you have found a vulnerability, please report it responsibly.
Do not create a GitHub issue for a security problem. Instead,
[report a vulnerability](https://github.com/jboix/m8/security/advisories/new)
privately on GitHub, and we will look into it as soon as we can.

We appreciate any responsible disclosure of vulnerabilities that might impact
the integrity of our users and their projects. We do not offer bounties, but
if you wish we will credit you in the release notes.

## What to keep in mind when running m8

m8 streams a camera and a microphone to Gemini, holds your Gemini key, and keeps
a memory of what it was told. Four things follow from that:

- **Set `M8_ACCESS_KEY` before the server is reachable by anybody else.** Without
  it, anyone with the URL can open sessions on your Gemini key, replace the key,
  and read, edit and delete the memory. With it, the page asks each browser for
  the access key once. `bun run start` listens on every interface by default;
  `--host 127.0.0.1` keeps it to the machine.
- **The Gemini key never leaves the server.** You give it once in the setup
  screen. The server checks it with Gemini, seals it with AES-256-GCM in its
  database, and shows the browser only its last four characters. A change that
  sends the key, or a request to a provider, from the browser is a
  vulnerability, not a feature.
- **The key that seals it is `keys/secret.key`**, generated on first start with
  mode 0600, apart from the database. Back it up apart from `data/`, and keep
  both out of anything you share.
- **The memory is one SQLite file**, `data/m8.sqlite` by default. It is not
  encrypted. It holds transcripts, facts, and face embeddings when face
  learning is on. Treat it like any other file holding personal notes.

Before reporting, make sure you are on the latest version of m8 and a supported
Bun version (1.4 or later).
