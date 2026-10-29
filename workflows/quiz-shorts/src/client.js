import {ZvidClient} from '@zvid/sdk';

export function createClient(options, {fetcher=fetch, requestTimeoutMs=120000}={}) {
  return new ZvidClient({
    ...options,
    maxRetries: 0,
    fetch: (url, init={}) => {
      const timeout = AbortSignal.timeout(requestTimeoutMs);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return fetcher(url, {...init, signal});
    }
  });
}
