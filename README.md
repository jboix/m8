<h1>
  <img src="docs/logo.svg" width="44" height="44" align="absmiddle" alt="">
  m8
</h1>

[![Quality](https://github.com/jboix/m8/actions/workflows/quality.yml/badge.svg)](https://github.com/jboix/m8/actions/workflows/quality.yml)
[![bun](https://img.shields.io/badge/bun-%3E%3D1.4-brightgreen)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6)](https://www.typescriptlang.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

m8 is a character that lives in a browser tab as a pair of eyes. He sees
through the webcam, hears through the microphone, talks through Gemini's live
speech model, decides where to look, and remembers earlier conversations. It is
one Bun server and a React page, and the only service it needs is a Gemini API
key.

## Quick start

You need [Bun](https://bun.sh) 1.4 or later and a
[Gemini API key](https://aistudio.google.com/apikey).

```sh
bun install            # dependencies and git hooks
bun run dev            # web on :3000, server on :3001
```

1. Open <http://localhost:3000>.
2. Paste your Gemini key. The server checks it with Gemini, stores it sealed in
   its database, and picks the newest live model and the newest text model the
   key can use. You can change either before you go on.
3. Choose a language and enter your name.
4. Allow the camera and the microphone.

You do not need a `.env` file. `.env.example` lists the optional variables.

## What he does

- **He looks at you.** He follows faces and motion, glances at a wave, and
  turns to whoever starts talking. When nobody is there he looks around, yawns
  and falls asleep, and a face wakes him.
- **He talks with you.** You can interrupt him. In a room with other people you
  can hold a talk button instead, so he only hears you.
- **He shows what he feels.** He has thirteen expressions, from curious to
  shocked, most of them with a small decoration, such as a tear or a sweat
  drop, and a robot sound.
- **He speaks first.** When he has been bored long enough, by silence or by
  something he noticed, such as music starting, he starts the conversation.
- **He remembers.** After each conversation he writes down what happened and
  what he learned, and he brings it up another day. With face learning on, he
  knows people by sight.
- **He speaks four languages:** English, French, Spanish and Japanese, one at a
  time.

The settings let you change his voice and sounds, how he listens, his memory,
the faces he knows, and the Gemini models. They also show what he has spent,
estimated from Google's list prices. Developer options open the rig: every
parameter of the eyes, the live session, the senses and the memory, and an
event log you can record and replay.

## Privacy

m8 runs on your machine, but Gemini is what sees, hears, talks and writes his
memory, so most of what he knows reaches Google.

- While he is awake, the microphone audio and one camera frame a second go to
  Gemini.
- His memory is stored in `data/m8.sqlite` on the machine that runs the server.
  Gemini reads it all the same: every session starts with his self-model,
  recent episodes, top facts and the names he knows, `recall` sends facts back
  to the model, and Gemini writes the summaries and facts from the transcript
  after each session.
- The face embeddings, the detector results, the raw room audio and the usage
  records never leave the machine. When face learning is on, only names reach
  Gemini.
- You can read and delete the memory from the settings. Google's terms for the
  Gemini API apply to everything sent to it.

The [architecture](docs/architecture.md#91-what-reaches-gemini) lists each
thing that reaches Gemini, and when.

## Running it for others

```sh
bun run build          # the web app, into apps/web/dist
bun run start          # one server on :3001: the page, the API and the relay
```

- It listens on every interface and prints the address other devices can use.
  You can keep it to this machine with `--host 127.0.0.1`, and choose the port
  with `--port 3000`.
- A phone needs the page over https, because browsers refuse the camera and the
  microphone over plain http. Put your own https reverse proxy or tunnel in
  front of the port.
- Set `M8_ACCESS_KEY` before you expose the server. Without it, anyone with the
  URL can open sessions on your Gemini key, replace the key, and read his
  memory.
- Back up `keys/secret.key` apart from `data/`. The stored Gemini key does not
  open without it.

## Documentation

- [Architecture](docs/architecture.md): the structure, the contracts and the rules.
- [What it notices](docs/what-it-notices.md): every event the senses produce, with its threshold.
- [Code style](docs/code-style.md): readability rules that the linter cannot check.
- [Documentation guidelines](docs/documentation-guidelines.md): how to write TSDoc and comments.
- [Third-party models](docs/third-party.md): the models m8 downloads, where from, and their licences.
- [AGENTS.md](AGENTS.md): the guide for coding agents.

## Contributing

Read the [contributing guide](docs/CONTRIBUTING.md) before opening a pull
request. The [Code of Conduct](docs/CODE_OF_CONDUCT.md) applies to everyone
who takes part. Report a vulnerability as [SECURITY.md](docs/SECURITY.md)
describes.

## License

MIT. See [LICENSE](LICENSE).
