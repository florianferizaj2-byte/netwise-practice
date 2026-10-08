import { useEffect, useState } from "react";
import {
  Award,
  BadgeInfo,
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  Landmark,
  Layers3,
  Monitor,
  Network,
  Scale,
  ShieldCheck,
  Stethoscope,
  Target,
  TriangleAlert,
} from "lucide-react";
import { Empty, Heading } from "../components/study-ui.jsx";

export function CertificateGuideView({ certificates, currentCertificateId }) {
  const [selectedId, setSelectedId] = useState(currentCertificateId);
  useEffect(() => setSelectedId(currentCertificateId), [currentCertificateId]);
  const certificate =
    certificates.find((item) => item.id === selectedId) || certificates[0];
  const guide = certificate?.guide;
  const isAcademicExam = certificate?.moduleType === "academic_exam";
  const isNetworkGuide = ["network-engineer", "hcia-datacom"].includes(
    certificate?.id,
  );
  const factIcons = [
    BadgeInfo,
    Banknote,
    ShieldCheck,
    CalendarClock,
    FileText,
    Layers3,
  ];
  if (!guide)
    return (
      <Empty icon={BadgeInfo} title="这个备考目标的指南正在整理">
        <p>考试规则确认后会在这里发布。</p>
      </Empty>
    );
  const careerGroups = [
    {
      title: "适合谁考",
      hint: "人群",
      icon: Compass,
      items: guide.career.bestFor,
    },
    {
      title: isAcademicExam ? "备考方向" : "对应岗位",
      hint: "方向",
      icon: BriefcaseBusiness,
      items: guide.career.roles,
    },
    {
      title: "主要价值",
      hint: "收益",
      icon: Award,
      items: guide.career.value,
    },
    {
      title: "现实边界",
      hint: "注意",
      icon: Scale,
      items: guide.career.limitations,
    },
  ];
  return (
    <div className={`certificate-guide-page guide-theme-${certificate.id}`}>
      <Heading title="考试与证书指南" subtitle="考试规则、考点范围与备考方向">
        <span className="guide-verified">
          <CircleCheck size={15} />
          信息核对于 {guide.verifiedAt}
        </span>
      </Heading>

      <div className="certificate-guide-switcher" role="tablist">
        {certificates.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={selectedId === item.id}
            className={selectedId === item.id ? "selected" : ""}
            onClick={() => setSelectedId(item.id)}
          >
            <span className="guide-tab-icon">
              {item.id === "network-engineer" ? (
                <Landmark size={18} />
              ) : item.id === "ncre-ms-office" ? (
                <FileText size={18} />
              ) : item.moduleType === "academic_exam" ? (
                <GraduationCap size={18} />
              ) : item.id === "veterinary-practitioner" ? (
                <Stethoscope size={18} />
              ) : (
                <Network size={18} />
              )}
            </span>
            <span>
              <strong>{item.shortName}</strong>
              <small>
                {item.id === currentCertificateId
                  ? "当前备考目标"
                  : "查看考试资料"}
              </small>
            </span>
            {selectedId === item.id ? (
              <CircleCheck size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </button>
        ))}
        <p>切换这里只查看资料，不会改变你的当前题库。</p>
      </div>

      <section className="certificate-guide-hero">
        <div className="guide-identity">
          <div className="guide-document-meta">
            <span>{guide.badge}</span>
            <span>EXAM GUIDE · 2026</span>
          </div>
          <div className="guide-title-lockup">
            <span className="guide-emblem">
              {isAcademicExam ? <GraduationCap size={30} strokeWidth={1.7} /> : <Award size={30} strokeWidth={1.7} />}
            </span>
            <div>
              <h1>{guide.title}</h1>
              <strong>{guide.subtitle}</strong>
            </div>
          </div>
          <p>{guide.overview}</p>
          <a
            className="guide-official-link"
            href={guide.sources[0].url}
            target="_blank"
            rel="noreferrer"
          >
            查看官方介绍
            <ExternalLink size={15} />
          </a>
        </div>
        <div className="guide-fact-board">
          <header>
            <span>报考速览</span>
            <strong>先看清这 {guide.facts.length} 项</strong>
          </header>
          <div className="guide-facts">
            {guide.facts.map((fact, index) => {
              const FactIcon = factIcons[index % factIcons.length];
              return (
                <div key={fact.label}>
                  <span className="guide-fact-icon">
                    <FactIcon size={17} />
                  </span>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                  <small>{fact.note}</small>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="certificate-guide-layout">
        <div className="guide-primary-column">
          <section className="guide-section guide-schedule">
            <div className="section-heading">
              <div>
                <span className="guide-section-index">01 · TIME</span>
                <h2>
                  <CalendarDays size={20} />
                  {guide.schedule.title}
                </h2>
              </div>
              <span className="badge green">{guide.schedule.status}</span>
            </div>
            <div className="guide-timeline">
              {guide.schedule.items.map((item, index) => (
                <div key={`${item.date}-${item.title}`}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <time>{item.date}</time>
                  <span>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </span>
                </div>
              ))}
            </div>
            <p className="guide-section-note">{guide.schedule.note}</p>
          </section>

          <section className="guide-section">
            <div className="section-heading">
              <div>
                <span className="guide-section-index">02 · EXAM</span>
                <h2>
                  <Monitor size={20} />
                  {isAcademicExam ? "考试方式与练习说明" : "考试方式与通过要求"}
                </h2>
              </div>
            </div>
            <dl className="guide-detail-list">
              {guide.examDetails.map((item, index) => (
                <div key={item.label}>
                  <dt>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item.label}
                  </dt>
                  <dd>
                    <strong>{item.value}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="guide-must-know">
          <div className="guide-must-know-heading">
            <span>
              <TriangleAlert size={19} />
            </span>
            <div>
              <small>BEFORE YOU BOOK</small>
              <h2>报名前必须知道</h2>
            </div>
          </div>
          <ol>
            {guide.mustKnow.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="guide-section guide-knowledge">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">03 · SYLLABUS</span>
            <h2>
              <Target size={20} />
              核心考点
            </h2>
          </div>
          <span>{guide.knowledgeAreas.length} 个知识领域</span>
        </div>
        <div className="guide-knowledge-grid">
          {guide.knowledgeAreas.map((area, index) => (
            <article key={area.name}>
              <div>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Target size={15} />
              </div>
              <h3>{area.name}</h3>
              <div className="guide-topic-list">
                {area.topics.map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </div>
              {area.examFocus?.length > 0 && (
                <ul>
                  {area.examFocus.map((focus) => <li key={focus}>{focus}</li>)}
                </ul>
              )}
              {area.practiceAdvice && <p>{area.practiceAdvice}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section guide-career">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">04 · CAREER</span>
            <h2>
              <GraduationCap size={20} />
              {isAcademicExam ? "学习安排与升学备考" : "职业前景与证书价值"}
            </h2>
          </div>
        </div>
        <p className="guide-career-summary">{guide.career.positioning}</p>
        <div className="guide-career-columns">
          {careerGroups.map(({ title, hint, icon: Icon, items }) => (
            <article key={title}>
              <header>
                <span>
                  <Icon size={17} />
                </span>
                <div>
                  <small>{hint}</small>
                  <h3>{title}</h3>
                </div>
              </header>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {isNetworkGuide && (
        <section className="certificate-choice-band">
          <header>
            <span>怎么选</span>
            <strong>同一套网络基础，两种职业价值</strong>
          </header>
          <div className="guide-choice-track">
            <article>
              <Landmark size={21} />
              <span>国家资格与职称使用</span>
              <strong>软考网络工程师</strong>
              <p>适合国企、事业单位、职称聘任依据和需要广泛网络知识的场景。</p>
            </article>
            <article>
              <Target size={21} />
              <span>两证共同基础</span>
              <strong>TCP/IP · VLAN · OSPF · ACL · NAT</strong>
              <p>知识重叠明显，基础阶段可以共用学习成果。</p>
            </article>
            <article>
              <Network size={21} />
              <span>数通实操与华为生态</span>
              <strong>HCIA-Datacom</strong>
              <p>适合 ICT、网络运维、系统集成岗位，并继续进阶 HCIP/HCIE。</p>
            </article>
          </div>
        </section>
      )}

      <section className="guide-section guide-sources">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">05 · SOURCES</span>
            <h2>
              <CircleCheck size={20} />
              官方核对入口
            </h2>
          </div>
          <span>费用、日期与规则变化时以官方页面为准</span>
        </div>
        <div>
          {guide.sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="guide-source-icon">
                <FileText size={17} />
              </span>
              <span>
                <strong>{source.name}</strong>
                <small>{source.scope}</small>
              </span>
              <ExternalLink size={16} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
