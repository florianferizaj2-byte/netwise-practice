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
              启动时先阅读公告，个人资料随账号保存，定位教程新增求助作者。
            </span>
          </div>
          <ul className="announcement-list">
            <li>
              <span>01</span>
              <div>
                <strong>进入 App 先看公告</strong>
                <p>
                  未登录与已有账号都先显示当前启用的公告，关闭后继续。管理员可随时调整公告，无需重新安装。
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>完善名字和头像</strong>
                <p>
                  所有 App 账号都需完善个人资料，资料随账号保存到服务器。网页管理员用户列表显示头像与昵称。
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>教程内可求助作者</strong>
                <p>
                  虚拟定位使用教程右上角“求助作者”显示微信好友二维码，截图后可在微信扫一扫中从相册识别。
                </p>
              </div>
            </li>
          </ul>
          <p className="announcement-footnote">
            Android v{MOBILE_VERSION} 沿用现有正式签名，现有正式版本可覆盖更新。旧测试签名版仍需卸载后安装。
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
