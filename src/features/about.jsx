import { BadgeInfo, BookOpen, Clock, Heart, Sparkles } from "lucide-react";
import { Heading } from "../components/study-ui.jsx";

export function AboutView({ onSponsor }) {
  return (
    <>
      <Heading title="关于考匠" subtitle="让学习回到每个人手里">
        <button onClick={onSponsor}>
          <Heart size={16} />
          赞助作者
        </button>
      </Heading>
      <section className="about-hero-card">
        <div className="about-hero-mark">考</div>
        <div>
          <span className="eyebrow">考匠 · AceExam</span>
          <h2>把精练题、碎片时间和现代化 AI 教育放在一起。</h2>
          <p>网站端与移动端共用账号、题库和学习记录，也共用考匠社区。</p>
        </div>
      </section>
      <section className="about-author-card">
        <div className="section-heading">
          <div>
            <h2>作者想说</h2>
            <p>我做考匠，起初只是因为相信：</p>
          </div>
          <BadgeInfo size={23} />
        </div>
        <p>每一个认真学习的人，都应该拥有一条不被费用和时间挡住的路。</p>
        <p>
          我希望，让暂时无力承担学费的同学，也能接触到经过整理、真正精练有用的题目；让没有时间参加补课的同学，也能利用通勤、排队和睡前的碎片时间，一点点向前进步；让每个人都能体验到更现代、更贴近自己的
          AI 教育。
        </p>
        <p>
          普通题库继续免费开放。AI
          服务由作者统一提供，按账号额度使用，可通过每日签到或会员获取额度。
        </p>
        <p>
          如果考匠对你有帮助，欢迎打赏一笔小小的支持，帮助我们持续维护题库、改进体验，让考匠社区越来越好。
        </p>
      </section>
      <div className="about-value-grid">
        <article>
          <BookOpen size={20} />
          <strong>精练题库</strong>
          <span>围绕真实学习目标整理练习。</span>
        </article>
        <article>
          <Clock size={20} />
          <strong>碎片学习</strong>
          <span>随时打开，利用几分钟持续进步。</span>
        </article>
        <article>
          <Sparkles size={20} />
          <strong>AI 助学</strong>
          <span>共用作者 AI 服务，额度与学习记录按账号独立计算。</span>
        </article>
      </div>
      <div className="about-footnote">
        <span>愿每一次短暂练习，都能变成看得见的进步。</span>
        <button className="primary" onClick={onSponsor}>
          <Heart size={16} />
          去赞助作者
        </button>
      </div>
    </>
  );
}
