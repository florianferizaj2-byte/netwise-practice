import { FundedTestAIProvider } from "./ai-points.js";
import { reviewVerdict } from "../ai-fixture.js";

export function learningFixture(store,{delayMs=80,holdAfter=0,transformQuestion}={}){
  process.env.AI_SERVICE_API_KEY="synthetic-no-network-key";
  process.env.AI_SERVICE_BASE_URL="https://api.deepseek.com";
  process.env.AI_SERVICE_MODEL="deepseek-flash";
  const seed={id:"synthetic-learning-reference",type:"single_choice",question:"合成场景中，持久事务应在何时提交全部变更？",
    options:{A:"全部检查通过后",B:"检查开始前",C:"忽略错误直接写入",D:"没有持久化也返回成功"},answer:["A"],
    analysis:"这是隔离测试夹具；事务必须在全部前置检查通过之后提交。",chapter:"路由与广域网技术",knowledgePoint:"合成测试一致性",
    difficulty:"easy",tags:["合成测试"],source:"original",certificates:["network-engineer"]};
  store.addQ(seed);
  const stems=[
    "原子事务中的作答和交付日志同时写入，如果第二项写入失败，应该如何保持持久状态一致？",
    "客户端首次提交后没有收到确认，又带着相同请求编号发送相同内容，服务端应该如何处理？",
    "旧工作进程失去任务租约以后才返回计算结果，避免覆盖新进程成果需要检查哪个条件？",
    "手机断开事件流之后重新连接，可靠补收此前遗漏消息需要保存并携带什么信息？",
    "考试后台仍在出题而已有题目尚未作答，为避免错误暂停考试计时应当采用哪种判断依据？",
    "公开答题接口准备交付完整题目，在正式交卷之前需要移除哪一类内部字段？",
    "同一题连续记住答案并反复答对，用于评价知识掌握程度时应该怎样限制这类重复证据？",
    "不同证书中存在名称相同的知识点，保存用户学习画像时应如何限定数据的归属范围？",
    "审核发现一道候选题的选项互相矛盾而其他题目已经通过检查，恢复工作应该针对哪一部分？",
    "试卷只有部分题目完成生成就被用户主动结束，在成绩展示中应当如何标识完成情况？",
    "用户切换账号以后，仍在返回的旧账号请求怎样避免污染新账号的本机缓存？",
    "搜索范围改变时，上一组分页游标为什么不能继续用于新的知识点目录？",
    "网络超时后客户端重新订阅事件，服务端为什么需要按持久序号重放消息？",
    "一张试卷的生成顺序已经确认后，后台重试为何必须固定题目位置而不是重排已交付内容？",
    "积分预占成功而生成最终失败时，账本应采用怎样的状态迁移防止重复退款？",
    "模型响应缺少题干字段时，为何不应把参考题题干直接拼接到新选项上发布？",
    "只完成部分题目的训练被交卷后，评分分母怎样避免把未生成的题目算成错误？",
    "服务部署后恢复一份旧任务，为何不能把失败尝试计数清零并复用先前账单编号？",
    "消息消费速度低于事件产生速度时，连接为什么应有背压边界而不是无限累积内存？",
    "用户修改了多选答案且上一次保存尚未回执，合并服务器快照时如何避免覆盖新选择？",
    "一份缓存试题被后台撤回之后，提交接口为什么需要重新检查题目是否仍然可用？",
    "审核服务报告相互矛盾的答案时，为什么单纯增加已完成数量不能代表题目可交付？",
    "设备本地时钟与服务器不一致时，定时考试为什么应以服务端确认的时间状态计时？",
    "一个表单按钮被快速重复点击时，相同业务内容应如何使用同一请求标识避免重复写入？",
    "用户已取消后台工作而上游稍后才返回结果时，提交阶段需要什么终态检查？",
    "同一知识点只有少量作答样本时，为什么不能直接把它标记为已经稳定掌握？",
    "一个共享题目属于多个证书时，缺少证书字段的历史作答为什么不能随意归类？",
    "下游消费者需要公共试题数据时，如何确保内部答案和解析不提前出现在返回值中？",
    "读取任务状态的接口遇到无权限账号时，为什么应在加载私有结果前核验归属？",
    "持久化保存题目成功但结算事务失败时，为什么这两步需要在一致的提交边界内回滚？",
    "自动重试预算已经用完时，为什么服务仍需返回明确错误而不是持续展示加载动画？",
    "任务执行进程重启以后，怎样从已保存的槽位记录区分已交付位置与未完成位置？",
    "后台生成已异常暂停且仍缺题时，考试计时怎样避免把平台故障等待算入用户用时？",
    "同一版本的下载地址被替换成镜像后，客户端为什么还需要检查发布的完整性信息？",
    "生成器输出了正确内容但字段名称不同，怎样无损映射后仍执行完整校验与独立审核？",
    "数据库读写并发更新同一条作答时，版本比较为何能够防止旧设备覆盖新记录？",
    "答案已经确认保存而客户端未收到响应时，重复提交同一差量应当怎样返回原有确认？",
    "故障修复只重试未交付题目时，为什么原有题目编号、已选答案和已结算费用必须保留？",
    "审核通过的新题准备写入私有题组时，为什么还需要核验当前工作进程持有的有效租约？",
    "临时连接故障恢复之后，客户端为什么不能仅凭动画结束就声称所有题目已经生成？",
  ];
  let generated=0,reviews=0,released=holdAfter===0,releaseGate,invalid=false;
  const gate=new Promise(resolve=>{releaseGate=resolve;});
  const provider=new FundedTestAIProvider(store,{fetch:async(_url,options)=>{
    await new Promise(resolve=>setTimeout(resolve,delayMs));
    const body=JSON.parse(options.body),system=body.messages[0].content,payload=JSON.parse(body.messages[1].content);
    let result;
    if(system.includes("一次生成")){
      if(!released&&generated>=holdAfter)await gate;
      result={questions:payload.specs.map(spec=>{const question={
        type:"single_choice",question:stems[generated++%stems.length],options:{A:"采用与题干相符的一致性控制",B:"丢弃全部持久记录",C:"忽略校验结果直接发布",D:"混用其他用户的状态"},
        answer:["A"],analysis:"合成夹具仅用于验证传输、校验编排、计费和持久任务，不构成真实题目质量证明。",
        chapter:payload.chapter,knowledgeSection:payload.knowledgeSection,knowledgePoint:payload.knowledgePoint,
        difficulty:spec.difficulty,tags:["合成测试"],
      };return transformQuestion?transformQuestion(question,{index:generated-1,spec,payload,system}):question;})};
    }else if(system.includes("逐题独立审核")){
      reviews+=payload.items.length;
      result={reviews:payload.items.map(({index})=>({index,...reviewVerdict,...(invalid?{valid:false,reason:"合成审核拒绝样本"}:{})}))};
    }else throw new Error("Unexpected synthetic model request");
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)},finish_reason:"stop"}],
      usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}),{headers:{"Content-Type":"application/json"}});
  }});
  store.points.saveRateCard({provider:"https://api.deepseek.com",model:"deepseek-flash",inputMicrosPerMillion:2000000,
    outputMicrosPerMillion:8000000,cachedMicrosPerMillion:40000,source:"synthetic-fixture-pricing",
    verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()},"synthetic");
  return {provider,seed,questions:()=>[seed],release:()=>{released=true;releaseGate();},
    get generated(){return generated;},get reviews(){return reviews;},reject:()=>{invalid=true;}};
}
