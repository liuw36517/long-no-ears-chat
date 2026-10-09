(() => {
  "use strict";

  const config = window.CHAT_CONFIG || {};
  const state = {
    client: null,
    session: null,
    user: null,
    profile: null,
    rooms: [],
    activeRoom: null,
    messages: [],
    profiles: new Map(),
    realtimeChannel: null,
    authMode: "login",
    toastTimer: null,
    loadingMessages: false
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const els = {
    authScreen: $("#authScreen"), appShell: $("#appShell"), authForm: $("#authForm"), authTitle: $("#authTitle"), authSubmit: $("#authSubmit"), authModeToggle: $("#authModeToggle"), authMessage: $("#authMessage"), configNotice: $("#configNotice"), nameField: $("#nameField"), displayName: $("#displayName"), email: $("#email"), password: $("#password"), themeToggleAuth: $("#themeToggleAuth"), themeToggle: $("#themeToggle"), roomList: $("#roomList"), roomSearch: $("#roomSearch"), newRoomButton: $("#newRoomButton"), profileButton: $("#profileButton"), logoutButton: $("#logoutButton"), userAvatar: $("#userAvatar"), userName: $("#userName"), userEmail: $("#userEmail"), mobileSidebarButton: $("#mobileSidebarButton"), sidebar: $("#sidebar"), roomAvatar: $("#roomAvatar"), roomName: $("#roomName"), roomDescription: $("#roomDescription"), roomInfoButton: $("#roomInfoButton"), roomInfoPanel: $("#roomInfoPanel"), closeRoomInfoButton: $("#closeRoomInfoButton"), roomInfoName: $("#roomInfoName"), roomInfoText: $("#roomInfoText"), messagesViewport: $("#messagesViewport"), messagesList: $("#messagesList"), loadingMessages: $("#loadingMessages"), emptyMessages: $("#emptyMessages"), messageSearch: $("#messageSearch"), messageForm: $("#messageForm"), messageInput: $("#messageInput"), sendButton: $("#sendButton"), characterCount: $("#characterCount"), connectionLabel: $("#connectionLabel"), emojiButton: $("#emojiButton"), emojiPicker: $("#emojiPicker"), toast: $("#toast"), roomDialog: $("#roomDialog"), roomForm: $("#roomForm"), roomTitleInput: $("#roomTitleInput"), roomDescriptionInput: $("#roomDescriptionInput"), roomMessage: $("#roomMessage"), profileDialog: $("#profileDialog"), profileForm: $("#profileForm"), profileNameInput: $("#profileNameInput"), profileEmailText: $("#profileEmailText"), profileMessage: $("#profileMessage")
  };

  const hasSupabaseConfig = () => {
    const url = String(config.supabaseUrl || "");
    const key = String(config.supabaseAnonKey || "");
    return Boolean(url && key && !url.includes("YOUR_PROJECT") && !key.includes("YOUR_PUBLISHABLE"));
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const initials = (name) => String(name || "龙").trim().slice(0, 1).toUpperCase();
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
  };
  const setMessage = (element, text, success = false) => { element.textContent = text || ""; element.classList.toggle("success", Boolean(success)); };
  const showToast = (text) => {
    els.toast.textContent = text;
    els.toast.classList.add("visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => els.toast.classList.remove("visible"), 3200);
  };
  const applyTheme = (theme) => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("chat-theme", theme);
    const symbol = theme === "light" ? "☾" : "☼";
    els.themeToggle.textContent = symbol;
    els.themeToggleAuth.textContent = symbol;
  };
  const toggleTheme = () => applyTheme(document.documentElement.classList.contains("light") ? "dark" : "light");
  const showAuth = () => { els.authScreen.classList.remove("hidden"); els.appShell.classList.add("hidden"); els.sidebar.classList.remove("open"); };
  const showApp = () => { els.authScreen.classList.add("hidden"); els.appShell.classList.remove("hidden"); };

  const setAuthMode = (mode) => {
    state.authMode = mode;
    const register = mode === "register";
    els.authTitle.textContent = register ? "创建通讯账号" : "登录通讯空间";
    els.authSubmit.textContent = register ? "创建账号" : "登录";
    els.authModeToggle.textContent = register ? "已有账号？返回登录" : "没有账号？创建一个";
    els.nameField.classList.toggle("hidden", !register);
    els.password.autocomplete = register ? "new-password" : "current-password";
    setMessage(els.authMessage, "");
  };

  const initClient = () => {
    if (!hasSupabaseConfig()) {
      els.configNotice.classList.remove("hidden");
      els.authForm.querySelectorAll("input, button").forEach((input) => { input.disabled = true; });
      return false;
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      setMessage(els.authMessage, "Supabase 客户端加载失败，请检查网络连接后刷新。");
      return false;
    }
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
    return true;
  };

  const loadProfile = async (user) => {
    const { data, error } = await state.client.from("profiles").select("id, username, avatar_color").eq("id", user.id).maybeSingle();
    if (error) throw error;
    const fallbackName = user.user_metadata?.username || user.email?.split("@")[0] || "新朋友";
    if (!data) {
      const { data: created, error: createError } = await state.client.from("profiles").upsert({ id: user.id, username: fallbackName, avatar_color: "#63c8aa" }).select().single();
      if (createError) throw createError;
      state.profile = created;
    } else state.profile = data;
    els.userName.textContent = state.profile.username;
    els.userEmail.textContent = user.email || "";
    els.userAvatar.textContent = initials(state.profile.username);
    els.profileNameInput.value = state.profile.username;
    els.profileEmailText.textContent = user.email || "";
  };

  const ensureRoom = async () => {
    if (state.rooms.length) return;
    const { data, error } = await state.client.from("rooms").insert({ name: "大厅", description: "欢迎来到公共聊天空间", is_public: true, owner_id: state.user.id }).select().single();
    if (error) throw error;
    await state.client.from("room_members").upsert({ room_id: data.id, user_id: state.user.id, role: "owner" });
    state.rooms = [data];
  };

  const refreshRooms = async () => {
    const { data, error } = await state.client.from("rooms").select("id,name,description,is_public,owner_id,created_at").order("created_at", { ascending: true });
    if (error) throw error;
    state.rooms = data || [];
    await ensureRoom();
    renderRooms();
    if (!state.activeRoom || !state.rooms.some((room) => room.id === state.activeRoom.id)) await selectRoom(state.rooms[0]);
  };

  const renderRooms = () => {
    const query = els.roomSearch.value.trim().toLowerCase();
    const rooms = state.rooms.filter((room) => !query || `${room.name} ${room.description}`.toLowerCase().includes(query));
    if (!rooms.length) { els.roomList.innerHTML = `<p class="muted-copy" style="padding: 10px 4px;">没有匹配的会话</p>`; return; }
    els.roomList.innerHTML = rooms.map((room) => `<button class="room-item ${state.activeRoom?.id === room.id ? "active" : ""}" data-room-id="${escapeHtml(room.id)}" type="button"><span class="room-item-avatar">${escapeHtml(initials(room.name))}</span><span class="room-item-copy"><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.description || (room.is_public ? "公共会话" : "私密会话"))}</small></span></button>`).join("");
    $$(".room-item").forEach((button) => button.addEventListener("click", () => { const room = state.rooms.find((item) => item.id === button.dataset.roomId); if (room) selectRoom(room); }));
  };

  const loadProfiles = async (messages) => {
    const ids = [...new Set(messages.map((message) => message.sender_id).filter(Boolean))];
    if (!ids.length) return;
    const { data, error } = await state.client.from("profiles").select("id,username,avatar_color").in("id", ids);
    if (error) throw error;
    (data || []).forEach((profile) => state.profiles.set(profile.id, profile));
  };

  const loadMessages = async () => {
    if (!state.activeRoom) return;
    state.loadingMessages = true;
    els.loadingMessages.classList.remove("hidden");
    els.emptyMessages.classList.add("hidden");
    els.messagesList.innerHTML = "";
    try {
      const { data, error } = await state.client.from("messages").select("id,room_id,sender_id,body,created_at,edited_at").eq("room_id", state.activeRoom.id).order("created_at", { ascending: true }).limit(200);
      if (error) throw error;
      state.messages = data || [];
      await loadProfiles(state.messages);
      renderMessages(true);
    } finally {
      state.loadingMessages = false;
      els.loadingMessages.classList.add("hidden");
    }
  };

  const renderMessages = (scrollToBottom = false) => {
    const query = els.messageSearch.value.trim().toLowerCase();
    const visible = state.messages.filter((message) => !query || message.body.toLowerCase().includes(query));
    els.emptyMessages.classList.toggle("hidden", visible.length > 0);
    els.messagesList.innerHTML = visible.map((message) => {
      const profile = state.profiles.get(message.sender_id) || { username: "新朋友", avatar_color: "#63c8aa" };
      const own = message.sender_id === state.user?.id;
      const edited = message.edited_at ? `<span class="message-edited">已编辑</span>` : "";
      return `<article class="message-row ${own ? "own" : ""}" data-message-id="${escapeHtml(message.id)}"><span class="message-avatar" style="background:${escapeHtml(profile.avatar_color || "#63c8aa")}">${escapeHtml(initials(profile.username))}</span><div class="message-stack"><div class="message-meta"><strong>${escapeHtml(own ? "你" : profile.username)}</strong><time>${escapeHtml(formatTime(message.created_at))}</time>${edited}</div><div class="message-bubble">${escapeHtml(message.body)}</div></div></article>`;
    }).join("");
    if (scrollToBottom) requestAnimationFrame(() => { els.messagesViewport.scrollTop = els.messagesViewport.scrollHeight; });
  };

  const subscribeRealtime = () => {
    if (state.realtimeChannel) state.client.removeChannel(state.realtimeChannel);
    state.realtimeChannel = state.client.channel("messages-stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        if (!state.activeRoom || payload.new.room_id !== state.activeRoom.id || state.messages.some((item) => item.id === payload.new.id)) return;
        state.messages.push(payload.new);
        try { await loadProfiles([payload.new]); } catch (error) { console.error(error); }
        renderMessages(true);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => { const index = state.messages.findIndex((item) => item.id === payload.new.id); if (index !== -1) state.messages[index] = payload.new; renderMessages(false); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => { state.messages = state.messages.filter((item) => item.id !== payload.old.id); renderMessages(false); })
      .subscribe((status) => { els.connectionLabel.textContent = status === "SUBSCRIBED" ? "实时同步已开启" : "正在连接实时服务…"; });
  };

  const selectRoom = async (room) => {
    if (!room) return;
    state.activeRoom = room;
    els.roomName.textContent = room.name;
    els.roomDescription.textContent = room.description || (room.is_public ? "公共聊天空间" : "私密聊天空间");
    els.roomAvatar.textContent = initials(room.name);
    els.roomInfoName.textContent = room.name;
    els.roomInfoText.textContent = room.description || (room.is_public ? "公共会话，登录用户都可以加入并发送消息。" : "私密会话。");
    renderRooms();
    els.sidebar.classList.remove("open");
    try { await loadMessages(); } catch (error) { console.error(error); showToast(error.message || "消息加载失败"); }
  };

  const enterApp = async (session) => {
    if (state.session?.user?.id === session.user.id && !els.appShell.classList.contains("hidden")) return;
    state.session = session;
    state.user = session.user;
    showApp();
    try { await loadProfile(state.user); await refreshRooms(); subscribeRealtime(); }
    catch (error) { console.error(error); showToast(error.message || "初始化聊天空间失败，请检查数据库策略"); }
  };

  const handleAuth = async (event) => {
  event.preventDefault();

  if (!state.client) return;

  const email = els.email.value.trim();
  const password = els.password.value;
  const username = els.displayName.value.trim();

  els.authSubmit.disabled = true;

  try {
    if (state.authMode === "register") {

      if (!username) {
        throw new Error("请输入显示名称");
      }

      const { data, error } = await state.client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username
          }
        }
      });

      if (error) throw error;

      setMessage(
        els.authMessage,
        "账号创建成功，请登录",
        true
      );

    } else {

      const { data, error } =
        await state.client.auth.signInWithPassword({
          email: email,
          password: password
        });

      if (error) throw error;

      if (data.session) {
        await enterApp(data.session);
      }
    }

  } catch (error) {

    console.error(error);

    setMessage(
      els.authMessage,
      error.message || "操作失败"
    );

  } finally {

    els.authSubmit.disabled = false;

  }
};

  const sendMessage = async (event) => {
    event.preventDefault();
    const body = els.messageInput.value.trim();
    if (!body || !state.activeRoom || !state.user || els.sendButton.disabled) return;
    els.sendButton.disabled = true;
    try {
      const { data, error } = await state.client.from("messages").insert({ room_id: state.activeRoom.id, sender_id: state.user.id, body }).select("id,room_id,sender_id,body,created_at,edited_at").single();
      if (error) throw error;
      if (data && !state.messages.some((item) => item.id === data.id)) { state.messages.push(data); state.profiles.set(state.user.id, state.profile); renderMessages(true); }
      els.messageInput.value = "";
      updateComposerState();
      autosizeComposer();
    } catch (error) { showToast(error.message || "发送失败，请检查数据库策略"); }
    finally { els.sendButton.disabled = false; }
  };
  const updateComposerState = () => { els.characterCount.textContent = `${els.messageInput.value.length} / 2000`; };
  const autosizeComposer = () => { els.messageInput.style.height = "auto"; els.messageInput.style.height = `${Math.min(145, els.messageInput.scrollHeight)}px`; };

  const handleCreateRoom = async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const name = els.roomTitleInput.value.trim();
    const description = els.roomDescriptionInput.value.trim();
    if (!name) return;
    els.roomSubmit.disabled = true;
    setMessage(els.roomMessage, "正在创建…");
    try {
      const { data, error } = await state.client.from("rooms").insert({ name, description, is_public: true, owner_id: state.user.id }).select().single();
      if (error) throw error;
      await state.client.from("room_members").upsert({ room_id: data.id, user_id: state.user.id, role: "owner" });
      state.rooms.push(data);
      renderRooms();
      els.roomDialog.close();
      els.roomForm.reset();
      await selectRoom(data);
      showToast("会话已创建");
    } catch (error) { setMessage(els.roomMessage, error.message || "创建失败"); }
    finally { els.roomSubmit.disabled = false; }
  };

  const handleProfileSave = async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const username = els.profileNameInput.value.trim();
    if (!username) return;
    const submit = els.profileForm.querySelector("button[value=default]");
    submit.disabled = true;
    setMessage(els.profileMessage, "正在保存…");
    try {
      const { data, error } = await state.client.from("profiles").update({ username, updated_at: new Date().toISOString() }).eq("id", state.user.id).select().single();
      if (error) throw error;
      state.profile = data;
      state.profiles.set(state.user.id, data);
      els.userName.textContent = username;
      els.userAvatar.textContent = initials(username);
      renderMessages(false);
      els.profileDialog.close();
      showToast("个人资料已保存");
    } catch (error) { setMessage(els.profileMessage, error.message || "保存失败"); }
    finally { submit.disabled = false; }
  };

  const bindEvents = () => {
    els.authForm.addEventListener("submit", handleAuth);
    els.authModeToggle.addEventListener("click", () => setAuthMode(state.authMode === "login" ? "register" : "login"));
    els.themeToggle.addEventListener("click", toggleTheme);
    els.themeToggleAuth.addEventListener("click", toggleTheme);
    els.roomSearch.addEventListener("input", renderRooms);
    els.messageSearch.addEventListener("input", () => renderMessages(false));
    els.newRoomButton.addEventListener("click", () => { setMessage(els.roomMessage, ""); els.roomDialog.showModal(); setTimeout(() => els.roomTitleInput.focus(), 0); });
    els.roomForm.addEventListener("submit", handleCreateRoom);
    els.profileButton.addEventListener("click", () => { setMessage(els.profileMessage, ""); els.profileNameInput.value = state.profile?.username || ""; els.profileDialog.showModal(); });
    els.profileForm.addEventListener("submit", handleProfileSave);
    els.logoutButton.addEventListener("click", async () => { if (state.realtimeChannel) state.client.removeChannel(state.realtimeChannel); if (state.client) await state.client.auth.signOut(); state.realtimeChannel = null; state.session = null; state.user = null; state.activeRoom = null; showAuth(); });
    els.messageForm.addEventListener("submit", sendMessage);
    els.messageInput.addEventListener("input", () => { updateComposerState(); autosizeComposer(); });
    els.messageInput.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); els.messageForm.requestSubmit(); } });
    els.emojiButton.addEventListener("click", () => els.emojiPicker.classList.toggle("hidden"));
    $$("#emojiPicker button").forEach((button) => button.addEventListener("click", () => { els.messageInput.value += button.textContent; updateComposerState(); autosizeComposer(); els.emojiPicker.classList.add("hidden"); els.messageInput.focus(); }));
    els.roomInfoButton.addEventListener("click", () => els.roomInfoPanel.classList.toggle("hidden"));
    els.closeRoomInfoButton.addEventListener("click", () => els.roomInfoPanel.classList.add("hidden"));
    els.mobileSidebarButton.addEventListener("click", () => els.sidebar.classList.toggle("open"));
    document.addEventListener("click", (event) => { if (!els.emojiPicker.contains(event.target) && event.target !== els.emojiButton) els.emojiPicker.classList.add("hidden"); });
  };

  const init = async () => {
    applyTheme(localStorage.getItem("chat-theme") || "dark");
    setAuthMode("login");
    bindEvents();
    if (!initClient()) return;
    state.client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { showAuth(); return; }
      if (event === "SIGNED_IN" && session) window.setTimeout(() => enterApp(session), 0);
    });
    const { data, error } = await state.client.auth.getSession();
    if (error) { setMessage(els.authMessage, error.message); return; }
    if (data.session) await enterApp(data.session);
  };

  init();
})();

async function loadMessages(){

const {data,error}=await supabase
.from("messages")
.select("*")
.order("created_at");

if(data){
 data.forEach(msg=>{
   renderMessage(msg);
 });
}

}
