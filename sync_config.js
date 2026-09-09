// ============================================================
// 内置共享 Supabase 配置（让“任何电脑打开链接”都能自动连云端）
// ------------------------------------------------------------
// 重要：当前 Supabase 表已对 anon 开放读写（见 supabase_schema.sql），
// 因此这个 anon key 本就不是秘密，内置到应用里不会改变风险等级。
// 把下面 url / key 填成和「☁️ 数据同步」页里一样的 Project URL / anon key，
// 重新部署后，其他人点开链接就会自动连接云端并在登录后自动拉取数据。
// （如要更严格权限，请改用带登录鉴权的 Supabase 方案。）
// ============================================================
window.APP_SUPABASE = {
  url: 'https://apcceqidfxqtyndpumgb.supabase.co',
  key: 'sb_publishable_1d9dDpv82O8Krd35hmcs-g_0Ny5Sm5U'
};
