import { FundedTestAIProvider } from "./ai-points.js";
import { reviewVerdict } from "../ai-fixture.js";

export function learningFixture(store,{delayMs=80,holdAfter=0}={}){
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
  ];
  let generated=0,reviews=0,released=holdAfter===0,releaseGate,invalid=false;
  const gate=new Promise(resolve=>{releaseGate=resolve;});
  const provider=new FundedTestAIProvider(store,{fetch:async(_url,options)=>{
    await new Promise(resolve=>setTimeout(resolve,delayMs));
    const body=JSON.parse(options.body),system=body.messages[0].content,payload=JSON.parse(body.messages[1].content);
    let result;
    if(system.includes("一次生成")){
      if(!released&&generated>=holdAfter)await gate;
      result={questions:payload.specs.map(spec=>({
        type:"single_choice",question:stems[generated++%stems.length],options:{A:"采用与题干相符的一致性控制",B:"丢弃全部持久记录",C:"忽略校验结果直接发布",D:"混用其他用户的状态"},
        answer:["A"],analysis:"合成夹具仅用于验证传输、校验编排、计费和持久任务，不构成真实题目质量证明。",
        chapter:payload.chapter,knowledgeSection:payload.knowledgeSection,knowledgePoint:payload.knowledgePoint,
        difficulty:spec.difficulty,tags:["合成测试"],
      }))};
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
