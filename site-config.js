// ===== 站点配置（静态版 / GitHub Pages） =====
// 这个文件由 create-trip 生成，内容都会公开在页面上。
// ⚠ 绝对不要往这里写 GitHub 令牌 —— 令牌只能填在页面的「☁️ 云端同步」里（只存本机浏览器）。
// 谷歌 Key 必须是「按网站来源限制」的那一把（浏览器专用），泄露也没法被别人盗用。
window.TRIP_SITE_CONFIG = {
  siteId: 'bangkok',
  // 行程级配置（对应服务端版的 /api/trip-config）
  mapProvider: 'google',                 // 'google'（海外）| 'amap'（国内）
  cityName: '曼谷+清迈',
  cityAliases: ['曼谷', '清迈', 'bangkok', 'chiang mai', 'chiangmai', 'krung thep', 'thailand', '泰国'],
  searchCenter: { lng: 100.5018, lat: 13.7563 },

  // 浏览器直连谷歌 Places API (New) 用的 Key
  // ⚠ 这把 Key 已在谷歌云做了「网站来源限制」＝只认 https://fenixlee0078-collab.github.io/*
  //   所以它公开在页面里也安全：别人抄走放到自己网站上会被谷歌 403 拒绝。
  // 留空也能用：可以在页面底部「☁️ 云端同步」里现场填，填了会覆盖这里的值、只存本机。
  googleKey: 'AIzaSyB1KScW8mgsnU080PJAbXRhRMqwjdhZMZo',

  // 行程数据存放位置（私有仓库）
  dataRepo: 'fenixlee0078-collab/bangkok-trip-data',
  dataPath: 'data.json'
};
