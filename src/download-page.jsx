import React, { useEffect, useState } from "react";
import { ContentPlaceholder } from "./components/content-placeholder.jsx";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import "./download-page.css";

export function DownloadPage({ api, authenticated, go }) {
  const [release, setRelease] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState("");
  const mobileUrl = new URL("/app/", window.location.origin).href;
  useEffect(() => {
    const previous = document.title;
    document.title = "多端学习与下载 · 考匠 AceExam";
    return () => {
      document.title = previous;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    api("/mobile/version")
      .then((data) => {
        const url = new URL(data.downloadUrl, window.location.origin);
        if (!/^https?:$/.test(url.protocol) || !data.downloadUrl)
          throw new Error("下载地址暂时不可用，请稍后重试。");
        if (active) setRelease({ ...data, downloadUrl: url.href });
      })
      .catch(() => {
        if (active) setError("暂时无法获取 Android 版本，请重试。");
      });
    return () => {
      active = false;
    };
  }, [api, revision]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(""), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async (url, name) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(`${name}链接已复制`);
    } catch {
      setCopied("未能复制链接，可用手机扫描二维码打开。");
    }
  };
  return (
    <div className="desktop-experience download-page">
      <header className="download-header">
        <div className="download-container">
          <button
            className="download-brand"
            onClick={() => go("welcome")}
            aria-label="返回考匠首页"
          >
            <img src="/kaojiang-logo-192.png" alt="" width="38" height="38" />
            <strong>考匠</strong>
            <span>AceExam</span>
          </button>
          <button className="download-back" onClick={() => go("home")}>
            <ArrowLeft size={17} />
            {authenticated ? "返回学习空间" : "返回考匠"}
          </button>
        </div>
      </header>
      <main className="download-container">
        <section className="download-intro">
          <div>
            <p>多端学习与下载</p>
            <h1>
              在顺手的设备上，
              <br />
              接着学。
            </h1>
          </div>
          <div className="download-sync-note">
            <RefreshCw size={22} />
            <div>
              <strong>同一个账号，同一份学习记录</strong>
              <p>
                电脑上专注练习，手机上随时复习。
                <br />
                已提交的作答、错题与收藏跟随账号同步。
              </p>
            </div>
          </div>
        </section>

        <div className="download-platforms">
          <section className="download-platform download-desktop">
            <div className="download-platform-title">
              <Monitor size={25} />
              <h2>电脑网页版</h2>
            </div>
            <p>适合系统学习、长题阅读与模拟考试。</p>
            <div className="download-screen" aria-hidden="true">
              <div className="download-screen-bar">
                <img src="/kaojiang-logo-48.png" alt="" />
                <span>考匠学习空间</span>
              </div>
              <div className="download-screen-body">
                <div>
                  <span>章节练习</span>
                  <span>错题复习</span>
                  <span>模拟考试</span>
                </div>
                <div>
                  <BookPreview />
                </div>
              </div>
            </div>
            <span className="download-platform-meta">
              Windows / macOS · 浏览器直接使用
            </span>
            <button
              className="desk-button desk-primary"
              onClick={() => go("home")}
            >
              {authenticated ? "进入学习空间" : "前往登录学习"}
              <ArrowUpRight size={17} />
            </button>
            <small>无需安装，打开网页即可使用。</small>
          </section>

          <section className="download-platform">
            <div className="download-platform-title">
              <Smartphone size={25} />
              <h2>Android App</h2>
            </div>
            <p>随手刷题、回顾错题，把碎片时间用起来。</p>
            <div className="download-code-area" aria-busy={!release && !error}>
              {release ? (
                <>
                  <QRCodeSVG
                    value={release.downloadUrl}
                    size={132}
                    marginSize={2}
                    level="M"
                    title="Android 安装包下载二维码"
                  />
                  <span>用手机浏览器扫码下载</span>
                </>
              ) : error ? (
                <div className="download-error" role="alert">
                  <p>{error}</p>
                  <button onClick={() => setRevision((value) => value + 1)}>
                    <RefreshCw size={15} />
                    重新获取
                  </button>
                </div>
              ) : (
                <ContentPlaceholder variant="list" rows={1} />
              )}
            </div>
            <span className="download-platform-meta">
              {release
                ? `当前版本 v${release.latestVersion} · APK 安装包`
                : "Android 安装包"}
            </span>
            {release ? (
              <a
                className="desk-button desk-primary"
                href={release.downloadUrl}
              >
                <Download size={17} />
                下载 Android App
              </a>
            ) : (
              <button className="desk-button desk-primary" disabled>
                等待下载地址
              </button>
            )}
            {release && (
              <button
                className="download-copy"
                onClick={() => copy(release.downloadUrl, "Android 下载")}
              >
                <Copy size={14} />
                复制下载链接
              </button>
            )}
          </section>

          <section className="download-platform">
            <div className="download-platform-title">
              <Tablet size={25} />
              <h2>iPhone / iPad</h2>
            </div>
            <p>通过手机网页版学习，也可添加到主屏幕。</p>
            <div className="download-code-area">
              <QRCodeSVG
                value={mobileUrl}
                size={132}
                marginSize={2}
                level="M"
                title="iPhone 和 iPad 手机网页版二维码"
              />
              <span>使用相机扫码，在 Safari 中打开</span>
            </div>
            <span className="download-platform-meta">
              手机网页版 · Safari 浏览器
            </span>
            <a className="desk-button desk-secondary" href="/app/">
              <ArrowUpRight size={17} />
              打开手机网页版
            </a>
            <button
              className="download-copy"
              onClick={() => copy(mobileUrl, "手机网页版")}
            >
              <Copy size={14} />
              复制访问链接
            </button>
          </section>
        </div>

        <section
          className="download-help"
          aria-labelledby="download-help-title"
        >
          <div>
            <h2 id="download-help-title">换个设备，也能顺利开始。</h2>
            <p>安装与使用说明</p>
          </div>
          <div className="download-help-items">
            <details>
              <summary>iPhone / iPad 如何添加到主屏幕？</summary>
              <p>
                用 Safari
                打开手机网页版，轻点分享按钮，选择“添加到主屏幕”，再轻点“添加”。以后就能从主屏幕图标打开考匠。
              </p>
            </details>
            <details>
              <summary>Android 下载后如何安装？</summary>
              <p>
                使用手机浏览器下载
                APK，下载完成后打开文件，并按系统提示完成安装。在微信内无法下载时，请选择“在浏览器打开”。更新时使用同一正式签名的安装包，可覆盖安装。
              </p>
            </details>
            <details>
              <summary>更换设备后，学习记录还在吗？</summary>
              <p>
                在新设备登录同一账号，并选择相同的备考证书，即可查看已经提交的作答、错题与收藏。尚未提交的输入不会自动转移到另一台设备。
              </p>
            </details>
            {release?.releaseNotes && (
              <details>
                <summary>Android 最新版本更新了什么？</summary>
                <p>{release.releaseNotes}</p>
              </details>
            )}
          </div>
        </section>
      </main>
      <footer className="download-container download-footer">
        <span>考匠 AceExam</span>
        <span>
          <Check size={15} />
          学习记录跟随账号
        </span>
      </footer>
      <div className="download-copy-status" role="status" aria-live="polite">
        {copied}
      </div>
    </div>
  );
}

function BookPreview() {
  return (
    <>
      <strong>开始今天的练习</strong>
      <i />
      <i />
      <span>练习 · 理解 · 复习</span>
    </>
  );
}
