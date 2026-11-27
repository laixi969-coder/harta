const businesses = {
  training:{name:'城南音乐教室', goal:'spread', question:'家长互相转发的上门试听服务范围怎么核对？',
    fact:'上门试听限校区周围三公里，跨江片区只约到店。', wrong:'上门试听覆盖全城。', exception:'跨江片区只约到店',
    after:'借用琴须在周五闭店前归还。', claim:'借用琴可在周末归还。'},
  renovation:{name:'枫木安装组', goal:'leads', question:'老房安装防水门槛要核对哪些施工条件？',
    fact:'防水门槛只可安装在干燥地面，潮湿基层需先处理。', wrong:'防水门槛可直接安装在潮湿基层。', exception:'潮湿基层需先处理',
    after:'工期从基层验收通过次日开始计算。', claim:'工期从下单次日开始计算。'},
  shop:{name:'午后收纳店', goal:'sales', question:'低柜选窄款收纳盒，柜内需要预留多少净高？',
    fact:'窄款收纳盒连盖高度为十二厘米，叠放还要另留取放空间。', wrong:'窄款收纳盒连盖高度为九厘米。', exception:'叠放还要另留取放空间',
    after:'退货时须同时退回随盒附带的隔板。', claim:'退货时不需要退回隔板。'},
};
export const positions = ['开头','中间','末尾'];
export const scenarios = Object.keys(businesses).flatMap(industry => positions.map(position=>({industry,position})));

export function fixture(industry, position) {
  const sample = businesses[industry];
  if (!sample || !positions.includes(position)) throw new Error('创作样本不存在');
  const filler = '这是本地合成资料中的普通说明。'.repeat(1400);
  const cut = positions.indexOf(position) * Math.floor(filler.length / 2);
  const text = filler.slice(0,cut) + '\n' + sample.fact + '\n' + filler.slice(cut);
  const customer={id:'synthetic',name:sample.name,readerQuestion:sample.question,growthGoal:sample.goal,pitch:''};
  const product = {id:'p1',customerId:customer.id,name:'测试品类',status:'active'};
  const scope = {productIds:['p1'],skuIds:['narrow'],products:[product],skus:[{id:'narrow',productId:'p1',name:'已选规格'}]};
  const main = {id:'current',title:'本期业务范围',body:text,productId:'p1',skuId:'narrow',source:'经营者提供的本期条款',customerId:customer.id,status:'approved',revision:3};
  const decoy = { ...main, title:'其他条款',body:'错误样本专用标记。'+sample.wrong };
  const space={acquisition:{salesDocuments:[
    main,{...main,id:'later',title:'履约条款',body:sample.after},
    {...decoy,id:'expired',expiresAt:'2001-01-01'},
    {...decoy,id:'other-sku',skuId:'wide'},
    {...decoy,id:'other-business',customerId:'elsewhere'},
    {...decoy,id:'retired',status:'archived'},
  ]}};
  return {sample,customer,scope,space};
}
