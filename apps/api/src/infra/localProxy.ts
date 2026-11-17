import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Local development only.
 *
 * Node's built-in `fetch` ignores `HTTPS_PROXY`. On a machine that can only reach the internet
 * through a proxy, this routes outbound requests through it (honouring `NO_PROXY`). Trusting
 * the proxy's certificate is done outside the process with `NODE_EXTRA_CA_CERTS`.
 *
 * It never activates in production, so a stray `HTTPS_PROXY` there cannot reroute traffic.
 * Returns whether the proxy was installed.
 */
export function installLocalProxy(env: NodeJS.ProcessEnv = process.env): boolean {
  const proxy = env.HTTPS_PROXY ?? env.https_proxy;
  if (env.NODE_ENV === 'production' || !proxy) return false;
  setGlobalDispatcher(new EnvHttpProxyAgent());
  return true;
}
