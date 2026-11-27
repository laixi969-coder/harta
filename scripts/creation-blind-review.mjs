import fs from 'node:fs';
import path from 'node:path';
import {prepareBlindReview,blindReviewPage,decodeBlindReview} from '../evals/creation/blind-review.mjs';
import {fixture} from '../evals/creation/fixtures.mjs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const [action,first,second,third]=process.argv.slice(2);
if(action==='prepare' && first && second && !third){
  const synthetic=first==='--synthetic';
  const pairs=synthetic?['training','renovation','shop'].map(industry=>{
    const {sample}=fixture(industry,'中间');
    return {id:industry,topic:sample.question,baseline:sample.wrong,candidate:sample.fact};
  }):read(first);
  const {reviewer,key}=prepareBlindReview(pairs,{synthetic});
  // Use a new directory to avoid overwriting a coordinator's existing randomization key.
  fs.mkdirSync(second,{mode:0o700});
  fs.writeFileSync(path.join(second,'创作盲评.html'),blindReviewPage(reviewer),{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(second,'分组密钥.json'),JSON.stringify(key,null,2),{flag:'wx',mode:0o600});
  console.log('已生成创作盲评.html。只把该 HTML 交给评审者，保留分组密钥供回收后解盲。');
}else if(action==='decode'&&first&&second&&third){
  const result=decodeBlindReview(read(first),read(second));
  fs.writeFileSync(third,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  console.log('已保存解盲结果。');
}else{
  console.error('用法：creation-blind-review.mjs prepare <同题稿件.json 或 --synthetic> <新目录>，或 decode <分组密钥.json> <评审记录.json> <新结果文件.json>');
  process.exitCode=1;
}
