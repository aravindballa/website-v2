import { handle } from '@astrojs/cloudflare/handler';
import { syncReadwiseLibrary } from './utils/readwise';

export default {
  fetch: handle,
  async scheduled(_controller, env) {
    await syncReadwiseLibrary(env);
  },
} satisfies ExportedHandler<Env>;
