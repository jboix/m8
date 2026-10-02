/**
 * The way in: the access key when the server wants one, the Gemini key when
 * the server has none, then the setup screen.
 */
import { AccessScreen } from './access/access-screen.tsx';
import { type Access, useAccess } from './access/use-access.ts';
import { KeyScreen } from './gemini/key-screen.tsx';
import { type Gemini, useGemini } from './gemini/use-gemini.ts';
import { SetupScreen } from './setup/setup-screen.tsx';
import { useSetup } from './setup/use-setup.ts';

/**
 * The three things a visitor passes on the way in.
 *
 * @returns The setup, where the browser stands with the server, the Gemini
 * account, and `awakened`, true once setup is done, the server lets this
 * browser in, and the server has a Gemini key. `asking` while a key screen is
 * up, and `upstream`, the masked key, the live model and the context size, which reopen the
 * session when they change.
 */
export function useDoorway() {
  const setup = useSetup();
  const access = useAccess();
  const gemini = useGemini(access.state === 'open');
  const awakened = setup.phase === 'done' && access.state === 'open' && gemini.state === 'ready';
  const asking = access.state === 'locked' || gemini.state === 'asking';
  const { key = '', live = '', context = '' } = gemini.account ?? {};
  const upstream = `${key} ${live} ${context}`;
  return { setup, access, gemini, awakened, asking, upstream };
}

/** What {@link Doorway} needs. */
interface DoorwayProps {
  /** Where the browser stands with the server. */
  access: Access;
  /** The Gemini account. */
  gemini: Gemini;
  /** The setup. */
  setup: ReturnType<typeof useSetup>;
}

/**
 * What stands between a visitor and the character: the access key when the
 * server wants one, the Gemini key when the server has none, then the setup
 * screen.
 *
 * @param props - Where the browser stands with the server, the account and the setup.
 * @returns The access screen while locked, the key step while the server has
 * no Gemini key, nothing while the server has not answered or setup is
 * already done, and the setup screen otherwise.
 */
export function Doorway({ access, gemini, setup }: DoorwayProps) {
  if (access.state === 'locked')
    return <AccessScreen fault={access.fault} unlock={access.unlock} />;
  if (access.state === 'checking' || gemini.state === 'checking') return null;
  if (gemini.state === 'asking') return <KeyScreen gemini={gemini} />;
  if (setup.phase === 'done') return null;
  return <SetupScreen leaving={setup.phase === 'leaving'} onDone={setup.finish} />;
}
