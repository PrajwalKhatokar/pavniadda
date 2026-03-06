const API_URL = "/api/chat";
const REQUEST_TIMEOUT_MS = 25000;
const CHAT_STORAGE_KEY = "chatadda_chats_v1";
const CURRENT_CHAT_KEY = "chatadda_current_chat_v1";

const chat = document.getElementById("chat");
const main = document.querySelector(".main");
const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const chatHistory = document.getElementById("chat-history");

let chats = [];
let currentChatId = null;

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function saveState() {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  if (currentChatId) {
    localStorage.setItem(CURRENT_CHAT_KEY, currentChatId);
  } else {
    localStorage.removeItem(CURRENT_CHAT_KEY);
  }
}

function loadState() {
  try {
    const storedChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
    chats = Array.isArray(storedChats) ? storedChats : [];
  } catch (error) {
    chats = [];
  }
  currentChatId = localStorage.getItem(CURRENT_CHAT_KEY);
}

function getCurrentChat() {
  return chats.find((item) => item.id === currentChatId) || null;
}

function getChatById(chatId) {
  return chats.find((item) => item.id === chatId) || null;
}

function applyModeForMessages(messages) {
  if (messages.length > 0) {
    main.classList.add("chat-mode");
  } else {
    main.classList.remove("chat-mode");
  }
}

function renderMessages() {
  const currentChat = getCurrentChat();
  const messages = currentChat?.messages || [];
  chat.innerHTML = "";
  for (const message of messages) {
    addMessage(message.role, message.content);
  }
  applyModeForMessages(messages);
}

function renderHistory() {
  chatHistory.innerHTML = "";

  if (chats.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-history";
    li.textContent = "No chats yet";
    chatHistory.appendChild(li);
    return;
  }

  for (const item of chats) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-item-btn";
    if (item.id === currentChatId) {
      btn.classList.add("active");
    }
    btn.textContent = item.title || "New chat";
    btn.addEventListener("click", () => {
      currentChatId = item.id;
      saveState();
      renderHistory();
      renderMessages();
    });
    li.appendChild(btn);
    chatHistory.appendChild(li);
  }
}

function createChat() {
  const chatItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [],
  };
  chats.unshift(chatItem);
  currentChatId = chatItem.id;
  saveState();
  renderHistory();
  renderMessages();
  input.focus();
}

function updateTitleIfNeeded(chatItem) {
  if (!chatItem || chatItem.title !== "New chat") return;
  const firstUserMessage = chatItem.messages.find((m) => m.role === "user");
  if (!firstUserMessage) return;

  const trimmed = firstUserMessage.content.trim();
  if (!trimmed) return;
  chatItem.title = trimmed.slice(0, 28) + (trimmed.length > 28 ? "..." : "");
}

function addMessageToChat(chatId, role, content) {
  const chatItem = getChatById(chatId);
  if (!chatItem) return;
  chatItem.messages.push({ role, content });
  updateTitleIfNeeded(chatItem);
  saveState();
}

async function getAIReply(userMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  let rawText = "";
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        message: userMessage,
      }),
    });
    rawText = await response.text();
  } finally {
    clearTimeout(timeoutId);
  }

  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.error || rawText || `Request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  if (!data?.reply || typeof data.reply !== "string") {
    throw new Error("Invalid response format from server.");
  }

  return data.reply;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  if (!getCurrentChat()) {
    createChat();
  }

  const activeChatId = currentChatId;
  addMessageToChat(activeChatId, "user", userMessage);
  renderHistory();
  applyModeForMessages(getCurrentChat().messages);
  addMessage("user", userMessage);
  input.value = "";
  input.focus();

  sendBtn.disabled = true;
  const thinkingMessage = addMessage("ai", "Thinking...");

  try {
    const aiReply = await getAIReply(userMessage);
    thinkingMessage.textContent = aiReply;
    addMessageToChat(activeChatId, "ai", aiReply);
  } catch (error) {
    if (error.name === "AbortError") {
      thinkingMessage.textContent =
        "Error: request timed out. Try a shorter prompt or a faster model.";
    } else {
      thinkingMessage.textContent = `Error: ${error.message}`;
    }
    addMessageToChat(activeChatId, "ai", thinkingMessage.textContent);
  } finally {
    sendBtn.disabled = false;
    renderHistory();
    renderMessages();
  }
});

newChatBtn.addEventListener("click", () => {
  createChat();
});

loadState();

if (chats.length === 0) {
  renderHistory();
  renderMessages();
} else {
  const existing = chats.find((item) => item.id === currentChatId);
  currentChatId = existing ? existing.id : chats[0].id;
  saveState();
  renderHistory();
  renderMessages();
}
