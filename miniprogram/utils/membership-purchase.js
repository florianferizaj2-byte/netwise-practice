const purchaseUrl = 'https://catfk.com/shop/aceexam';

function copyPurchaseLink() {
  wx.setClipboardData({
    data: purchaseUrl,
    success() {
      wx.showModal({
        title: '购买链接已复制',
        content: '请粘贴到浏览器打开。购买后回到考匠，输入兑换码开通或续期会员。',
        showCancel: false, confirmText: '知道了',
      });
    },
    fail() {
      wx.showModal({ title: '复制失败', content: `请在浏览器打开：${purchaseUrl}`, showCancel: false });
    },
  });
}

module.exports = { purchaseUrl, copyPurchaseLink };
