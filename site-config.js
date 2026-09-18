// ===== 站点配置（静态版 / GitHub Pages） =====
// 这个文件由 create-trip 生成，内容都会公开在页面上。
// ⚠ 绝对不要往这里写 GitHub 令牌 —— 令牌只能填在页面的「☁️ 云端同步」里（只存本机浏览器）。
// 下面那两把地图 Key 都会公开在页面上（静态页没有后端），只填这一趟用得上的那把：
//   · 国内行程（mapProvider: 'amap'）→ amapKey（高德 Web 服务 Key）
//   · 海外行程（mapProvider: 'google'）→ googleKey（已按网站来源限制的浏览器专用 Key）
window.TRIP_SITE_CONFIG = {
  // ⚠ 这里**故意不写 siteId**：bridge 的命名空间是 `siteId || dataRepo || cityName`，
  //   本站在加显式 siteId 之前就已经用派生值 `fenixlee0078-collab-bangkok-trip-data`
  //   存过令牌与缓存了。补一行 siteId 等于换命名空间 → 每台设备都会「令牌不见了」。
  //   派生值由 dataRepo 决定，只要第 20 行不变，命名空间就永远不变。
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

  // 国内搜索用的高德 Key / 行政区划码 —— 海外行程留空（高德没有海外 POI）
  amapKey: '',
  searchCity: '',

  // 行程数据存放位置（私有仓库）
  dataRepo: 'fenixlee0078-collab/bangkok-trip-data',
  dataPath: 'data.json'
};
