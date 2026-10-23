import { extractFile } from './materials.mjs';
process.once('message',async ({file,storedPath,tempDir})=>{
  try { process.send({result:await extractFile(file,storedPath,tempDir)}); }
  catch(error) { process.send({error:String(error.message).slice(0,500)}); }
});
process.on('disconnect',()=>{
  if(process.platform !== 'win32') { try { process.kill(-process.pid,'SIGKILL'); } catch {} }
  process.exit(0);
});
