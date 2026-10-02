import { ArrowRight, Megaphone, X } from "lucide-react";
import { IconButton } from "../components/study-ui.jsx";
import { MOBILE_VERSION } from "../mobile-release.js";

export function AnnouncementModal({ onClose }) {
  return (
    <div
      className="announcement-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="announcement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
      >
        <header className="announcement-header">
          <div className="announcement-heading">
            <span className="announcement-icon">
              <Megaphone size={22} />
            </span>
            <div>
              <span className="announcement-kicker">考匠 · 更新公告</span>
              <h2 id="announcement-title">考匠 v{MOBILE_VERSION} 更新</h2>
              <p>考试作答同步更可靠，AI 服务支持多人同时使用。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭网站公告" onClick={onClose} />
        </header>
        <div className="announcement-body">
          <div className="announcement-highlight">
            <strong>考匠 App v{MOBILE_VERSION} 已发布</strong>
            <span>
              手机与网页同时作答时，可以处理答案冲突；网页补齐断网恢复与保存重试。
            </span>
          </div>
          <ul className="announcement-list">
            <li>
              <span>01</span>
              <div>
                <strong>考试答案同步与冲突处理</strong>
                <p>
                  保存与交卷前检查答案版本。其他设备更新同一场考试时，可选择使用已同步答案或合并本机作答。
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>多人使用 AI 更顺畅</strong>
                <p>
                  不同账号可以同时执行 AI
                  任务，任务超时或生成失败会按原有规则返还额度。
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>登录保护与网页加载优化</strong>
                <p>
                  登录注册增加频率保护，电脑网页按需加载各个学习页面，并提供加载状态与失败重试提示。
                </p>
              </div>
            </li>
          </ul>
          <p className="announcement-footnote">
            Android v{MOBILE_VERSION} 沿用现有正式签名，正式签名的 v0.3.3 至
            v0.3.8 用户可覆盖更新。旧测试签名版仍需卸载后安装。
          </p>
        </div>
        <footer className="announcement-footer">
          <small>公告关闭后，本次浏览器将不再重复提示。</small>
          <button className="primary" onClick={onClose}>
            知道了，开始学习
            <ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
}

export function SponsorModal({ onClose }) {
  return (
    <div
      className="sponsor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="sponsor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sponsor-title"
      >
        <header>
          <div>
            <span className="sponsor-kicker">支持考匠</span>
            <h2 id="sponsor-title">赞助作者</h2>
            <p>如果这个学习工具对你有帮助，欢迎请作者喝杯咖啡。</p>
          </div>
          <IconButton icon={X} label="关闭赞助作者" onClick={onClose} />
        </header>
        <div className="sponsor-content">
          <img src="/sponsor-wechat.jpg" alt="微信赞助二维码" />
          <strong>使用微信扫一扫</strong>
          <p>感谢你的支持，我会继续维护题库和学习功能。</p>
        </div>
        <footer>
          <button onClick={onClose}>暂时关闭</button>
        </footer>
      </section>
    </div>
  );
}
