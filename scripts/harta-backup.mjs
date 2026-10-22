import {createBackup,restoreBackup} from '../lib/backup.mjs';
const [action,source,destination,...flags]=process.argv.slice(2);
try{
 if(!['create','restore'].includes(action)||!source||!destination)throw new Error('用法：node scripts/harta-backup.mjs create <data目录> <新备份目录> --offline 或 restore <备份目录> <新data目录>');
 console.log(JSON.stringify(action==='create'?await createBackup(source,destination,{offline:flags.includes('--offline')}):restoreBackup(source,destination),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
