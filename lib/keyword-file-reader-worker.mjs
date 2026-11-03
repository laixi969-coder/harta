import { readKeywordFile } from './keyword-file-reader.mjs';
process.once('message', async payload => {
  try { process.send({ result: await readKeywordFile(payload) }); }
  catch (error) { process.send({ error: String(error.message).slice(0, 500) }); }
});
process.on('disconnect', () => {
  if (process.platform !== 'win32') { try { process.kill(-process.pid, 'SIGKILL'); } catch {} }
  process.exit(0);
});
